import { mermaidToModel, modelToMermaid, layoutMissing, cloneModel, DiagramModel, nodeSize, removeNode, removeEdge, NodeShape, nextNodeId, groupBounds, assignNodeToGroup, assignGroupToParent, newGroupId, removeGroup, groupOf, materializeGroupBounds, measureTextWidth, findFreeSpot } from '../../core';
import { renderDiagram, RenderRefs } from './render';
import { Viewport } from './viewport';
import { UpdateMessage } from '../../shared/messages';
import { Overlay } from './overlay';
import { SelectionState, PointerController } from './pointer';
import { nodeAtPoint, nodeAnchorPoints, edgeAtPoint, groupAtPoint, groupResizeHandles, EDGE_HIT_TOLERANCE } from './hitTest';
import { edgePathD, selfLoopPathD, bezierMidpoint } from './edgePath';
import { openLabelEditor } from './labelEditor';
import { Toolbar } from './toolbar';
import { PropertiesPanel } from './properties';
import { ShapeSidebar } from './sidebar';

/** Must match the .ceasg-group-title font in media/diagram.css so the rename
 *  editor is sized to the same text the box renders. */
const GROUP_TITLE_FONT = '600 13px "trebuchet ms", verdana, arial, sans-serif';

/** After a node drag ends, set the node's membership to the innermost group its
 *  centre lands in (or ungroup when it lands on empty canvas). */
export function reassignNodeMembership(model: DiagramModel, nodeId: string): void {
  const n = model.nodes.find((nn) => nn.id === nodeId);
  if (!n) return;
  const gid = groupAtPoint(model, n.x, n.y);
  assignNodeToGroup(model, nodeId, gid ?? null);
}

/** After a group drag ends, reparent it to the innermost OTHER group its box
 *  centre lands in (excluding itself and its descendants), or top-level. */
export function reassignGroupParent(model: DiagramModel, groupId: string): void {
  const g = model.groups.find((gr) => gr.id === groupId);
  if (!g) return;
  const b = groupBounds(model, g);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // Candidate = innermost group at centre that is not this group.
  let best: string | null = null;
  let bestDepth = -1;
  for (const other of model.groups) {
    if (other.id === groupId) continue;
    const ob = groupBounds(model, other);
    const inside = cx >= ob.x && cx <= ob.x + ob.w && cy >= ob.y && cy <= ob.y + ob.h;
    if (!inside) continue;
    let d = 0, cur = other.parentId;
    while (cur) { d++; cur = model.groups.find((gg) => gg.id === cur)?.parentId; }
    if (d > bestDepth) { bestDepth = d; best = other.id; }
  }
  assignGroupToParent(model, groupId, best); // assignGroupToParent guards cycles
}

/** Wrap nodes in a fresh group. Bounds = bbox+padding; nests under a shared
 *  parent group when all nodes already share one. Returns the new group id. */
export function makeGroupFromNodes(model: DiagramModel, nodeIds: string[]): string {
  const id = newGroupId(model);
  const parents = new Set(nodeIds.map((nid) => groupOf(model, nid)?.id));
  const parentId = parents.size === 1 ? [...parents][0] : undefined;
  // Remove from any current group, then add to the new one.
  for (const nid of nodeIds) { assignNodeToGroup(model, nid, null); }
  model.groups.push({ id, title: id, nodeIds: [...nodeIds], parentId });
  const g = model.groups[model.groups.length - 1];
  const b = groupBounds(model, g); // derived from members
  g.x = b.x; g.y = b.y; g.w = b.w; g.h = b.h;
  return id;
}

export function ungroup(model: DiagramModel, groupId: string): void {
  removeGroup(model, groupId);
}

export class WysiwygEditor {
  private model: DiagramModel = mermaidToModel('flowchart TB\n').model;
  private history: DiagramModel[] = [];
  private historyIndex = -1;
  private version = 0;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private historyTimer: ReturnType<typeof setTimeout> | undefined;
  private canvasHost: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private refs: RenderRefs = { nodeEls: new Map(), edgeEls: new Map(), groupEls: new Map() };
  private keyboardAttached = false;
  private toolbarBuilt = false;
  private panelBuilt = false;
  private panel: PropertiesPanel | null = null;
  private sidebarBuilt = false;
  private sidebar: ShapeSidebar | null = null;
  viewport: Viewport | null = null;
  overlay: Overlay | null = null;
  selection: SelectionState | null = null;
  controller: PointerController | null = null;

