import { DiagramModel, DiagramNode, estimateNodeSize } from '../../core';

const PAD = 40;

function sizeOf(n: DiagramNode): { w: number; h: number } {
  return { w: n.w ?? estimateNodeSize(n).w, h: n.h ?? estimateNodeSize(n).h };
}

export function computeContentBounds(model: DiagramModel): { minX: number; minY: number; maxX: number; maxY: number } {
  if (model.nodes.length === 0) { return { minX: 0, minY: 0, maxX: 400, maxY: 300 }; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of model.nodes) {
    const { w, h } = sizeOf(n);
    minX = Math.min(minX, n.x - w / 2);
    minY = Math.min(minY, n.y - h / 2);
    maxX = Math.max(maxX, n.x + w / 2);
    maxY = Math.max(maxY, n.y + h / 2);
  }
  return { minX: minX - PAD, minY: minY - PAD, maxX: maxX + PAD, maxY: maxY + PAD };
}

export class Viewport {
  private zoom = 1;
  private vbX = 0;
  private vbY = 0;
  constructor(private readonly svg: SVGSVGElement, private readonly host: HTMLElement) {}

  private apply(): void {
    const w = this.host.clientWidth / this.zoom;
    const h = this.host.clientHeight / this.zoom;
    this.svg.setAttribute('viewBox', `${this.vbX} ${this.vbY} ${w} ${h}`);
  }
  fit(model: DiagramModel): void {
    const b = computeContentBounds(model);
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
    this.apply();
  }
  panBy(dxScreen: number, dyScreen: number): void {
    this.vbX -= dxScreen / this.zoom;
    this.vbY -= dyScreen / this.zoom;
    this.apply();
  }
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
  reset(): void { this.zoom = 1; this.apply(); }
  get scale(): number { return this.zoom; }
}
