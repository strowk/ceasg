import { mermaidToModel, layoutMissing, DiagramModel } from '../../core';
import { renderDiagram } from './render';
import { Viewport } from './viewport';

export class WysiwygEditor {
  private model: DiagramModel = mermaidToModel('flowchart TB\n').model;
  private canvasHost: HTMLElement;
  private viewport: Viewport | null = null;

  constructor(private readonly root: HTMLElement, private readonly api: VsCodeApi) {
    this.root.innerHTML = '<div class="ceasg-wysiwyg"><div class="ceasg-canvas" id="canvas"></div></div>';
    this.canvasHost = this.root.querySelector('#canvas') as HTMLElement;
  }

  init(source: string): void {
    this.model = mermaidToModel(source).model;
    layoutMissing(this.model); // place any nodes without stored positions
    this.repaint();
  }

  private repaint(): void {
    const { svg } = renderDiagram(this.model);
    this.canvasHost.innerHTML = '';
    this.canvasHost.appendChild(svg);
    this.viewport = new Viewport(svg, this.canvasHost);
    this.viewport.fit(this.model);
  }
}