  constructor(private readonly root: HTMLElement, private readonly api: VsCodeApi) {
    this.root.innerHTML = '<div class="ceasg-wysiwyg"><div id="toolbar"></div><div class="ceasg-body"><div id="sidebar"></div><div class="ceasg-canvas" id="canvas"></div><div id="panel"></div></div></div>';
    this.canvasHost = this.root.querySelector('#canvas') as HTMLElement;

    this.canvasHost.addEventListener('dragover', (e) => { e.preventDefault(); });
    this.canvasHost.addEventListener('drop', (e) => {
      e.preventDefault();
      const shape = e.dataTransfer?.getData('text/ceasg-shape');
      if (shape) { this.addNodeOfShape(shape as NodeShape, e.clientX, e.clientY); }
    });

    // The viewBox is derived from the host's size and nothing else recomputes it,
    // so a pane resize (or toggling the palette sidebar) would letterbox the
    // diagram and desync screenToSvg. Observe once here rather than in repaint(),
    // which recreates the Viewport on every paint and would leak observers.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.canvasHost.clientWidth || !this.canvasHost.clientHeight) { return; }
        this.viewport?.resize();
      });
      this.resizeObserver.observe(this.canvasHost);
    }
  }

  init(source: string): void {
    this.model = mermaidToModel(source).model;
    layoutMissing(this.model);
    // Freeze derived group boxes into explicit bounds (respecting any saved
    // gpos geometry) so a subgraph box stays put while its members are dragged
    // out — a live-derived box would re-wrap them and nothing could ever leave.
    materializeGroupBounds(this.model);
    this.history = [cloneModel(this.model)];
    this.historyIndex = 0;

    // Construct selection state and controller once, before first repaint
    this.selection = new SelectionState();
    this.controller = new PointerController(
      this,
      this.selection,
      () => this.refreshSelection(),
    );

    // Build toolbar once per editor instance; guard against re-creation on applyExternal→init
    if (!this.toolbarBuilt) {
      this.toolbarBuilt = true;
      const toolbarHost = this.root.querySelector('#toolbar') as HTMLElement;
      new Toolbar(toolbarHost, this);
    }

    // Built once per editor instance, like the toolbar and panel — init() runs
    // again on every applyExternal.
    if (!this.sidebarBuilt) {
      this.sidebarBuilt = true;
      const sidebarHost = this.root.querySelector('#sidebar') as HTMLElement;
      this.sidebar = new ShapeSidebar(sidebarHost, this);
    }

    // Build panel once per editor instance; guard against re-creation on applyExternal→init
    if (!this.panelBuilt) {
      this.panelBuilt = true;
      const panelHost = this.root.querySelector('#panel') as HTMLElement;
      this.panel = new PropertiesPanel(panelHost, this);
    }

    this.repaint();
    this.viewport?.fit(this.model);
    this.attachKeyboard();
  }

  getModel(): DiagramModel { return this.model; }
  getRefs(): RenderRefs { return this.refs; }
  isGroupId(id: string): boolean { return this.model.groups.some((g) => g.id === id); }

  addNodeOfShape(shape: NodeShape, clientX: number, clientY: number): void {
    const p = this.viewport?.screenToSvg(clientX, clientY) ?? { x: 100, y: 100 };
    this.addNodeAt(shape, p.x, p.y);
  }

  /** Add at the canvas centre, cascading down-right past anything already there
   *  so repeated palette clicks never stack nodes on one spot. */
  addNodeAtFreeSpot(shape: NodeShape): void {
    const r = this.canvasHost.getBoundingClientRect();
    const c = this.viewport?.screenToSvg(r.left + r.width / 2, r.top + r.height / 2)
      ?? { x: 100, y: 100 };
    const p = findFreeSpot(this.model, c.x, c.y, shape);
    this.addNodeAt(shape, p.x, p.y);
  }

  /** Show/hide the shape palette sidebar. Returns the resulting open state. */
  toggleSidebar(force?: boolean): boolean { return this.sidebar?.toggle(force) ?? false; }

  /** Shared tail of every add path: insert, then select so the properties panel
   *  targets the new node immediately. Select after mutate — the repaint inside
   *  it redraws the overlay from the selection as it stood before. */
  private addNodeAt(shape: NodeShape, x: number, y: number): void {
    let addedId = '';
    this.mutate((m) => {
      addedId = nextNodeId(m);
      m.nodes.push({ id: addedId, label: addedId, shape, x, y });
    }, { commit: true });
    if (addedId && this.selection) {
      this.selection.select(addedId);
      this.refreshSelection();
    }
  }

  repaint(): void {
    const prevTransform = this.viewport ? this.viewport.getTransform() : null;
    const { svg, refs } = renderDiagram(this.model);
    this.refs = refs;
    this.canvasHost.innerHTML = '';
    this.canvasHost.appendChild(svg);
    this.viewport = new Viewport(svg, this.canvasHost);
    if (prevTransform) { this.viewport.setTransform(prevTransform); }

    // Overlay is recreated fresh on each repaint (after svg is in DOM)
    this.overlay = new Overlay(svg);
    this.drawSelection();
    if (this.controller) { this.controller.attach(svg); }

    svg.addEventListener('dblclick', (e) => {
      const p = this.viewport!.screenToSvg(e.clientX, e.clientY);
      const node = nodeAtPoint(this.model, p.x, p.y);
      if (node) {
        openLabelEditor(this.canvasHost, this.viewport!, { x: node.x, y: node.y, text: node.label, ...nodeSize(this.model, node) }, (text) => {
          this.mutate((m) => { const n = m.nodes.find((nn) => nn.id === node.id); if (n) { n.label = text; } }, { commit: true });
        });
        return;
      }
      const gId = groupAtPoint(this.model, p.x, p.y);
      if (gId) {
        const grp = this.model.groups.find((g) => g.id === gId)!;
        const b = groupBounds(this.model, grp);
        // Size the editor to the title text (there's no natural node-sized box
        // for a subgraph), positioned over the top-left title.
        const titleW = measureTextWidth(grp.title || grp.id, GROUP_TITLE_FONT);
        const boxW = titleW + 20;
        const boxH = 22;
        openLabelEditor(this.canvasHost, this.viewport!, {
          x: b.x + 10 + titleW / 2, y: b.y + 16, text: grp.title,
          w: boxW, h: boxH, minW: 60, minH: 22,
        }, (text) => {
          this.mutate((m) => { const gg = m.groups.find((g) => g.id === gId); if (gg) { gg.title = text; } }, { commit: true });
        });
        return;
      }
      // Double-click the edge line (or its label) to edit the edge label in place.
      const edgeId = edgeAtPoint(this.model, p.x, p.y, EDGE_HIT_TOLERANCE / this.viewport!.scale);
      if (edgeId === undefined) { return; }
      const edge = this.model.edges.find((ed) => ed.id === edgeId);
      const from = edge && this.model.nodes.find((n) => n.id === edge.from);
      const to = edge && this.model.nodes.find((n) => n.id === edge.to);
      if (!edge || !from || !to) { return; }
      const d = edge.from === edge.to
        ? selfLoopPathD(this.model, from, this.model.direction)
        : edgePathD(this.model, from, to, this.model.direction);
      const mid = bezierMidpoint(d);
      openLabelEditor(this.canvasHost, this.viewport!, { x: mid.x, y: mid.y, text: edge.label }, (text) => {
        this.mutate((m) => { const ed = m.edges.find((e2) => e2.id === edgeId); if (ed) { ed.label = text; } }, { commit: true });
      });
    });
  }

  drawSelection(): void {
    if (!this.overlay || !this.selection) { return; }
    this.overlay.clear();
    // Remove any previously applied edge-selected class from all edge elements
    for (const [, g] of this.refs.edgeEls) {
      g.classList.remove('ceasg-edge-selected');
    }
    for (const [, g] of this.refs.groupEls) { g.classList.remove('ceasg-group-selected'); }
    for (const id of this.selection.multi) {
      const n = this.model.nodes.find((nn) => nn.id === id);
      if (n) {
        const { w, h } = nodeSize(this.model, n);
        this.overlay.outline(n.x - w / 2 - 3, n.y - h / 2 - 3, w + 6, h + 6);
      } else if (this.isGroupId(id)) {
        const gEl = this.refs.groupEls.get(id);
        if (gEl) { gEl.classList.add('ceasg-group-selected'); }
      } else {
        // Check if the selected id is an edge
        const edgeEl = this.refs.edgeEls.get(id);
        if (edgeEl) { edgeEl.classList.add('ceasg-edge-selected'); }
      }
    }
    // Connection handles: four circles on the single selected node. Drag from one
    // to another node to create an edge (see PointerController.onDown).
    if (this.selection.single) {
      const n = this.model.nodes.find((nn) => nn.id === this.selection!.single);
      if (n) {
        const r = 5 / (this.viewport?.scale ?? 1);
        for (const a of nodeAnchorPoints(this.model, n)) { this.overlay.handle(a.x, a.y, r); }
      }
    }
    if (this.selection.single && this.isGroupId(this.selection.single)) {
      const r = 5 / (this.viewport?.scale ?? 1);
      for (const h of groupResizeHandles(this.model, this.selection.single)) {
        this.overlay.handle(h.x, h.y, r);
      }
    }
  }

  mutate(fn: (m: DiagramModel) => void, opts: { commit?: boolean } = {}): void {
    fn(this.model);
    this.repaint();
    if (this.panel && this.selection) {
      // Don't rebuild the panel while the user is typing in one of its fields —
      // refreshing destroys the focused input and the next keystroke is lost.
      const active = document.activeElement;
      const inField = !!active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
      if (!inField) { this.panel.refresh(this.selection); }
    }
    if (opts.commit) { this.commit(); }
  }

  /** Single source of truth for a selection change: redraw the outline AND refresh the inspector. */
  refreshSelection(): void {
    this.drawSelection();
    if (this.panel && this.selection) { this.panel.refresh(this.selection); }
  }

  commit(): void { this.scheduleHistory(); this.scheduleSync(); }

  private scheduleHistory(): void {
    clearTimeout(this.historyTimer);
    this.historyTimer = setTimeout(() => this.pushHistory(), 400);
  }
  private pushHistory(): void {
    const snapshot = cloneModel(this.model);
    if (modelToMermaid(this.history[this.historyIndex]) === modelToMermaid(snapshot)) { return; }
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    if (this.history.length > 60) { this.history.shift(); }
    this.historyIndex = this.history.length - 1;
  }
  undo(): void {
    this.pushHistory();
    if (this.historyIndex <= 0) { return; }
    this.historyIndex = Math.max(0, this.historyIndex - 1);
    this.model = cloneModel(this.history[this.historyIndex]);
    this.repaint();
    this.scheduleSync();
  }
  redo(): void {
    if (this.historyIndex >= this.history.length - 1) { return; }
    this.historyIndex += 1;
    this.model = cloneModel(this.history[this.historyIndex]);
    this.repaint();
    this.scheduleSync();
  }

  groupSelection(): void {
    if (!this.selection) { return; }
    const ids = [...this.selection.multi].filter((id) => this.model.nodes.some((n) => n.id === id));
    if (ids.length === 0) { return; }
    let gid = '';
    this.mutate((m) => { gid = makeGroupFromNodes(m, ids); }, { commit: true });
    this.selection.select(gid);
    this.refreshSelection();
  }

  ungroupSelection(): void {
    if (!this.selection || !this.selection.single || !this.isGroupId(this.selection.single)) { return; }
    const gid = this.selection.single;
    this.mutate((m) => { ungroup(m, gid); }, { commit: true });
    this.selection.clear();
    this.refreshSelection();
  }

  deleteSelected(): void {
    if (this.selection === null || this.selection.multi.size === 0) { return; }
    const ids = [...this.selection.multi];
    // Evaluate group membership before mutate (this.model is replaced after callback runs)
    const groupIds = new Set(ids.filter((id) => this.isGroupId(id)));
    this.mutate((m) => {
      for (const id of ids) {
        // Groups are ungrouped (contents kept); nodes/edges are removed.
        if (groupIds.has(id)) { ungroup(m, id); }
        else if (m.nodes.some((n) => n.id === id)) { removeNode(m, id); }
        else { removeEdge(m, id); }
      }
    }, { commit: true });
    this.selection.clear();
    this.onSelectionChange();
  }

  attachKeyboard(): void {
    if (this.keyboardAttached) { return; }
    this.keyboardAttached = true;
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) { return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); return; }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (this.selection !== null) {
          this.selection.multi = new Set(this.model.nodes.map((n) => n.id));
          this.repaint();
          this.onSelectionChange();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selection === null || this.selection.multi.size === 0) { return; }
        e.preventDefault();
        this.deleteSelected();
        return;
      }
      const nudge = e.shiftKey ? 10 : 1;
      const deltas: Record<string, [number, number]> = { ArrowLeft: [-nudge, 0], ArrowRight: [nudge, 0], ArrowUp: [0, -nudge], ArrowDown: [0, nudge] };
      if (deltas[e.key] && this.selection !== null && this.selection.multi.size > 0) {
        e.preventDefault();
        const [dx, dy] = deltas[e.key];
        this.mutate((m) => { for (const id of this.selection!.multi) { const n = m.nodes.find((nn) => nn.id === id); if (n) { n.x += dx; n.y += dy; } } }, { commit: true });
      }
    });
  }

  private onSelectionChange(): void {
    this.drawSelection();
    if (this.panel && this.selection) { this.panel.refresh(this.selection); }
  }

  serialize(): string { return modelToMermaid(this.model, { includePositions: true }); }

  private scheduleSync(): void {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.version += 1;
      const msg: UpdateMessage = { type: 'update', source: this.serialize(), version: this.version };
      this.api.postMessage(msg);
    }, 150);
  }

  applyExternal(source: string): void {
    try {
      this.init(source);
    } catch {
      // Keep current model on failure — do not sync back to host
      const toast = document.createElement('div');
      toast.className = 'ceasg-toast';
      toast.textContent = 'Invalid diagram source — editor not updated.';
      this.root.appendChild(toast);
      setTimeout(() => { toast.remove(); }, 3000);
    }
  }
}
