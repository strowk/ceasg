import { NODE_SHAPES, SHAPE_LABELS, NodeShape, NodeStyle, duplicateNode, EDGE_KINDS, EDGE_LABELS, EdgeKind, removeEdge } from '../../core';
import type { WysiwygEditor } from './editor';
import type { SelectionState } from './pointer';

/** Border/line dash presets, shared by the node and edge panels. */
const DASH_PRESETS: Record<string, string> = { Solid: '', Dashed: '6 4', Dotted: '2 4' };
/** Generic CSS font stacks — enough to be useful without a font enumeration API. */
const FONT_PRESETS: Record<string, string> = {
  Default: '', 'Sans-serif': 'sans-serif', Serif: 'serif', Monospace: 'monospace', Cursive: 'cursive',
};

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
      const group = model.groups.find((g) => g.id === selection.single);
      if (group) { this.groupPanel(group.id); return; }
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

  /**
   * A `<select>` over named presets. When `current` is a value we have no preset
   * for — hand-written Mermaid such as `font-family:Georgia` or
   * `stroke-dasharray:5 5` — it is appended as its own option and selected, so
   * merely opening the panel never silently rewrites the author's value.
   */
  private presetSelect(presets: Record<string, string>, current: string, onPick: (v: string) => void): HTMLSelectElement {
    const sel = document.createElement('select');
    for (const name of Object.keys(presets)) {
      const o = document.createElement('option'); o.value = name; o.textContent = name; sel.appendChild(o);
    }
    const known = Object.keys(presets).find((k) => presets[k] === current);
    if (known === undefined) {
      const o = document.createElement('option'); o.value = current; o.textContent = current; sel.appendChild(o);
      presets = { ...presets, [current]: current };
    }
    sel.value = known ?? current;
    sel.addEventListener('change', () => onPick(presets[sel.value] ?? ''));
    return sel;
  }

  /** A number input that maps a blank field to `undefined` (property unset). */
  private numberInput(value: number | undefined, min: string, step: string, onInput: (v: number | undefined) => void): HTMLInputElement {
    const i = document.createElement('input');
    i.type = 'number'; i.min = min; i.step = step;
    i.value = value !== undefined ? String(value) : '';
    i.addEventListener('input', () => { const v = parseFloat(i.value); onInput(Number.isFinite(v) ? v : undefined); });
    return i;
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

    const setStyle = (patch: Partial<NodeStyle>) => this.editor.mutate((m) => {
      const n = m.nodes.find((n) => n.id === id)!; n.style = { ...n.style, ...patch };
    }, { commit: true });

    this.host.appendChild(this.row('Font size',
      this.numberInput(node().style?.fontSize, '1', '1', (v) => setStyle({ fontSize: v }))));
    this.host.appendChild(this.row('Font',
      this.presetSelect(FONT_PRESETS, node().style?.fontFamily ?? '', (v) => setStyle({ fontFamily: v || undefined }))));
    this.host.appendChild(this.row('Border width',
      this.numberInput(node().style?.strokeWidth, '0', '0.5', (v) => setStyle({ strokeWidth: v }))));
    this.host.appendChild(this.row('Border dash',
      this.presetSelect(DASH_PRESETS, node().style?.strokeDasharray ?? '', (v) => setStyle({ strokeDasharray: v || undefined }))));

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

  private edgePanel(id: string): void {
    const edge = () => this.editor.getModel().edges.find((e) => e.id === id)!;
    const head = document.createElement('div'); head.className = 'ceasg-panel-head'; head.textContent = `${edge().from} → ${edge().to}`;
    this.host.appendChild(head);

    const label = document.createElement('input'); label.type = 'text'; label.value = edge().label;
    label.addEventListener('input', () => this.editor.mutate((m) => { m.edges.find((e) => e.id === id)!.label = label.value; }, { commit: true }));
    this.host.appendChild(this.row('Label', label));

    const kind = document.createElement('select');
    for (const k of EDGE_KINDS) { const o = document.createElement('option'); o.value = k; o.textContent = EDGE_LABELS[k]; kind.appendChild(o); }
    kind.value = edge().kind;
    kind.addEventListener('change', () => this.editor.mutate((m) => { m.edges.find((e) => e.id === id)!.kind = kind.value as EdgeKind; }, { commit: true }));
    this.host.appendChild(this.row('Type', kind));

    const lineColor = document.createElement('input'); lineColor.type = 'color'; lineColor.value = edge().style?.strokeColor ?? '#888888';
    lineColor.addEventListener('input', () => this.editor.mutate((m) => { const e = m.edges.find((e) => e.id === id)!; e.style = { ...e.style, strokeColor: lineColor.value }; }, { commit: true }));
    this.host.appendChild(this.row('Line color', lineColor));

    const lineWidth = document.createElement('input'); lineWidth.type = 'number'; lineWidth.min = '0'; lineWidth.step = '0.5'; lineWidth.value = edge().style?.strokeWidth !== undefined ? String(edge().style!.strokeWidth) : '';
    lineWidth.addEventListener('input', () => this.editor.mutate((m) => { const e = m.edges.find((e) => e.id === id)!; const v = parseFloat(lineWidth.value); e.style = { ...e.style, strokeWidth: Number.isFinite(v) ? v : undefined }; }, { commit: true }));
    this.host.appendChild(this.row('Line width', lineWidth));

    const dash = this.presetSelect(DASH_PRESETS, edge().style?.strokeDasharray ?? '', (v) => this.editor.mutate((m) => {
      const e = m.edges.find((e) => e.id === id)!; e.style = { ...e.style, strokeDasharray: v || undefined };
    }, { commit: true }));
    this.host.appendChild(this.row('Dash', dash));

    const labelSize = document.createElement('input'); labelSize.type = 'number'; labelSize.min = '1'; labelSize.step = '1'; labelSize.value = edge().style?.fontSize !== undefined ? String(edge().style!.fontSize) : '';
    labelSize.addEventListener('input', () => this.editor.mutate((m) => { const e = m.edges.find((e) => e.id === id)!; const v = parseFloat(labelSize.value); e.style = { ...e.style, fontSize: Number.isFinite(v) ? v : undefined }; }, { commit: true }));
    this.host.appendChild(this.row('Label size', labelSize));

    const labelColor = document.createElement('input'); labelColor.type = 'color'; labelColor.value = edge().style?.textColor ?? '#888888';
    labelColor.addEventListener('input', () => this.editor.mutate((m) => { const e = m.edges.find((e) => e.id === id)!; e.style = { ...e.style, textColor: labelColor.value }; }, { commit: true }));
    this.host.appendChild(this.row('Label color', labelColor));

    const animated = document.createElement('input'); animated.type = 'checkbox'; animated.checked = !!edge().animated;
    animated.addEventListener('change', () => this.editor.mutate((m) => { m.edges.find((e) => e.id === id)!.animated = animated.checked; }, { commit: true }));
    this.host.appendChild(this.row('Animated', animated));

    const rev = document.createElement('button'); rev.textContent = 'Reverse';
    rev.addEventListener('click', () => this.editor.mutate((m) => { const e = m.edges.find((e) => e.id === id)!; const tmp = e.from; e.from = e.to; e.to = tmp; }, { commit: true }));

    const del = document.createElement('button'); del.textContent = 'Delete'; del.className = 'ceasg-danger';
    del.addEventListener('click', () => {
      this.editor.mutate((m) => { removeEdge(m, id); }, { commit: true });
      const sel = this.editor.selection;
      if (sel) { sel.clear(); this.refresh(sel); }
    });

    const actions = document.createElement('div'); actions.className = 'ceasg-panel-actions'; actions.append(rev, del);
    this.host.appendChild(actions);
  }

  private groupPanel(id: string): void {
    const group = () => this.editor.getModel().groups.find((g) => g.id === id)!;
    const head = document.createElement('div'); head.className = 'ceasg-panel-head'; head.textContent = `Subgraph ${id}`;
    this.host.appendChild(head);

    const title = document.createElement('input'); title.type = 'text'; title.value = group().title;
    title.addEventListener('input', () => this.editor.mutate((m) => { const g = m.groups.find((g) => g.id === id); if (g) { g.title = title.value; } }, { commit: true }));
    this.host.appendChild(this.row('Title', title));

    this.host.appendChild(this.hint(`${group().nodeIds.length} member nodes`));

    const ungroupBtn = document.createElement('button'); ungroupBtn.textContent = 'Ungroup'; ungroupBtn.className = 'ceasg-danger';
    ungroupBtn.addEventListener('click', () => this.editor.ungroupSelection());
    const actions = document.createElement('div'); actions.className = 'ceasg-panel-actions'; actions.append(ungroupBtn);
    this.host.appendChild(actions);
  }

  private multiPanel(selection: SelectionState): void {
    this.host.appendChild(this.hint(`${selection.multi.size} nodes selected`));

    const model = this.editor.getModel();
    const ids = [...selection.multi];
    // Controls seed from the first selected node, then write to all of them.
    const first = model.nodes.find((n) => n.id === ids[0])?.style;
    const setAll = (patch: Partial<NodeStyle>) => this.editor.mutate((m) => {
      for (const id of ids) { const n = m.nodes.find((n) => n.id === id); if (n) { n.style = { ...n.style, ...patch }; } }
    }, { commit: true });

    const mkColor = (current: string | undefined, apply: (v: string) => Partial<NodeStyle>) => {
      const c = document.createElement('input'); c.type = 'color'; c.value = current ?? '#888888';
      c.addEventListener('input', () => setAll(apply(c.value)));
      return c;
    };
    this.host.appendChild(this.row('Fill', mkColor(first?.fillColor, (v) => ({ fillColor: v }))));
    this.host.appendChild(this.row('Border', mkColor(first?.strokeColor, (v) => ({ strokeColor: v }))));
    this.host.appendChild(this.row('Text', mkColor(first?.textColor, (v) => ({ textColor: v }))));

    this.host.appendChild(this.row('Font size',
      this.numberInput(first?.fontSize, '1', '1', (v) => setAll({ fontSize: v }))));
    this.host.appendChild(this.row('Font',
      this.presetSelect(FONT_PRESETS, first?.fontFamily ?? '', (v) => setAll({ fontFamily: v || undefined }))));
    this.host.appendChild(this.row('Border width',
      this.numberInput(first?.strokeWidth, '0', '0.5', (v) => setAll({ strokeWidth: v }))));
    this.host.appendChild(this.row('Border dash',
      this.presetSelect(DASH_PRESETS, first?.strokeDasharray ?? '', (v) => setAll({ strokeDasharray: v || undefined }))));
  }
}
