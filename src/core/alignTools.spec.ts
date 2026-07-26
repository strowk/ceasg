import { describe, it, expect } from 'vitest';
import { alignNodes } from './alignTools';
import { emptyModel } from './model';

describe('alignNodes', () => {
  it('aligns selected node left edges', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 0, w: 80, h: 44 });
    m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 200, y: 50, w: 80, h: 44 });
    alignNodes(m, ['A', 'B'], 'left');
    const left = (n: { x: number; w?: number }) => n.x - (n.w ?? 80) / 2;
    expect(left(m.nodes[0])).toBeCloseTo(left(m.nodes[1]), 1);
  });
});
