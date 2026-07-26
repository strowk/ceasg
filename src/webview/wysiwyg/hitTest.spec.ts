import { describe, it, expect } from 'vitest';
import { nodeAtPoint, nodesInRect } from './hitTest';
import { emptyModel } from '../../core';

function m2() {
  const m = emptyModel();
  m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 100, w: 80, h: 44 });
  m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 300, y: 100, w: 80, h: 44 });
  return m;
}

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
