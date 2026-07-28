import { newEdgeId, translateGroup, groupBounds as groupBoundsLocal } from '../../core';
import { nodeAtPoint, nodesInRect, anchorForNode, nodeAnchorPoints, edgeAtPoint, groupAtPoint, groupHandleAtPoint, resizeBox, EDGE_HIT_TOLERANCE } from './hitTest';
import { Overlay } from './overlay';
import type { WysiwygEditor } from './editor';
import { reassignNodeMembership, reassignGroupParent } from './editor';

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
  /** Whether the pointer actually moved past the drag threshold since press.
   *  A plain click must NOT repaint — repaint swaps the <svg> and the browser
   *  then never fires dblclick (breaking double-click-to-rename). */
  private moved = false;
  private dragIds: string[] = [];
  private groupDragId: string | null = null;
  private last = { x: 0, y: 0 };
  private marqueeStart: { x: number; y: number } | null = null;
  private connectFrom: string | null = null;
  private connectFromPt: { x: number; y: number } | null = null;
  /** true when connectFrom is set via click-click mode (waiting for second click), not anchor-drag */
  private connectClickWaiting = false;
  private panning = false;
  private spaceDown = false;
  private capturedPointerId: number | null = null;
  private resize: { groupId: string; corner: import('./hitTest').Corner } | null = null;
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
    this.groupDragId = null;
    this.moved = false;

    if (this.spaceDown || e.button === 1) { this.panning = true; return; }

    // Connection handles: drag from one of the selected node's four circles to
    // another node to create an edge. Handles only exist on the selected node,
    // so nearby unselected nodes never hijack a click.
    if (this.mode !== 'connect' && this.selection.single) {
      const selNode = model.nodes.find((n) => n.id === this.selection.single);
      if (selNode) {
        const dir = anchorForNode(model, selNode, p.x, p.y, 9 / this.editor.viewport!.scale);
        if (dir) {
          const pt = nodeAnchorPoints(model, selNode).find((a) => a.dir === dir)!;
          this.connectFrom = selNode.id;
          this.connectFromPt = { x: pt.x, y: pt.y };
          return;
        }
      }
    }

    // Click-click connect mode
    if (this.mode === 'connect') {
      const clickedNode = nodeAtPoint(model, p.x, p.y);
      if (clickedNode) {
        if (!this.connectFrom) {
          // First click: set source node, wait for second click
          this.connectFrom = clickedNode.id;
          this.connectFromPt = { x: clickedNode.x, y: clickedNode.y };
          this.connectClickWaiting = true;
          this.editor.repaint();
          return;
        } else if (clickedNode.id !== this.connectFrom) {
          // Second click on a different node: create edge
          const from = this.connectFrom;
          this.connectFrom = null;
          this.connectFromPt = null;
          this.connectClickWaiting = false;
          this.editor.mutate((m) => {
            m.edges.push({ id: newEdgeId(), from, to: clickedNode.id, label: '', kind: 'arrow' });
          }, { commit: true });
          return;
        } else {
          // Clicked same source again: cancel
          this.connectFrom = null;
          this.connectFromPt = null;
          this.connectClickWaiting = false;
          this.editor.repaint();
          return;
        }
      }
      // Clicked background in connect mode: cancel, do NOT start marquee
      this.connectFrom = null;
      this.connectFromPt = null;
      this.connectClickWaiting = false;
      this.editor.repaint();
      return;
    }

    if (this.selection.single && this.editor.isGroupId(this.selection.single)) {
      const corner = groupHandleAtPoint(model, this.selection.single, p.x, p.y, 8 / this.editor.viewport!.scale);
      if (corner) {
        // Materialise current bounds so the resize edits explicit values.
        this.editor.mutate((m) => {
          const g = m.groups.find((gr) => gr.id === this.selection.single)!;
          const b = groupBoundsLocal(m, g);
          g.x = b.x; g.y = b.y; g.w = b.w; g.h = b.h;
        });
        this.resize = { groupId: this.selection.single, corner };
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
    // Group box hit (nodes were checked first, so a node inside wins).
    const groupId = groupAtPoint(model, p.x, p.y);
    if (groupId) {
      if (e.shiftKey) { this.selection.toggle(groupId); }
      else { this.selection.select(groupId); }
      if (this.selection.has(groupId)) {
        this.groupDragId = groupId;
        this.dragging = true;
        this.dragIds = [];
      }
      this.onSelectionChange();
      return;
    }
    // edge hit-test
    const edgeId = edgeAtPoint(model, p.x, p.y, EDGE_HIT_TOLERANCE / this.editor.viewport!.scale);
    if (edgeId !== undefined) {
      this.selection.select(edgeId);
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
    if (this.resize && this.down) {
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      this.down = p;
      const { groupId, corner } = this.resize;
      this.editor.mutate((m) => {
        const g = m.groups.find((gr) => gr.id === groupId);
        if (!g || g.x === undefined || g.y === undefined || g.w === undefined || g.h === undefined) { return; }
        const cur = { x: g.x, y: g.y, w: g.w, h: g.h };
        const nb = resizeBox(cur, corner, dx, dy);
        g.x = nb.x; g.y = nb.y; g.w = nb.w; g.h = nb.h;
      });
      return;
    }
    if (this.dragging && this.down) {
      // Ignore sub-threshold jitter so a stationary double-click isn't turned
      // into a repainting drag (which would break dblclick-to-rename).
      if (!this.moved && Math.abs(e.clientX - this.last.x) <= 3 && Math.abs(e.clientY - this.last.y) <= 3) {
        return;
      }
      this.moved = true;
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      this.down = p;
      this.editor.mutate((m) => {
        if (this.groupDragId) {
          translateGroup(m, this.groupDragId, dx, dy);
        } else {
          for (const id of this.dragIds) {
            const n = m.nodes.find((nn) => nn.id === id);
            if (n && !n.locked) { n.x += dx; n.y += dy; }
          }
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
      // Same jitter guard: a plain background click must not repaint.
      if (!this.moved && Math.abs(e.clientX - this.last.x) <= 3 && Math.abs(e.clientY - this.last.y) <= 3) {
        return;
      }
      this.moved = true;
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
    if (this.resize) {
      this.resize = null; this.editor.commit(); this.down = null;
      this.capturedPointerId = null;
      return;
    }
    if (this.panning) {
      this.panning = false; this.down = null;
    } else if (this.dragging) {
      this.dragging = false;
      // Only a real drag reassigns membership / repaints. A plain click (no
      // movement) leaves the svg intact so double-click-to-rename still fires.
      if (this.moved) {
        this.editor.mutate((m) => {
          if (this.groupDragId) {
            reassignGroupParent(m, this.groupDragId);
          } else {
            for (const id of this.dragIds) { reassignNodeMembership(m, id); }
          }
        }, { commit: true });
      }
      this.groupDragId = null;
      this.down = null;
    } else if (this.connectFrom && !this.connectClickWaiting) {
      // Anchor-drag connect: pointer released on a target node creates the edge
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
      // Only repaint if an actual marquee was drawn; a plain background click
      // already cleared+redrew selection in onDown, and repainting here would
      // swap the svg and break a double-click landing on background.
      if (this.moved) {
        const x = Math.min(this.marqueeStart.x, p.x);
        const y = Math.min(this.marqueeStart.y, p.y);
        const w = Math.abs(p.x - this.marqueeStart.x);
        const h = Math.abs(p.y - this.marqueeStart.y);
        if (w > 3 || h > 3) {
          for (const id of nodesInRect(this.editor.getModel(), { x, y, w, h })) { this.selection.multi.add(id); }
          this.selection.single = this.selection.multi.size === 1 ? [...this.selection.multi][0] : null;
        }
        this.editor.repaint();
        this.onSelectionChange();
      }
      this.marqueeStart = null;
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

