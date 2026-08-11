import { describe, it, expect } from 'vitest';
import { nodeAtPoint, nodesInRect, edgeAtPoint, groupAtPoint, groupResizeHandles, groupHandleAtPoint, groupAnchorPoints, resizeBox } from './hitTest';
import { emptyModel, mermaidToModel, groupBounds } from '../../core';

function m2() {
  const m = emptyModel();
  m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 100, w: 80, h: 44 });
  m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 300, y: 100, w: 80, h: 44 });
  return m;
}

function mEdge() {
  const m = emptyModel();
  m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, w: 80, h: 44 });
  m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 200, y: 0, w: 80, h: 44 });
  m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
  return m;
}

describe('edgeAtPoint', () => {
  it('returns the edge id when the point is close to the path', () => {
    expect(edgeAtPoint(mEdge(), 100, 0, 8)).toBe('e1');
  });
  it('returns undefined when the point is far from the path', () => {
    expect(edgeAtPoint(mEdge(), 100, 100, 8)).toBeUndefined();
  });
  it('hits an edge drawn to a subgraph box', () => {
    const { model } = mermaidToModel('flowchart LR\nsubgraph g1\nA\nend\nB\n');
    const a = model.nodes.find((n) => n.id === 'A')!;
    const b = model.nodes.find((n) => n.id === 'B')!;
    a.x = 0; a.y = 0; b.x = 500; b.y = 0;
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    g1.x = -100; g1.y = -100; g1.w = 200; g1.h = 200;
    model.edges.push({ id: 'e1', from: 'g1', to: 'B', label: '', kind: 'arrow' });
    // The path runs from the box's right border (100, 0) to B's left border.
    expect(edgeAtPoint(model, 200, 0, 8)).toBe('e1');
    expect(edgeAtPoint(model, 200, 200, 8)).toBeUndefined();
  });
  it('skips an edge with an unresolvable endpoint', () => {
    const m = mEdge();
    m.edges.push({ id: 'ghost', from: 'A', to: 'nope', label: '', kind: 'arrow' });
    expect(edgeAtPoint(m, 100, 0, 8)).toBe('e1');
  });
});

describe('hitTest', () => {
  it('nodeAtPoint hits inside a node box', () => {
    expect(nodeAtPoint(m2(), 100, 100)?.id).toBe('A');
    expect(nodeAtPoint(m2(), 500, 500)).toBeUndefined();
  });
  it('picks topmost (last) node when overlapping', () => {
    const m = m2();
    m.nodes.push({ id: 'C', label: 'C', shape: 'rect', x: 100, y: 100, w: 80, h: 44 });
    expect(nodeAtPoint(m, 100, 100)?.id).toBe('C');
  });
  it('nodesInRect returns enclosed node ids', () => {
    expect(nodesInRect(m2(), { x: 40, y: 60, w: 120, h: 90 })).toEqual(['A']);
  });
});

describe('groupAtPoint', () => {
  it('returns the innermost group containing the point', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph outer\nsubgraph inner\nA-->B\nend\nend\n');
    // stored bounds: inner nested inside outer
    const outer = model.groups.find((g) => g.id === 'outer')!;
    const inner = model.groups.find((g) => g.id === 'inner')!;
    outer.x = 0; outer.y = 0; outer.w = 400; outer.h = 400;
    inner.x = 100; inner.y = 100; inner.w = 100; inner.h = 100;
    expect(groupAtPoint(model, 150, 150)).toBe('inner'); // inside both → innermost
    expect(groupAtPoint(model, 20, 20)).toBe('outer');   // only outer
    expect(groupAtPoint(model, 500, 500)).toBeUndefined();
  });
});

describe('resizeBox', () => {
  it('se grows without moving the origin', () => {
    expect(resizeBox({ x: 10, y: 10, w: 100, h: 80 }, 'se', 20, 30)).toEqual({ x: 10, y: 10, w: 120, h: 110 });
  });
  it('nw keeps the opposite (se) edge anchored when clamped to min', () => {
    // Box right edge = 110, bottom edge = 90. Drag NW far past min.
    const r = resizeBox({ x: 10, y: 10, w: 100, h: 80 }, 'nw', 500, 500, 40);
    expect(r.w).toBe(40); expect(r.h).toBe(40);
    // opposite edges stay put: x+w == 110, y+h == 90
    expect(r.x + r.w).toBe(110);
    expect(r.y + r.h).toBe(90);
  });
});

describe('group resize handles', () => {
  it('exposes four corner handles and hit-tests them', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\n');
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    g1.x = 0; g1.y = 0; g1.w = 200; g1.h = 100;
    const hs = groupResizeHandles(model, 'g1');
    expect(hs.map((h) => h.corner).sort()).toEqual(['ne', 'nw', 'se', 'sw']);
    expect(groupHandleAtPoint(model, 'g1', 200, 100, 6)).toBe('se');
    expect(groupHandleAtPoint(model, 'g1', 100, 50, 6)).toBeUndefined();
  });
});

describe('groupAnchorPoints', () => {
  it('returns the four box edge midpoints for stored bounds', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\n');
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    g1.x = 0; g1.y = 0; g1.w = 200; g1.h = 100;
    expect(groupAnchorPoints(model, 'g1')).toEqual([
      { dir: 'N', x: 100, y: 0 },
      { dir: 'S', x: 100, y: 100 },
      { dir: 'E', x: 200, y: 50 },
      { dir: 'W', x: 0, y: 50 },
    ]);
  });
  it('follows a derived box, and never coincides with a resize corner', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\n');
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    const b = groupBounds(model, g1); // no stored x/y/w/h — derived from members
    expect(groupAnchorPoints(model, 'g1')).toEqual([
      { dir: 'N', x: b.x + b.w / 2, y: b.y },
      { dir: 'S', x: b.x + b.w / 2, y: b.y + b.h },
      { dir: 'E', x: b.x + b.w, y: b.y + b.h / 2 },
      { dir: 'W', x: b.x, y: b.y + b.h / 2 },
    ]);
    const corners = groupResizeHandles(model, 'g1');
    for (const a of groupAnchorPoints(model, 'g1')) {
      expect(corners.some((c) => c.x === a.x && c.y === a.y)).toBe(false);
    }
  });
  it('returns nothing for an unknown group id', () => {
    expect(groupAnchorPoints(emptyModel(), 'nope')).toEqual([]);
  });
});
