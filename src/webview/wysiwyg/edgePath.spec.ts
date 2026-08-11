import { describe, it, expect } from 'vitest';
import { nodeBorderPoint, edgePathD, endpointBorderPoint } from './edgePath';
import { emptyModel, type DiagramModel, type DiagramNode } from '../../core';

const node = (x: number, y: number, id = 'n'): DiagramNode => ({ id, label: id, shape: 'rect' as const, x, y, w: 80, h: 44 });
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
    const a = node(0, 0, 'a'), b = node(0, 200, 'b');
    const d = edgePathD(modelWith(a, b), 'a', 'b', 'TB');
    expect(d!.startsWith('M')).toBe(true);
    expect(d).toContain('C');
  });

  it('returns null rather than throwing when an endpoint resolves to nothing', () => {
    const a = node(0, 0, 'a');
    expect(edgePathD(modelWith(a), 'a', 'ghost', 'TB')).toBeNull();
  });

  it('anchors an edge on a subgraph box border', () => {
    const m = modelWith(node(0, 0, 'a'));
    m.groups.push({ id: 'S1', title: 'S1', nodeIds: [], x: 100, y: -50, w: 200, h: 100 });
    // Box spans x 100..300 centred at (200, 0); an edge from the left meets its
    // left border, not its centre.
    const p = endpointBorderPoint(m, 'S1', 0, 0);
    expect(p).toEqual({ x: 100, y: 0 });
  });

  it('resolves a subgraph id as an edge endpoint', () => {
    const m = modelWith(node(0, 0, 'a'));
    m.groups.push({ id: 'S1', title: 'S1', nodeIds: [], x: 100, y: -50, w: 200, h: 100 });
    const d = edgePathD(m, 'a', 'S1', 'LR');
    expect(d).not.toBeNull();
    expect(d!.startsWith('M40,0')).toBe(true); // leaves node 'a' at its right edge
  });
});

/**
 * A subgraph edge whose other end is a node *inside* that subgraph. Aiming the
 * member's border point at the group's centre picks the side facing away from
 * where the line actually arrives, so the path crosses the member's box and the
 * arrowhead lands on the occluded far edge — the node layer paints over the
 * edge layer, so it is invisible.
 */
describe('edgePathD with one endpoint inside the other', () => {
  // Box spans y -100..100; the member sits in the lower half at y=60,
  // so the group border nearest it is the bottom edge (y=100).
  const contained = () => {
    const m = modelWith(node(0, 60, 'inner'));
    m.groups.push({ id: 'S1', title: 'S1', nodeIds: ['inner'], x: -100, y: -100, w: 200, h: 200 });
    return m;
  };
  // inner's box is y 38..82 (h=44 centred on 60).
  const ends = (d: string) => {
    const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    return { start: { x: n[0]!, y: n[1]! }, end: { x: n[6]!, y: n[7]! } };
  };

  it('ends on the member border facing the group border it came from', () => {
    const { start, end } = ends(edgePathD(contained(), 'S1', 'inner', 'TB')!);
    expect(start.y).toBeCloseTo(100, 0); // group's bottom edge, nearest the member
    expect(end.y).toBeCloseTo(82, 0);    // member's BOTTOM edge, not its top (38)
  });

  it('does not cross the member box on the way in', () => {
    const { start, end } = ends(edgePathD(contained(), 'S1', 'inner', 'TB')!);
    // Travelling from the group border to the member border must not pass
    // through the member's interior, which would hide the arrowhead under it.
    expect(Math.min(start.y, end.y)).toBeGreaterThanOrEqual(82 - 0.5);
  });

  it('is symmetric: member to group leaves the near side too', () => {
    const { start, end } = ends(edgePathD(contained(), 'inner', 'S1', 'TB')!);
    expect(start.y).toBeCloseTo(82, 0);  // leaves the member's bottom edge
    expect(end.y).toBeCloseTo(100, 0);   // arrives at the group's bottom edge
  });

  it('leaves an ordinary edge between two separate nodes untouched', () => {
    const m = modelWith(node(0, 0, 'a'), node(0, 200, 'b'));
    const { start, end } = ends(edgePathD(m, 'a', 'b', 'TB')!);
    expect(start.y).toBeCloseTo(22, 0);  // a's bottom edge
    expect(end.y).toBeCloseTo(178, 0);   // b's top edge
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

  // Regression: hourglassOutline places two vertices exactly at (cx, cy),
  // which is also the ray's own origin. A ray along the pinch's horizontal
  // has no real crossing there — the silhouette has zero width along that
  // line — so this must fall through to box math, not report the node's own
  // centre as the border point (which would put the arrowhead on the label).
  it('falls back to box math for an hourglass edge near the horizontal pinch, not its centre', () => {
    const m = model('hourglass');
    const node = (m as { nodes: Array<Record<string, number>> }).nodes[0]!;
    const p = nodeBorderPoint(m, node as never, 1000, 0);
    expect(p).not.toEqual({ x: 0, y: 0 });
    expect(p).toEqual({ x: 50, y: 0 }); // box math: half of w=100
  });

  it('anchors a bang on its starburst spike, not the box corner', () => {
    const m = model('bang');
    const node = (m as { nodes: Array<Record<string, number>> }).nodes[0]!;
    const p = nodeBorderPoint(m, node as never, 1000, 1000);
    // The box corner is (50, 50); the starburst pulls well inside it.
    expect(p.x).toBeLessThan(50);
  });

  it('anchors a bolt on its lightning outline, not the box corner', () => {
    const m = model('bolt');
    const node = (m as { nodes: Array<Record<string, number>> }).nodes[0]!;
    const p = nodeBorderPoint(m, node as never, 1000, 1000);
    // The box corner is (50, 50); the bolt's outline is much narrower.
    expect(p.x).toBeLessThan(30);
  });

  it('anchors a notch-pent inside its notched corner, not the box corner', () => {
    const m = model('notch-pent');
    const node = (m as { nodes: Array<Record<string, number>> }).nodes[0]!;
    const p = nodeBorderPoint(m, node as never, -1000, -1000);
    // The box corner is (-50, -50); the notch cuts that corner back.
    expect(p.x).toBeGreaterThan(-50);
  });
});
