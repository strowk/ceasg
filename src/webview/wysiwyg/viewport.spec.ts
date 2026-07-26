import { describe, it, expect } from 'vitest';
import { computeContentBounds } from './viewport';
import { emptyModel } from '../../core';

describe('computeContentBounds', () => {
  it('covers all node boxes with padding', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, w: 80, h: 44 });
    m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 200, y: 100, w: 80, h: 44 });
    const b = computeContentBounds(m);
    expect(b.minX).toBeLessThanOrEqual(-40);
    expect(b.maxX).toBeGreaterThanOrEqual(240);
    expect(b.maxY).toBeGreaterThanOrEqual(122);
  });
});
