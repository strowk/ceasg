import { describe, it, expect } from 'vitest';
import { nodeAtPoint, nodesInRect, edgeAtPoint, groupAtPoint, groupResizeHandles, groupHandleAtPoint } from './hitTest';
import { emptyModel, mermaidToModel } from '../../core';

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
