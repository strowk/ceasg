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
