import { describe, it, expect, vi } from 'vitest';
import { emptyModel, type DiagramModel } from '../../core';
import type { WysiwygEditor } from './editor';
import { PropertiesPanel } from './properties';
import { SelectionState } from './pointer';

/**
 * Builds a host + fake editor around a real DiagramModel, mirroring the
 * ShapeSidebar harness in sidebar.spec.ts. `mutate` runs the callback against
 * the real model (not just recording the call) so assertions observe genuine
 * mutations, matching what WysiwygEditor.mutate actually does.
 */
function make(model: DiagramModel) {
  const host = document.createElement('div');
  const getModel = vi.fn(() => model);
  const mutate = vi.fn((fn: (m: DiagramModel) => void) => { fn(model); });
  const editor = { getModel, mutate } as unknown as WysiwygEditor;
  const panel = new PropertiesPanel(host, editor);
  return { host, panel, model };
}

/** Locates a control by its row's label text, so tests survive re-ordering. */
function rowControl(host: HTMLElement, label: string): HTMLSelectElement {
  const rows = Array.from(host.querySelectorAll('.ceasg-panel-row'));
  const row = rows.find((r) => r.querySelector('span')?.textContent === label);
  if (!row) { throw new Error(`no row labelled "${label}"`); }
  return row.querySelector('select') as HTMLSelectElement;
}

