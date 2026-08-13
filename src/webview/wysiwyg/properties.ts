import { BASE_FONT_SIZE, SHAPE_GROUPS, NodeShape, NodeStyle, EdgeStyle, duplicateNode, setNodeShape, EDGE_KINDS, EDGE_LABELS, EdgeKind, removeEdge, LabelFormat, Direction, planClusters, layoutSubtree } from '../../core';
import type { WysiwygEditor } from './editor';
import type { SelectionState } from './pointer';

/** Border/line dash presets, shared by the node and edge panels. */
const DASH_PRESETS: Record<string, string> = { Solid: '', Dashed: '6 4', Dotted: '2 4' };
/** Subgraph layout directions. '' means no `direction` line — Mermaid's branch rules decide. */
const DIRECTION_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['', 'Not set'], ['TB', 'TB'], ['BT', 'BT'], ['LR', 'LR'], ['RL', 'RL'],
];
/** Generic CSS font stacks — enough to be useful without a font enumeration API. */
const FONT_PRESETS: Record<string, string> = {
  Default: '', 'Sans-serif': 'sans-serif', Serif: 'serif', Monospace: 'monospace', Cursive: 'cursive',
};

/*
 * What the canvas renders each property at when it is unset — mirrors
 * media/diagram.css. Numeric inputs seed from these so stepping an unset field
 * starts from the value in effect. Node font size uses core's BASE_FONT_SIZE,
 * which .ceasg-label is kept in lockstep with.
 */
