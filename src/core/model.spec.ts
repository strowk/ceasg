import { describe, it, expect } from 'vitest';
import { emptyModel, nextNodeId, cloneModel, removeNode, NODE_SHAPES, resolveNodeStyle, nodeSize } from './model';
import {
  groupChildren, groupBounds, assignGroupToParent,
  groupDescendantNodeIds, translateGroup, removeGroup, GROUP_PAD,
  materializeGroupBounds,
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
    expect(m.nodes.find((n) => n.id === 'A')!.y).toBe(120);
    expect(m.nodes.find((n) => n.id === 'B')!.x).toBe(210);
    expect(m.nodes.find((n) => n.id === 'B')!.y).toBe(120);
    expect(m.groups.find((g) => g.id === 'outer')!.x).toBe(60);
    expect(m.groups.find((g) => g.id === 'outer')!.y).toBe(70);
    expect(m.groups.find((g) => g.id === 'inner')!.x).toBe(130);
    expect(m.groups.find((g) => g.id === 'inner')!.y).toBe(80);
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

describe('materializeGroupBounds', () => {
  it('freezes derived bounds so a dragged-out member escapes the fixed box', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100));
    m.groups.push({ id: 'g1', title: 'g1', nodeIds: ['A'] });
    materializeGroupBounds(m);
    const g = m.groups[0];
    expect(g.x).toBeDefined();
    const frozen = groupBounds(m, g);
    // Drag the member far away; the box must NOT follow (it is now explicit).
    m.nodes[0].x = 900; m.nodes[0].y = 900;
    const after = groupBounds(m, g);
    expect(after).toEqual(frozen);
    // The node's new centre is outside the frozen box (so membership can change).
    expect(m.nodes[0].x).toBeGreaterThan(after.x + after.w);
  });

  it('only materializes undefined bounds by default (respects saved gpos)', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100));
    m.groups.push({ id: 'g1', title: 'g1', nodeIds: ['A'], x: 5, y: 6, w: 7, h: 8 });
    materializeGroupBounds(m);
    expect(m.groups[0]).toMatchObject({ x: 5, y: 6, w: 7, h: 8 });
  });

  it('with force, re-fits even groups that already had bounds', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100));
    m.groups.push({ id: 'g1', title: 'g1', nodeIds: ['A'], x: 5, y: 6, w: 7, h: 8 });
    materializeGroupBounds(m, true);
    expect(m.groups[0].w).toBeGreaterThan(7); // re-fit to wrap node A
  });

  it('materializes nested groups so the parent box wraps the child box', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100));
    m.groups.push({ id: 'outer', title: 'o', nodeIds: [] });
    m.groups.push({ id: 'inner', title: 'i', nodeIds: ['A'], parentId: 'outer' });
    materializeGroupBounds(m);
    const outer = m.groups.find((g) => g.id === 'outer')!;
    const inner = m.groups.find((g) => g.id === 'inner')!;
    expect(outer.x).toBeLessThanOrEqual(inner.x!);
    expect(outer.x! + outer.w!).toBeGreaterThanOrEqual(inner.x! + inner.w!);
  });
});

describe('resolveNodeStyle with font and stroke props', () => {
  const model = () => {
    const m = emptyModel('LR');
    m.classDefs = [
      { name: 'default', style: { fontSize: 12, strokeWidth: 1 } },
      { name: 'big', style: { fontSize: 28, fontFamily: 'serif' } },
      { name: 'dashed', style: { strokeDasharray: '5 5', strokeWidth: 4 } },
    ];
    return m;
  };

  it('inherits font and stroke props from classDef default', () => {
    const m = model();
    m.nodes = [{ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 }];
    expect(resolveNodeStyle(m, m.nodes[0])).toMatchObject({ fontSize: 12, strokeWidth: 1 });
  });

  it('lets a later class win over an earlier one, per property', () => {
    const m = model();
    m.nodes = [{ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, classes: ['big', 'dashed'] }];
    const s = resolveNodeStyle(m, m.nodes[0])!;
    expect(s.strokeWidth).toBe(4);          // dashed beats default
    expect(s.strokeDasharray).toBe('5 5');
    expect(s.fontSize).toBe(28);            // big still supplies what dashed omits
    expect(s.fontFamily).toBe('serif');
  });

  it('lets the node style beat every class', () => {
    const m = model();
    m.nodes = [{
      id: 'A', label: 'A', shape: 'rect', x: 0, y: 0,
      classes: ['big', 'dashed'], style: { fontSize: 9, strokeDasharray: '1 1' },
    }];
    const s = resolveNodeStyle(m, m.nodes[0])!;
    expect(s.fontSize).toBe(9);
    expect(s.strokeDasharray).toBe('1 1');
    expect(s.strokeWidth).toBe(4);          // untouched by the node style
  });
});

describe('nodeSize', () => {
  it('uses the classDef-resolved font, not just the node style', () => {
    const m = emptyModel('LR');
    m.classDefs = [{ name: 'big', style: { fontSize: 32 } }];
    const plain = { id: 'A', label: 'Some label', shape: 'rect' as const, x: 0, y: 0 };
    m.nodes = [plain, { ...plain, id: 'B', classes: ['big'] }];
    expect(nodeSize(m, m.nodes[1]).h).toBeGreaterThan(nodeSize(m, m.nodes[0]).h);
  });

  it('prefers manual w/h over the font estimate', () => {
    const m = emptyModel('LR');
    m.nodes = [{ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, w: 300, h: 150, style: { fontSize: 40 } }];
    expect(nodeSize(m, m.nodes[0])).toEqual({ w: 300, h: 150 });
  });
});
