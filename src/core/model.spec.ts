import { describe, it, expect } from 'vitest';
import { emptyModel, nextNodeId, cloneModel, removeNode, NODE_SHAPES } from './model';

describe('model', () => {
  it('empty model defaults to TB and no nodes', () => {
    const m = emptyModel();
    expect(m.direction).toBe('TB');
    expect(m.nodes).toHaveLength(0);
  });
  it('exposes 14 node shapes', () => { expect(NODE_SHAPES).toHaveLength(14); });
  it('nextNodeId is unique', () => {
    const m = emptyModel();
    const id = nextNodeId(m);
    m.nodes.push({ id, label: id, shape: 'rect', x: 0, y: 0 });
    expect(nextNodeId(m)).not.toBe(id);
  });
  it('removeNode drops touching edges', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
    m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 });
    m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
    removeNode(m, 'A');
    expect(m.nodes.map((n) => n.id)).toEqual(['B']);
    expect(m.edges).toHaveLength(0);
  });
  it('cloneModel is a deep copy', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 1, y: 2 });
    const c = cloneModel(m);
    c.nodes[0].x = 99;
    expect(m.nodes[0].x).toBe(1);
  });
});
