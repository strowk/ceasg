import { describe, it, expect } from 'vitest';
import { nodeBorderPoint, edgePathD } from './edgePath';
import { emptyModel, type DiagramModel, type DiagramNode } from '../../core';

const node = (x: number, y: number): DiagramNode => ({ id: 'n', label: 'n', shape: 'rect' as const, x, y, w: 80, h: 44 });
const modelWith = (...nodes: DiagramNode[]): DiagramModel => ({ ...emptyModel('TB'), nodes });

describe('nodeBorderPoint', () => {
  it('exits the right edge toward a node on the right', () => {
    const n = node(0, 0);
    const p = nodeBorderPoint(modelWith(n), n, 500, 0);
    expect(p.x).toBeCloseTo(40, 0); // half of w=80
    expect(p.y).toBeCloseTo(0, 0);
  });

  it('grows the exit point with a font-size-enlarged box', () => {
    // No manual w/h, so the box is measured from the label in the styled font.
    const plain: DiagramNode = { id: 'a', label: 'Wide label', shape: 'rect', x: 0, y: 0 };
    const big: DiagramNode = { ...plain, style: { fontSize: 32 } };
    const at = (n: DiagramNode) => nodeBorderPoint(modelWith(n), n, 0, 500).y;
    expect(at(big)).toBeGreaterThan(at(plain));
  });
});

describe('edgePathD', () => {
  it('produces a cubic path string starting with M and containing C', () => {
    const a = node(0, 0), b = node(0, 200);
    const d = edgePathD(modelWith(a, b), a, b, 'TB');
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('C');
  });
});

import { SHAPES } from '../../core';

describe('nodeBorderPoint with an outline', () => {
  const model = (shape: string) => ({
    direction: 'TD', nodes: [{ id: 'A', label: 'x', shape, x: 0, y: 0, w: 100, h: 100 }],
    edges: [], groups: [], config: {}, classDefs: [], unknownLines: [],
  }) as never;

  it('anchors a triangle on its sloped edge, not its box corner', () => {
    const m = model('tri');
    const node = (m as { nodes: Array<Record<string, number>> }).nodes[0]!;
    const p = nodeBorderPoint(m, node as never, 100, -100);
    // The box corner is (50, -50); the triangle's edge is well inside it.
    expect(Math.abs(p.x)).toBeLessThan(50);
  });

  it('leaves box-anchored shapes exactly as before', () => {
    const m = model('rect');
    const node = (m as { nodes: Array<Record<string, number>> }).nodes[0]!;
    expect(nodeBorderPoint(m, node as never, 1000, 0)).toEqual({ x: 50, y: 0 });
  });

  it('declares outlines on exactly the nine divergent shapes', () => {
    const withOutline = Object.values(SHAPES).filter((d) => d.outline).map((d) => d.name).sort();
    expect(withOutline).toEqual(['bang', 'bolt', 'cloud', 'curv-trap', 'flag',
      'flip-tri', 'hourglass', 'notch-pent', 'tri']);
  });
});
