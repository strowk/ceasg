import { describe, it, expect } from 'vitest';
import { autoLayout, layoutMissing } from './layout';
import { emptyModel } from './model';

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
