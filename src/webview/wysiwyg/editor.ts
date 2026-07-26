import { mermaidToModel, modelToMermaid, layoutMissing, cloneModel, DiagramModel, estimateNodeSize, removeNode } from '../../core';
import { renderDiagram, RenderRefs } from './render';
import { Viewport } from './viewport';
import { UpdateMessage } from '../../shared/messages';
import { Overlay } from './overlay';
import { SelectionState, PointerController } from './pointer';

export class WysiwygEditor {
  private model: DiagramModel = mermaidToModel('flowchart TB\n').model;
  private history: DiagramModel[] = [];
  private historyIndex = -1;
  private version = 0;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private historyTimer: ReturnType<typeof setTimeout> | undefined;
  private canvasHost: HTMLElement;
  private refs: RenderRefs = { nodeEls: new Map(), edgeEls: new Map() };
  viewport: Viewport | null = null;
  overlay: Overlay | null = null;
  selection: SelectionState | null = null;
  controller: PointerController | null = null;

  constructor(private readonly root: HTMLElement, private readonly api: VsCodeApi) {
    this.root.innerHTML = '<div class="ceasg-wysiwyg"><div class="ceasg-canvas" id="canvas"></div></div>';
    this.canvasHost = this.root.querySelector('#canvas') as HTMLElement;
  }

  init(source: string): void {
    this.model = mermaidToModel(source).model;
    layoutMissing(this.model);
    this.history = [cloneModel(this.model)];
    this.historyIndex = 0;

    // Construct selection state and controller once, before first repaint
    this.selection = new SelectionState();
    this.controller = new PointerController(
      this,
      this.selection,
      () => this.drawSelection(),
    );

    this.repaint();
    this.viewport?.fit(this.model);
    this.attachKeyboard();
  }

  getModel(): DiagramModel { return this.model; }
  getRefs(): RenderRefs { return this.refs; }

  repaint(): void {
    const { svg, refs } = renderDiagram(this.model);
    this.refs = refs;
    this.canvasHost.innerHTML = '';
    this.canvasHost.appendChild(svg);
    this.viewport = new Viewport(svg, this.canvasHost);

    // Overlay is recreated fresh on each repaint (after svg is in DOM)
    this.overlay = new Overlay(svg);
    this.drawSelection();
    if (this.controller) { this.controller.attach(svg); }
  }

  drawSelection(): void {
    if (!this.overlay || !this.selection) { return; }
    this.overlay.clear();
    for (const id of this.selection.multi) {
      const n = this.model.nodes.find((nn) => nn.id === id);
      if (!n) { continue; }
      const w = n.w ?? estimateNodeSize(n).w;
      const h = n.h ?? estimateNodeSize(n).h;
      this.overlay.outline(n.x - w / 2 - 3, n.y - h / 2 - 3, w + 6, h + 6);
    }
  }

  mutate(fn: (m: DiagramModel) => void, opts: { commit?: boolean } = {}): void {
    fn(this.model);
    this.repaint();
    if (opts.commit) { this.commit(); }
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

  deleteSelected(): void {
    if (this.selection === null || this.selection.multi.size === 0) { return; }
    const ids = [...this.selection.multi];
    this.mutate((m) => { for (const id of ids) { removeNode(m, id); } }, { commit: true });
    this.selection.clear();
    this.onSelectionChange();
  }

  attachKeyboard(): void {
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

  applyExternal(source: string): void { this.init(source); }
}
