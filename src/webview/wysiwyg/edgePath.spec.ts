import { describe, it, expect } from 'vitest';
import { nodeBorderPoint, edgePathD } from './edgePath';

const node = (x: number, y: number) => ({ id: 'n', label: 'n', shape: 'rect' as const, x, y, w: 80, h: 44 });

describe('nodeBorderPoint', () => {
  it('exits the right edge toward a node on the right', () => {
    const p = nodeBorderPoint(node(0, 0), 500, 0);
    expect(p.x).toBeCloseTo(40, 0); // half of w=80
    expect(p.y).toBeCloseTo(0, 0);
  });
});

describe('edgePathD', () => {
  it('produces a cubic path string starting with M and containing C', () => {
    const d = edgePathD(node(0, 0), node(0, 200), 'TB');
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('C');
  });
});