const DEFAULT_NODE_STROKE_W = 1.5;  // .ceasg-shape stroke-width
const DEFAULT_GROUP_STROKE_W = 1;   // .ceasg-group-box stroke-width
const DEFAULT_EDGE_STROKE_W = 1.5;  // .ceasg-edge-line stroke-width
const DEFAULT_EDGE_LABEL_SIZE = 12; // .ceasg-edge-label font-size

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

  /**
   * Plain / Markdown for a label. "Markdown" is Mermaid's backtick-wrapped
   * markdown-string form: it adds bold/italic emphasis and word wrapping.
   * Raw HTML markup (bold/italic tags, entities) renders in both, because
   * Mermaid defaults to htmlLabels: true.
   */
  private formatSelect(current: LabelFormat | undefined, onPick: (v: LabelFormat | undefined) => void): HTMLSelectElement {
    const sel = document.createElement('select');
    for (const [value, text] of [['', 'Plain'], ['markdown', 'Markdown']] as const) {
      const o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o);
    }
    sel.value = current ?? '';
    sel.addEventListener('change', () => onPick(sel.value === 'markdown' ? 'markdown' : undefined));
    return sel;
  }

  /**
   * A number input that maps a blank field to `undefined` (property unset).
   *
   * An unset property seeds the field with `fallback` — the value the canvas
   * actually renders it at — so the spinner steps from what the user sees
   * instead of jumping to `min`. The field is dimmed until edited to show the
   * number is the inherited default rather than something set on this element.
   */
  private numberInput(value: number | undefined, fallback: number, min: string, step: string, onInput: (v: number | undefined) => void): HTMLInputElement {
    const i = document.createElement('input');
    i.type = 'number'; i.min = min; i.step = step;
    i.value = String(value ?? fallback);
    if (value === undefined) { i.classList.add('ceasg-input-inherited'); }
    i.addEventListener('input', () => {
      i.classList.remove('ceasg-input-inherited');
      const v = parseFloat(i.value);
      onInput(Number.isFinite(v) ? v : undefined);
    });
    return i;
  }

  private nodePanel(id: string): void {
    const node = () => this.editor.getModel().nodes.find((n) => n.id === id)!;
    const head = document.createElement('div'); head.className = 'ceasg-panel-head'; head.textContent = `Node ${id}`;
    this.host.appendChild(head);

    const label = document.createElement('input'); label.type = 'text'; label.value = node().label;
    label.addEventListener('input', () => this.editor.mutate((m) => { m.nodes.find((n) => n.id === id)!.label = label.value; }, { commit: true }));
    this.host.appendChild(this.row('Label', label));

    this.host.appendChild(this.row('Label format', this.formatSelect(node().labelFormat, (v) =>
      this.editor.mutate((m) => { m.nodes.find((n) => n.id === id)!.labelFormat = v; }, { commit: true }))));

    const shape = document.createElement('select');
    for (const group of SHAPE_GROUPS) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.title;
      for (const s of group.shapes) {
        const o = document.createElement('option');
        o.value = s.name;
        o.textContent = s.label;
        optgroup.appendChild(o);
      }
      shape.appendChild(optgroup);
    }
    shape.value = node().shape;
    shape.addEventListener('change', () => this.editor.mutate((m) => {
      const target = m.nodes.find((n) => n.id === id);
      if (target) { setNodeShape(target, shape.value as NodeShape); }
    }, { commit: true }));
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
      this.numberInput(node().style?.fontSize, BASE_FONT_SIZE, '1', '1', (v) => setStyle({ fontSize: v }))));
    this.host.appendChild(this.row('Font',
      this.presetSelect(FONT_PRESETS, node().style?.fontFamily ?? '', (v) => setStyle({ fontFamily: v || undefined }))));
    this.host.appendChild(this.row('Border width',
      this.numberInput(node().style?.strokeWidth, DEFAULT_NODE_STROKE_W, '0', '0.5', (v) => setStyle({ strokeWidth: v }))));
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

  /** An edge endpoint id may name a node or a subgraph, and neither reads well
   *  raw — show whatever the canvas draws on it. */
  private endpointName(id: string): string {
    const model = this.editor.getModel();
    const node = model.nodes.find((n) => n.id === id);
    if (node) { return node.label || id; }
    const group = model.groups.find((g) => g.id === id);
    if (group) { return group.title || id; }
    return id;
  }

  private edgePanel(id: string): void {
    const edge = () => this.editor.getModel().edges.find((e) => e.id === id)!;
    const head = document.createElement('div'); head.className = 'ceasg-panel-head';
    head.textContent = `${this.endpointName(edge().from)} → ${this.endpointName(edge().to)}`;
    this.host.appendChild(head);

    const label = document.createElement('input'); label.type = 'text'; label.value = edge().label;
    label.addEventListener('input', () => this.editor.mutate((m) => { m.edges.find((e) => e.id === id)!.label = label.value; }, { commit: true }));
    this.host.appendChild(this.row('Label', label));

    this.host.appendChild(this.row('Label format', this.formatSelect(edge().labelFormat, (v) =>
      this.editor.mutate((m) => { m.edges.find((e) => e.id === id)!.labelFormat = v; }, { commit: true }))));

    const kind = document.createElement('select');
    for (const k of EDGE_KINDS) { const o = document.createElement('option'); o.value = k; o.textContent = EDGE_LABELS[k]; kind.appendChild(o); }
    kind.value = edge().kind;
    kind.addEventListener('change', () => this.editor.mutate((m) => { m.edges.find((e) => e.id === id)!.kind = kind.value as EdgeKind; }, { commit: true }));
    this.host.appendChild(this.row('Type', kind));

    const lineColor = document.createElement('input'); lineColor.type = 'color'; lineColor.value = edge().style?.strokeColor ?? '#888888';
    lineColor.addEventListener('input', () => this.editor.mutate((m) => { const e = m.edges.find((e) => e.id === id)!; e.style = { ...e.style, strokeColor: lineColor.value }; }, { commit: true }));
    this.host.appendChild(this.row('Line color', lineColor));

    const setEdgeStyle = (patch: Partial<EdgeStyle>) => this.editor.mutate((m) => {
      const e = m.edges.find((e) => e.id === id)!; e.style = { ...e.style, ...patch };
    }, { commit: true });

    this.host.appendChild(this.row('Line width',
      this.numberInput(edge().style?.strokeWidth, DEFAULT_EDGE_STROKE_W, '0', '0.5', (v) => setEdgeStyle({ strokeWidth: v }))));

    const dash = this.presetSelect(DASH_PRESETS, edge().style?.strokeDasharray ?? '', (v) => this.editor.mutate((m) => {
      const e = m.edges.find((e) => e.id === id)!; e.style = { ...e.style, strokeDasharray: v || undefined };
    }, { commit: true }));
    this.host.appendChild(this.row('Dash', dash));

    this.host.appendChild(this.row('Label size',
      this.numberInput(edge().style?.fontSize, DEFAULT_EDGE_LABEL_SIZE, '1', '1', (v) => setEdgeStyle({ fontSize: v }))));

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

    this.host.appendChild(this.row('Title format', this.formatSelect(group().titleFormat, (v) =>
      this.editor.mutate((m) => { m.groups.find((g) => g.id === id)!.titleFormat = v; }, { commit: true }))));

    const dir = document.createElement('select');
    for (const [value, text] of DIRECTION_OPTIONS) {
      const o = document.createElement('option'); o.value = value; o.textContent = text; dir.appendChild(o);
    }
    dir.value = group().direction ?? '';
    this.host.appendChild(this.row('Direction', dir));

    // Unset does not mean "same as the diagram": Mermaid lays a subgraph with
    // no crossing edges out perpendicular to its parent. Naming the resolved
    // direction here keeps that from looking like a bug. WysiwygEditor.mutate()
    // skips panel.refresh() while the select keeps focus (its inField guard),
    // so this hint must refresh itself from the handler rather than rely on a
    // panel rebuild — see renderDirectionHint below.
    const dirHint = this.hint('');
    this.host.appendChild(dirHint);
    const renderDirectionHint = () => {
      if (group().direction !== undefined) {
        dirHint.textContent = '';
        dirHint.style.display = 'none';
        return;
      }
      const plan = planClusters(this.editor.getModel()).get(id);
      if (!plan) {
        dirHint.textContent = '';
        dirHint.style.display = 'none';
        return;
      }
      const why = plan.branch === 'collapse' ? 'perpendicular to parent' : 'shared with parent';
      dirHint.textContent = `Not set → ${plan.rankdir} (${why})`;
      dirHint.style.display = '';
    };
    renderDirectionHint();

    dir.addEventListener('change', () => {
      this.editor.mutate((m) => {
        const g = m.groups.find((gg) => gg.id === id);
        if (!g) { return; }
        g.direction = dir.value === '' ? undefined : (dir.value as Direction);
        // Re-lay only this subgraph, anchored at its current box, so the change
        // is visible immediately without disturbing the rest of the diagram.
        layoutSubtree(m, id);
      }, { commit: true });
      renderDirectionHint();
    });

    const setStyle = (patch: Partial<NodeStyle>) => this.editor.mutate((m) => {
      const g = m.groups.find((g) => g.id === id)!; g.style = { ...g.style, ...patch };
    }, { commit: true });

    const mkColor = (current: string | undefined, apply: (v: string) => Partial<NodeStyle>) => {
      const c = document.createElement('input'); c.type = 'color'; c.value = current ?? '#888888';
      c.addEventListener('input', () => setStyle(apply(c.value)));
      return c;
    };
    this.host.appendChild(this.row('Fill', mkColor(group().style?.fillColor, (v) => ({ fillColor: v }))));
    this.host.appendChild(this.row('Border', mkColor(group().style?.strokeColor, (v) => ({ strokeColor: v }))));
    this.host.appendChild(this.row('Title color', mkColor(group().style?.textColor, (v) => ({ textColor: v }))));
    this.host.appendChild(this.row('Border width',
      this.numberInput(group().style?.strokeWidth, DEFAULT_GROUP_STROKE_W, '0', '0.5', (v) => setStyle({ strokeWidth: v }))));
    this.host.appendChild(this.row('Border dash',
      this.presetSelect(DASH_PRESETS, group().style?.strokeDasharray ?? '', (v) => setStyle({ strokeDasharray: v || undefined }))));

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
      this.numberInput(first?.fontSize, BASE_FONT_SIZE, '1', '1', (v) => setAll({ fontSize: v }))));
    this.host.appendChild(this.row('Font',
      this.presetSelect(FONT_PRESETS, first?.fontFamily ?? '', (v) => setAll({ fontFamily: v || undefined }))));
    this.host.appendChild(this.row('Border width',
      this.numberInput(first?.strokeWidth, DEFAULT_NODE_STROKE_W, '0', '0.5', (v) => setAll({ strokeWidth: v }))));
    this.host.appendChild(this.row('Border dash',
      this.presetSelect(DASH_PRESETS, first?.strokeDasharray ?? '', (v) => setAll({ strokeDasharray: v || undefined }))));
  }
}
