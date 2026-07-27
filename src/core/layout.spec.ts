import { describe, it, expect } from 'vitest';
import { autoLayout, layoutMissing } from './layout';
import { emptyModel, groupBounds } from './model';
import { mermaidToModel } from './parser';

describe('autoLayout', () => {
  it('assigns finite non-overlapping positions to a chain', () => {
    const m = emptyModel();
    for (const id of ['A', 'B', 'C']) { m.nodes.push({ id, label: id, shape: 'rect', x: 0, y: 0 }); }
    m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
    m.edges.push({ id: 'e2', from: 'B', to: 'C', label: '', kind: 'arrow' });
    autoLayout(m);
    for (const n of m.nodes) { expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true); }
    const ys = m.nodes.map((n) => n.y);
    expect(new Set(ys).size).toBeGreaterThan(1); // TB layout ranks vertically
  });
  it('layoutMissing only places unplaced nodes', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 500, y: 500 });
    m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 });
    layoutMissing(m);
    expect(m.nodes.find((n) => n.id === 'A')).toMatchObject({ x: 500, y: 500 });
    const b = m.nodes.find((n) => n.id === 'B')!;
    expect(b.x === 0 && b.y === 0).toBe(false);
  });
});

describe('auto layout with nested groups', () => {
  it('clears stale stored group bounds and re-derives nesting after layout', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph outer\nsubgraph inner\nA-->B\nend\nend\n',
    );
    const outerGrp = model.groups.find((g) => g.id === 'outer')!;
    // Seed WRONG tiny stored bounds that would break nesting if not cleared.
    outerGrp.x = 0; outerGrp.y = 0; outerGrp.w = 1; outerGrp.h = 1;
    autoLayout(model);
    // Layout must clear stored bounds so they re-derive from laid-out members.
    expect(outerGrp.x).toBeUndefined();
    expect(outerGrp.y).toBeUndefined();
    expect(outerGrp.w).toBeUndefined();
    expect(outerGrp.h).toBeUndefined();
    const outer = groupBounds(model, outerGrp);
    const inner = groupBounds(model, model.groups.find((g) => g.id === 'inner')!);
    // Re-derived outer box fully encloses inner on all four edges.
    expect(outer.x).toBeLessThanOrEqual(inner.x);
    expect(outer.y).toBeLessThanOrEqual(inner.y);
    expect(outer.x + outer.w).toBeGreaterThanOrEqual(inner.x + inner.w);
    expect(outer.y + outer.h).toBeGreaterThanOrEqual(inner.y + inner.h);
  });
});
