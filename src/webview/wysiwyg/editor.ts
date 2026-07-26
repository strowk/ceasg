import { mermaidToModel, modelToMermaid, layoutMissing, cloneModel, DiagramModel } from '../../core';
import { renderDiagram, RenderRefs } from './render';
import { Viewport } from './viewport';
import { UpdateMessage } from '../../shared/messages';

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

  constructor(private readonly root: HTMLElement, private readonly api: VsCodeApi) {
    this.root.innerHTML = '<div class="ceasg-wysiwyg"><div class="ceasg-canvas" id="canvas"></div></div>';
    this.canvasHost = this.root.querySelector('#canvas') as HTMLElement;
  }

  init(source: string): void {
    this.model = mermaidToModel(source).model;
    layoutMissing(this.model);
    this.history = [cloneModel(this.model)];
    this.historyIndex = 0;
    this.repaint();
    this.viewport?.fit(this.model);
  }

  getModel(): DiagramModel { return this.model; }
  getRefs(): RenderRefs { return this.refs; }

  repaint(): void {
    const { svg, refs } = renderDiagram(this.model);
    this.refs = refs;
    this.canvasHost.innerHTML = '';
    this.canvasHost.appendChild(svg);
    this.viewport = new Viewport(svg, this.canvasHost);
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
