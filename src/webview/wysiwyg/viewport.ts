import { DiagramModel, nodeSize, groupBounds } from '../../core';
import { allowedRange, overshootOf, dampenDelta, springStep, VISIBLE_MARGIN, OVERSHOOT_CAP } from './panLimits';

const PAD = 40;

export function computeContentBounds(model: DiagramModel): { minX: number; minY: number; maxX: number; maxY: number } {
  if (model.nodes.length === 0 && model.groups.length === 0) { return { minX: 0, minY: 0, maxX: 400, maxY: 300 }; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of model.nodes) {
    const { w, h } = nodeSize(model, n);
    minX = Math.min(minX, n.x - w / 2);
    minY = Math.min(minY, n.y - h / 2);
    maxX = Math.max(maxX, n.x + w / 2);
    maxY = Math.max(maxY, n.y + h / 2);
  }
  // Subgraph boxes extend above/around their members (title band + padding), so
  // fit must account for them or the box top spills past the viewport edge.
  for (const g of model.groups) {
    const b = groupBounds(model, g);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { minX: minX - PAD, minY: minY - PAD, maxX: maxX + PAD, maxY: maxY + PAD };
}

export class Viewport {
  private zoom = 1;
  private vbX = 0;
  private vbY = 0;
  private contentBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  private springHandle: number | null = null;
  private lastSpringTs = 0;
  constructor(private readonly svg: SVGSVGElement, private readonly host: HTMLElement) {}

  private apply(): void {
    const w = this.host.clientWidth / this.zoom;
    const h = this.host.clientHeight / this.zoom;
    this.svg.setAttribute('viewBox', `${this.vbX} ${this.vbY} ${w} ${h}`);
  }
  fit(model: DiagramModel): void {
    const b = computeContentBounds(model);
    this.setContentBounds(b);
    const cw = this.host.clientWidth || 800;
    const ch = this.host.clientHeight || 600;
    const zx = cw / (b.maxX - b.minX);
    const zy = ch / (b.maxY - b.minY);
    this.zoom = Math.min(1, Math.min(zx, zy));
    this.vbX = b.minX;
    this.vbY = b.minY;
    this.apply();
  }
  zoomBy(factor: number, cx: number, cy: number): void {
    const p = this.screenToSvg(cx, cy);
    this.zoom = Math.min(4, Math.max(0.1, this.zoom * factor));
    const after = this.screenToSvg(cx, cy);
    this.vbX += p.x - after.x;
    this.vbY += p.y - after.y;
    this.snapIntoBounds();
  }

  /** Bounds the pan clamp is measured against. Until this is set the viewport
   *  pans unbounded — an unclamped fallback beats throwing on a stub host. */
  setContentBounds(b: { minX: number; minY: number; maxX: number; maxY: number }): void {
    this.contentBounds = b;
  }

  get hostHeight(): number { return this.host.clientHeight; }

  /** Allowed viewBox-origin range on one axis, or null when unbounded. */
  private rangeFor(axis: 'x' | 'y'): { lo: number; hi: number } | null {
    const b = this.contentBounds;
    if (!b) { return null; }
    const margin = VISIBLE_MARGIN / this.zoom;
    return axis === 'x'
      ? allowedRange(b.minX, b.maxX, this.host.clientWidth / this.zoom, margin)
      : allowedRange(b.minY, b.maxY, this.host.clientHeight / this.zoom, margin);
  }

  /** Move one axis by a viewBox-space delta, damping motion that pushes further
   *  out of bounds and hard-stopping at the overshoot cap. Inward motion is
   *  never damped, so escaping the boundary feels immediate. */
  private axisPan(v: number, deltaVb: number, axis: 'x' | 'y'): number {
    const r = this.rangeFor(axis);
    if (!r) { return v + deltaVb; }
    const over = overshootOf(v, r.lo, r.hi);
    const outward = (over > 0 && deltaVb > 0) || (over < 0 && deltaVb < 0);
    const applied = outward
      ? dampenDelta(deltaVb, Math.abs(over) * this.zoom, OVERSHOOT_CAP)
      : deltaVb;
    // A single very large delta could clear the asymptote in one step, so the
    // cap is also enforced as a hard stop.
    const cap = OVERSHOOT_CAP / this.zoom;
    return Math.min(r.hi + cap, Math.max(r.lo - cap, v + applied));
  }

  /** A wheel event mid-settle must win over the spring — otherwise the very
   *  next animation frame overwrites the user's pan with `hi + next` and the
   *  gesture is silently swallowed. Resetting lastSpringTs too means a later
   *  settle() starts from the synthetic first frame, not a stale timestamp. */
  panBy(dxScreen: number, dyScreen: number): void {
    this.cancelSpring();
    this.vbX = this.axisPan(this.vbX, -dxScreen / this.zoom, 'x');
    this.vbY = this.axisPan(this.vbY, -dyScreen / this.zoom, 'y');
    this.apply();
  }

  /** One axis's worth of spring decay for the current frame: the new value,
   *  and whether it's still moving (so the caller knows to schedule another
   *  frame). Returns unchanged/not-moving when unbounded or already at rest. */
  private axisSpring(v: number, axis: 'x' | 'y', dt: number): { v: number; moving: boolean } {
    const r = this.rangeFor(axis);
    if (!r) { return { v, moving: false }; }
    const over = overshootOf(v, r.lo, r.hi);
    if (over === 0) { return { v, moving: false }; }
    const next = springStep(Math.abs(over) * this.zoom, dt) / this.zoom;
    return { v: (over > 0 ? r.hi : r.lo) + (over > 0 ? next : -next), moving: next !== 0 };
  }

  /** Animate any overshoot back to the boundary. Callers arm this once the
   *  gesture has gone idle — the wheel has no release event. */
  settle(): void {
    if (this.springHandle !== null) { return; }
    if (typeof requestAnimationFrame === 'undefined') { this.snapIntoBounds(); return; }
    const step = (ts: number): void => {
      const dt = this.lastSpringTs === 0 ? 16 : ts - this.lastSpringTs;
      this.lastSpringTs = ts;
      const rx = this.axisSpring(this.vbX, 'x', dt);
      this.vbX = rx.v;
      const ry = this.axisSpring(this.vbY, 'y', dt);
      this.vbY = ry.v;
      this.apply();
      if (rx.moving || ry.moving) {
        this.springHandle = requestAnimationFrame(step);
      } else {
        this.springHandle = null;
        this.lastSpringTs = 0;
      }
    };
    this.springHandle = requestAnimationFrame(step);
  }

  /** Cancel any in-flight spring frame and reset its timing state, without
   *  touching vbX/vbY. Shared by panBy (which then applies a fresh pan) and
   *  dispose (which then hard-snaps). */
  private cancelSpring(): void {
    if (this.springHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.springHandle);
    }
    this.springHandle = null;
    this.lastSpringTs = 0;
  }

  /** Stop any animation and hard-snap into bounds. repaint() throws this
   *  Viewport away and builds a new one from getTransform(), so an in-flight
   *  spring would otherwise tick against a detached svg and the replacement
   *  would inherit an out-of-bounds origin. */
  dispose(): void {
    this.cancelSpring();
    this.snapIntoBounds();
  }

  private snapIntoBounds(): void {
    const rx = this.rangeFor('x');
    if (rx) { this.vbX = Math.min(rx.hi, Math.max(rx.lo, this.vbX)); }
    const ry = this.rangeFor('y');
    if (ry) { this.vbY = Math.min(ry.hi, Math.max(ry.lo, this.vbY)); }
    this.apply();
  }
  /** Snap the origin back inside the allowed range. repaint() restores a
   *  carried-over transform that may no longer be in bounds after the model
   *  changed under it. */
  clampToBounds(): void { this.snapIntoBounds(); }
  screenToSvg(px: number, py: number): { x: number; y: number } {
    const rect = this.host.getBoundingClientRect();
    return { x: this.vbX + (px - rect.left) / this.zoom, y: this.vbY + (py - rect.top) / this.zoom };
  }
  getTransform(): { zoom: number; vbX: number; vbY: number } {
    return { zoom: this.zoom, vbX: this.vbX, vbY: this.vbY };
  }
  setTransform(t: { zoom: number; vbX: number; vbY: number }): void {
    this.zoom = t.zoom; this.vbX = t.vbX; this.vbY = t.vbY; this.apply();
  }
  /** Re-derive the viewBox from the host's current size, keeping pan and zoom.
   *  Nothing else recomputes it when the host resizes, which otherwise
   *  letterboxes the diagram and desyncs screenToSvg. Also reclamps: `lo`
   *  moves with viewSize, so an origin parked at the boundary before a shrink
   *  (e.g. toggling the 141px-wide shape palette) would otherwise be left
   *  stranded outside the new, tighter range — up to fully off-screen. */
  resize(): void { this.snapIntoBounds(); }
  reset(): void { this.zoom = 1; this.apply(); }
  get scale(): number { return this.zoom; }
}
