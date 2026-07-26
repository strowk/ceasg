import { estimateNodeSize, newEdgeId } from '../../core';
import { nodeAtPoint, nodesInRect, anchorAtPoint } from './hitTest';
import { Overlay } from './overlay';
import type { WysiwygEditor } from './editor';

export class SelectionState {
  single: string | null = null;
  multi = new Set<string>();
  select(id: string): void { this.single = id; this.multi = new Set([id]); }
  toggle(id: string): void {
    if (this.multi.has(id)) { this.multi.delete(id); } else { this.multi.add(id); }
    this.single = this.multi.size === 1 ? [...this.multi][0] : null;
  }
  clear(): void { this.single = null; this.multi.clear(); }
  has(id: string): boolean { return this.multi.has(id); }
}

type Mode = 'select' | 'connect';

export class PointerController {
  private down: { x: number; y: number } | null = null;
  private dragging = false;
  private dragIds: string[] = [];
  private last = { x: 0, y: 0 };
  private marqueeStart: { x: number; y: number } | null = null;
  private connectFrom: string | null = null;
  private connectFromPt: { x: number; y: number } | null = null;
  private panning = false;
  private spaceDown = false;
  private capturedPointerId: number | null = null;
  mode: Mode = 'select';

  private boundKeyDown = (e: KeyboardEvent): void => { if (e.code === 'Space') { this.spaceDown = true; } };
  private boundKeyUp = (e: KeyboardEvent): void => { if (e.code === 'Space') { this.spaceDown = false; } };

  constructor(
    private readonly editor: WysiwygEditor,
    readonly selection: SelectionState,
    private readonly onSelectionChange: () => void,
  ) {}

  attach(svg: SVGSVGElement): void {
    svg.addEventListener('pointerdown', (e) => this.onDown(e, svg));
    svg.addEventListener('pointermove', (e) => this.onMove(e));
    svg.addEventListener('pointerup', (e) => this.onUp(e));
    svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    if (this.capturedPointerId !== null) {
      svg.setPointerCapture(this.capturedPointerId);
    }
  }

  private pt(e: PointerEvent): { x: number; y: number } {
    return this.editor.viewport!.screenToSvg(e.clientX, e.clientY);
  }

  private onDown(e: PointerEvent, svg: SVGSVGElement): void {
    svg.setPointerCapture(e.pointerId);
    this.capturedPointerId = e.pointerId;
    const p = this.pt(e);
    this.down = p; this.last = { x: e.clientX, y: e.clientY };
    const model = this.editor.getModel();

    if (this.spaceDown || e.button === 1) { this.panning = true; return; }

    const anchor = anchorAtPoint(model, p.x, p.y, 10 / this.editor.viewport!.scale);
    if (anchor || this.mode === 'connect') {
      const nodeId = anchor ? anchor.id : nodeAtPoint(model, p.x, p.y)?.id ?? null;
      if (nodeId) {
        this.connectFrom = nodeId;
        const node = model.nodes.find((n) => n.id === nodeId)!;
        if (anchor) {
          const w = node.w ?? estimateNodeSize(node).w;
          const h = node.h ?? estimateNodeSize(node).h;
          const bx = node.x - w / 2;
          const by = node.y - h / 2;
          const anchorPts: Record<string, { x: number; y: number }> = {
            N: { x: node.x, y: by },
            S: { x: node.x, y: by + h },
            E: { x: bx + w, y: node.y },
            W: { x: bx, y: node.y },
          };
          this.connectFromPt = anchorPts[anchor.dir];
        } else {
          this.connectFromPt = { x: node.x, y: node.y };
        }
        return;
      }
    }

    const node = nodeAtPoint(model, p.x, p.y);
    if (node) {
      if (e.shiftKey) { this.selection.toggle(node.id); }
      else if (!this.selection.has(node.id)) { this.selection.select(node.id); }
      this.dragIds = this.selection.multi.size > 0 ? [...this.selection.multi] : [node.id];
      this.dragging = true;
      this.onSelectionChange();
      return;
    }
    // background → marquee
    this.selection.clear();
    this.marqueeStart = p;
    this.onSelectionChange();
  }

  private onMove(e: PointerEvent): void {
    const p = this.pt(e);
    if (this.panning) {
      this.editor.viewport!.panBy(e.clientX - this.last.x, e.clientY - this.last.y);
      this.last = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.dragging && this.down) {
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      this.down = p;
      this.editor.mutate((m) => {
        for (const id of this.dragIds) {
          const n = m.nodes.find((nn) => nn.id === id);
          if (n && !n.locked) { n.x += dx; n.y += dy; }
        }
      });
      return;
    }
    if (this.connectFrom) {
      const fromPt = this.connectFromPt ?? (() => {
        const from = this.editor.getModel().nodes.find((n) => n.id === this.connectFrom)!;
        return { x: from.x, y: from.y };
      })();
      this.editor.repaint();
      this.overlay0().ghostLine(fromPt.x, fromPt.y, p.x, p.y);
      return;
    }
    if (this.marqueeStart) {
      const x = Math.min(this.marqueeStart.x, p.x);
      const y = Math.min(this.marqueeStart.y, p.y);
      const w = Math.abs(p.x - this.marqueeStart.x);
      const h = Math.abs(p.y - this.marqueeStart.y);
      this.editor.repaint();
      this.overlay0().marquee(x, y, w, h);
    }
  }

  private onUp(e: PointerEvent): void {
    const p = this.pt(e);
    if (this.panning) {
      this.panning = false; this.down = null;
    } else if (this.dragging) {
      this.dragging = false; this.editor.commit(); this.down = null;
    } else if (this.connectFrom) {
      const target = nodeAtPoint(this.editor.getModel(), p.x, p.y);
      if (target && target.id !== this.connectFrom) {
        const from = this.connectFrom;
        this.editor.mutate((m) => {
          m.edges.push({ id: newEdgeId(), from, to: target.id, label: '', kind: 'arrow' });
        }, { commit: true });
      } else { this.editor.repaint(); }
      this.connectFrom = null;
      this.connectFromPt = null;
    } else if (this.marqueeStart) {
      const x = Math.min(this.marqueeStart.x, p.x);
      const y = Math.min(this.marqueeStart.y, p.y);
      const w = Math.abs(p.x - this.marqueeStart.x);
      const h = Math.abs(p.y - this.marqueeStart.y);
      if (w > 3 || h > 3) {
        for (const id of nodesInRect(this.editor.getModel(), { x, y, w, h })) { this.selection.multi.add(id); }
        this.selection.single = this.selection.multi.size === 1 ? [...this.selection.multi][0] : null;
      }
      this.marqueeStart = null;
      this.editor.repaint();
      this.onSelectionChange();
    }
    this.capturedPointerId = null;
  }

  private onWheel(e: WheelEvent): void {
    if (!(e.ctrlKey || e.metaKey)) { return; }
    e.preventDefault();
    this.editor.viewport!.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  }

  // overlay is recreated on each repaint(); fetch the live one from the editor
  private overlay0(): Overlay { return this.editor.overlay!; }
}

