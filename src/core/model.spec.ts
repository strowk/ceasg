import { describe, it, expect } from 'vitest';
import { emptyModel, nextNodeId, cloneModel, removeNode, NODE_SHAPES } from './model';
import {
  groupChildren, groupBounds, assignGroupToParent,
  groupDescendantNodeIds, translateGroup, removeGroup, GROUP_PAD,
} from './model';

function nodeAt(id: string, x: number, y: number) {
  return { id, label: id, shape: 'rect' as const, x, y, w: 80, h: 40 };
}

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

describe('group tree helpers', () => {
  it('groupBounds derives a box wrapping members plus padding', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100), nodeAt('B', 300, 100));
    m.groups.push({ id: 'g1', title: 'g1', nodeIds: ['A', 'B'] });
    const b = groupBounds(m, m.groups[0]);
    // members span x:[60,340] y:[80,120]; pad GROUP_PAD each side, title band on top
    expect(b.x).toBe(60 - GROUP_PAD);
    expect(b.y).toBeLessThan(80 - GROUP_PAD); // extra title band above
    expect(b.x + b.w).toBe(340 + GROUP_PAD);
  });

  it('groupBounds returns stored bounds when all set', () => {
    const m = emptyModel('TB');
    m.groups.push({ id: 'g1', title: 'g1', nodeIds: [], x: 5, y: 6, w: 7, h: 8 });
    expect(groupBounds(m, m.groups[0])).toEqual({ x: 5, y: 6, w: 7, h: 8 });
  });

  it('groupBounds wraps nested child group boxes', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100));
    m.groups.push({ id: 'outer', title: 'outer', nodeIds: [] });
    m.groups.push({ id: 'inner', title: 'inner', nodeIds: ['A'], parentId: 'outer' });
    const outer = groupBounds(m, m.groups[0]);
    const inner = groupBounds(m, m.groups[1]);
    expect(outer.x).toBeLessThanOrEqual(inner.x);
    expect(outer.x + outer.w).toBeGreaterThanOrEqual(inner.x + inner.w);
  });

  it('groupChildren returns direct child groups only', () => {
    const m = emptyModel('TB');
    m.groups.push({ id: 'outer', title: 'o', nodeIds: [] });
    m.groups.push({ id: 'inner', title: 'i', nodeIds: [], parentId: 'outer' });
    expect(groupChildren(m, 'outer').map((g) => g.id)).toEqual(['inner']);
  });

  it('assignGroupToParent refuses to create a cycle', () => {
    const m = emptyModel('TB');
    m.groups.push({ id: 'a', title: 'a', nodeIds: [] });
    m.groups.push({ id: 'b', title: 'b', nodeIds: [], parentId: 'a' });
    assignGroupToParent(m, 'a', 'b'); // would make a a child of its own descendant
    expect(m.groups.find((g) => g.id === 'a')!.parentId).toBeUndefined();
  });

  it('groupDescendantNodeIds gathers members across nesting', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 0, 0), nodeAt('B', 0, 0));
    m.groups.push({ id: 'outer', title: 'o', nodeIds: ['A'] });
    m.groups.push({ id: 'inner', title: 'i', nodeIds: ['B'], parentId: 'outer' });
    expect(groupDescendantNodeIds(m, 'outer').sort()).toEqual(['A', 'B']);
  });

  it('translateGroup moves members, descendant members and stored bounds', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100), nodeAt('B', 200, 100));
    m.groups.push({ id: 'outer', title: 'o', nodeIds: ['A'], x: 50, y: 50, w: 300, h: 200 });
    m.groups.push({ id: 'inner', title: 'i', nodeIds: ['B'], parentId: 'outer', x: 120, y: 60, w: 100, h: 80 });
    translateGroup(m, 'outer', 10, 20);
    expect(m.nodes.find((n) => n.id === 'A')!.x).toBe(110);
    expect(m.nodes.find((n) => n.id === 'B')!.x).toBe(210);
    expect(m.groups.find((g) => g.id === 'outer')!.x).toBe(60);
    expect(m.groups.find((g) => g.id === 'inner')!.x).toBe(130);
  });

  it('removeGroup reparents child groups and members to parent', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 0, 0));
    m.groups.push({ id: 'outer', title: 'o', nodeIds: [] });
    m.groups.push({ id: 'inner', title: 'i', nodeIds: ['A'], parentId: 'outer' });
    m.groups.push({ id: 'leaf', title: 'l', nodeIds: [], parentId: 'inner' });
    removeGroup(m, 'inner');
    expect(m.groups.find((g) => g.id === 'inner')).toBeUndefined();
    expect(m.groups.find((g) => g.id === 'leaf')!.parentId).toBe('outer');
    // member A had innermost 'inner'; after ungroup it belongs to outer
    expect(m.groups.find((g) => g.id === 'outer')!.nodeIds).toContain('A');
  });
});
