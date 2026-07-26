import { NODE_SHAPES, SHAPE_LABELS, NodeShape, duplicateNode } from '../../core';
import type { WysiwygEditor } from './editor';
import type { SelectionState } from './pointer';

export class PropertiesPanel {
  constructor(private readonly host: HTMLElement, private readonly editor: WysiwygEditor) {
    this.host.className = 'ceasg-panel';
  }

  refresh(selection: SelectionState): void {
    this.host.innerHTML = '';
    const model = this.editor.getModel();
    if (selection.single) {
      const node = model.nodes.find((n) => n.id === selection.single);
      if (node) { this.nodePanel(node.id); return; }
      const edge = model.edges.find((e) => e.id === selection.single);
      if (edge) { this.edgePanel(edge.id); return; }
    }
    if (selection.multi.size > 1) { this.multiPanel(selection); return; }
    this.host.appendChild(this.hint(`${model.nodes.length} nodes · ${model.edges.length} edges`));
  }

  private hint(text: string): HTMLElement {
    const d = document.createElement('div'); d.className = 'ceasg-panel-hint'; d.textContent = text; return d;
  }
  private row(label: string, control: HTMLElement): HTMLElement {
    const r = document.createElement('label'); r.className = 'ceasg-panel-row';
    const s = document.createElement('span'); s.textContent = label; r.appendChild(s); r.appendChild(control); return r;
  }

  private nodePanel(id: string): void {
    const node = () => this.editor.getModel().nodes.find((n) => n.id === id)!;
    const head = document.createElement('div'); head.className = 'ceasg-panel-head'; head.textContent = `Node ${id}`;
    this.host.appendChild(head);

    const label = document.createElement('input'); label.type = 'text'; label.value = node().label;
    label.addEventListener('input', () => this.editor.mutate((m) => { m.nodes.find((n) => n.id === id)!.label = label.value; }, { commit: true }));
    this.host.appendChild(this.row('Label', label));

    const shape = document.createElement('select');
    for (const s of NODE_SHAPES) { const o = document.createElement('option'); o.value = s; o.textContent = SHAPE_LABELS[s]; shape.appendChild(o); }
    shape.value = node().shape;
    shape.addEventListener('change', () => this.editor.mutate((m) => { m.nodes.find((n) => n.id === id)!.shape = shape.value as NodeShape; }, { commit: true }));
    this.host.appendChild(this.row('Shape', shape));

    const mkColor = (get: () => string | undefined, set: (v: string) => void) => {
      const c = document.createElement('input'); c.type = 'color'; c.value = get() ?? '#888888';
      c.addEventListener('input', () => this.editor.mutate(() => set(c.value), { commit: true }));
      return c;
    };
    this.host.appendChild(this.row('Fill', mkColor(() => node().style?.fillColor, (v) => { const n = node(); n.style = { ...n.style, fillColor: v }; })));
    this.host.appendChild(this.row('Border', mkColor(() => node().style?.strokeColor, (v) => { const n = node(); n.style = { ...n.style, strokeColor: v }; })));
    this.host.appendChild(this.row('Text', mkColor(() => node().style?.textColor, (v) => { const n = node(); n.style = { ...n.style, textColor: v }; })));

    const lock = document.createElement('input'); lock.type = 'checkbox'; lock.checked = !!node().locked;
    lock.addEventListener('change', () => this.editor.mutate((m) => { m.nodes.find((n) => n.id === id)!.locked = lock.checked; }, { commit: true }));
    this.host.appendChild(this.row('Lock', lock));

    const dup = document.createElement('button'); dup.textContent = 'Duplicate';
    dup.addEventListener('click', () => this.editor.mutate((m) => { duplicateNode(m, id); }, { commit: true }));
    const del = document.createElement('button'); del.textContent = 'Delete'; del.className = 'ceasg-danger';
    del.addEventListener('click', () => this.editor.deleteSelected());
    const actions = document.createElement('div'); actions.className = 'ceasg-panel-actions'; actions.append(dup, del);
    this.host.appendChild(actions);
  }

  private edgePanel(_id: string): void { /* implemented in Task 4.3 */ }
  private multiPanel(_selection: SelectionState): void {
    this.host.appendChild(this.hint(`${_selection.multi.size} nodes selected`));
  }
}