function pick(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

/** Locates a colour/number input by its row's label text. */
function rowInput(host: HTMLElement, label: string): HTMLInputElement {
  const rows = Array.from(host.querySelectorAll('.ceasg-panel-row'));
  const row = rows.find((r) => r.querySelector('span')?.textContent === label);
  if (!row) { throw new Error(`no row labelled "${label}"`); }
  return row.querySelector('input') as HTMLInputElement;
}

describe('PropertiesPanel label format controls', () => {
  it('node panel: shows Label format defaulting to Plain, and Markdown sets node.labelFormat', () => {
    const model = emptyModel();
    model.nodes.push({ id: 'n1', label: 'Hello', shape: 'rect', x: 0, y: 0 });
    const { host, panel } = make(model);

    const sel = new SelectionState(); sel.select('n1');
    panel.refresh(sel);

    const control = rowControl(host, 'Label format');
    expect(control.value).toBe('');

    pick(control, 'markdown');
    expect(model.nodes[0]!.labelFormat).toBe('markdown');

    pick(control, '');
    expect(model.nodes[0]!.labelFormat).toBeUndefined();
  });

  it('node panel: reflects an already-markdown node as Markdown when refreshed', () => {
    const model = emptyModel();
    model.nodes.push({ id: 'n1', label: 'Hello', shape: 'rect', x: 0, y: 0, labelFormat: 'markdown' });
    const { host, panel } = make(model);

    const sel = new SelectionState(); sel.select('n1');
    panel.refresh(sel);

    const control = rowControl(host, 'Label format');
    expect(control.value).toBe('markdown');
  });

  it('edge panel: shows Label format defaulting to Plain, Markdown sets and Plain clears edge.labelFormat', () => {
    const model = emptyModel();
    model.nodes.push({ id: 'a', label: 'A', shape: 'rect', x: 0, y: 0 });
    model.nodes.push({ id: 'b', label: 'B', shape: 'rect', x: 100, y: 0 });
    model.edges.push({ id: 'e1', from: 'a', to: 'b', label: 'go', kind: 'arrow' });
    const { host, panel } = make(model);

    const sel = new SelectionState(); sel.select('e1');
    panel.refresh(sel);

    const control = rowControl(host, 'Label format');
    expect(control.value).toBe('');

    pick(control, 'markdown');
    expect(model.edges[0]!.labelFormat).toBe('markdown');

    pick(control, '');
    expect(model.edges[0]!.labelFormat).toBeUndefined();
  });

  it('edge panel: reflects an already-markdown edge as Markdown when refreshed', () => {
    const model = emptyModel();
    model.nodes.push({ id: 'a', label: 'A', shape: 'rect', x: 0, y: 0 });
    model.nodes.push({ id: 'b', label: 'B', shape: 'rect', x: 100, y: 0 });
    model.edges.push({ id: 'e1', from: 'a', to: 'b', label: 'go', kind: 'arrow', labelFormat: 'markdown' });
    const { host, panel } = make(model);

    const sel = new SelectionState(); sel.select('e1');
    panel.refresh(sel);

    const control = rowControl(host, 'Label format');
    expect(control.value).toBe('markdown');
  });

  it('group panel: exposes Title format writing group.titleFormat, and clears it back to undefined', () => {
    const model = emptyModel();
    model.nodes.push({ id: 'a', label: 'A', shape: 'rect', x: 0, y: 0 });
    model.groups.push({ id: 'g1', title: 'Group', nodeIds: ['a'] });
    const { host, panel } = make(model);

    const sel = new SelectionState(); sel.select('g1');
    panel.refresh(sel);

    const control = rowControl(host, 'Title format');
    expect(control.value).toBe('');

    pick(control, 'markdown');
    expect(model.groups[0]!.titleFormat).toBe('markdown');

    pick(control, '');
    expect(model.groups[0]!.titleFormat).toBeUndefined();
  });
});

describe('PropertiesPanel subgraph style controls', () => {
  function groupModel() {
    const model = emptyModel();
    model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
    model.groups.push({ id: 'S', title: 'Svc', nodeIds: ['A'] });
    return model;
  }

  it('writes the picked fill onto the group style', () => {
    const model = groupModel();
    const { host, panel } = make(model);
    const sel = new SelectionState(); sel.select('S');
    panel.refresh(sel);

    const fill = rowInput(host, 'Fill');
    fill.value = '#ff0000';
    fill.dispatchEvent(new Event('input'));
    expect(model.groups[0]!.style?.fillColor).toBe('#ff0000');
  });

  it('writes border width and dash onto the group style', () => {
    const model = groupModel();
    const { host, panel } = make(model);
    const sel = new SelectionState(); sel.select('S');
    panel.refresh(sel);

    const width = rowInput(host, 'Border width');
    width.value = '4';
    width.dispatchEvent(new Event('input'));
    expect(model.groups[0]!.style?.strokeWidth).toBe(4);

    const dash = rowControl(host, 'Border dash');
    pick(dash, 'Dashed');
    expect(model.groups[0]!.style?.strokeDasharray).toBe('6 4');
  });
});

describe('subgraph direction control', () => {
  function grouped(direction?: 'TB' | 'BT' | 'LR' | 'RL') {
    const model = emptyModel('TB');
    model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
    model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 0, y: 100 });
    model.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
    model.groups.push({ id: 'S', title: 'S', nodeIds: ['A', 'B'], direction });
    return make(model);
  }

  it('shows Not set for a subgraph with no direction line', () => {
    const { host, panel } = grouped();
    panel.refresh({ single: 'S', multi: new Set() } as SelectionState);
    expect(rowControl(host, 'Direction').value).toBe('');
  });

  it('reflects an explicit direction', () => {
    const { host, panel } = grouped('LR');
    panel.refresh({ single: 'S', multi: new Set() } as SelectionState);
    expect(rowControl(host, 'Direction').value).toBe('LR');
  });

  it('sets the direction on the group when picked', () => {
    const { host, panel, model } = grouped();
    panel.refresh({ single: 'S', multi: new Set() } as SelectionState);
    pick(rowControl(host, 'Direction'), 'RL');
    expect(model.groups[0]!.direction).toBe('RL');
  });

  it('clears the direction when set back to Not set', () => {
    const { host, panel, model } = grouped('LR');
    panel.refresh({ single: 'S', multi: new Set() } as SelectionState);
    pick(rowControl(host, 'Direction'), '');
    expect(model.groups[0]!.direction).toBeUndefined();
  });

  it('re-lays the members out when the direction changes', () => {
    const { host, panel, model } = grouped();
    panel.refresh({ single: 'S', multi: new Set() } as SelectionState);
    pick(rowControl(host, 'Direction'), 'LR');
    const [a, b] = ['A', 'B'].map((id) => model.nodes.find((n) => n.id === id)!);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(Math.abs(a.y - b.y));
  });

  it('names the resolved direction when the field is unset', () => {
    const { host, panel } = grouped();
    panel.refresh({ single: 'S', multi: new Set() } as SelectionState);
    const hints = Array.from(host.querySelectorAll('.ceasg-panel-hint'))
      .map((h) => h.textContent ?? '').join(' ');
    // Self-contained subgraph in a TB diagram: Mermaid flips it to LR.
    expect(hints).toContain('LR');
  });
});
