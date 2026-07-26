import { autoLayout, nextNodeId, DIRECTIONS, Direction } from '../../core';
import type { WysiwygEditor } from './editor';

export class Toolbar {
  constructor(private readonly host: HTMLElement, private readonly editor: WysiwygEditor) { this.build(); }

  private btn(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'ceasg-tb-btn'; b.textContent = label; b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  private build(): void {
    const bar = document.createElement('div');
    bar.className = 'ceasg-toolbar';
    bar.appendChild(this.btn('↶', 'Undo (Ctrl+Z)', () => this.editor.undo()));
    bar.appendChild(this.btn('↷', 'Redo (Ctrl+Shift+Z)', () => this.editor.redo()));
    bar.appendChild(this.btn('＋', 'Add node', () => this.addNode()));
    bar.appendChild(this.btn('⌫', 'Delete selected', () => this.editor.deleteSelected()));
    bar.appendChild(this.btn('⤢', 'Auto layout', () => this.autoLayout()));

    const dir = document.createElement('select');
    dir.className = 'ceasg-tb-select';
    for (const d of DIRECTIONS) { const o = document.createElement('option'); o.value = d; o.textContent = d; dir.appendChild(o); }
    dir.value = this.editor.getModel().direction;
    dir.addEventListener('change', () => this.editor.mutate((m) => { m.direction = dir.value as Direction; }, { commit: true }));
    bar.appendChild(dir);

    bar.appendChild(this.btn('－', 'Zoom out', () => this.editor.viewport?.zoomBy(1 / 1.2, innerWidth / 2, innerHeight / 2)));
    bar.appendChild(this.btn('＋', 'Zoom in', () => this.editor.viewport?.zoomBy(1.2, innerWidth / 2, innerHeight / 2)));
    bar.appendChild(this.btn('▣', 'Fit', () => this.editor.viewport?.fit(this.editor.getModel())));
    this.host.appendChild(bar);
  }

  private addNode(): void {
    this.editor.mutate((m) => {
      const id = nextNodeId(m);
      const c = this.editor.viewport?.screenToSvg(innerWidth / 2, innerHeight / 2) ?? { x: 100, y: 100 };
      m.nodes.push({ id, label: id, shape: 'rect', x: c.x, y: c.y });
    }, { commit: true });
  }
  private autoLayout(): void {
    this.editor.mutate((m) => autoLayout(m), { commit: true });
    this.editor.viewport?.fit(this.editor.getModel());
  }
}
