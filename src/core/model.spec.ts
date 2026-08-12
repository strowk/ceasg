import { describe, it, expect } from 'vitest';
import { emptyModel, nextNodeId, cloneModel, removeNode, NODE_SHAPES, SHAPE_LABELS, resolveNodeStyle, resolveGroupStyle, nodeSize } from './model';
import type { DiagramGroup } from './model';
import { ALL_SHAPES } from './shapes';
import {
  groupChildren, groupBounds, assignGroupToParent,
  groupDescendantNodeIds, translateGroup, removeGroup, GROUP_PAD,
  materializeGroupBounds, endpointGeometry, isGroupId, newGroupId,
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
  it('exposes 48 node shapes', () => { expect(NODE_SHAPES).toHaveLength(48); });
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
    m.groups.push({ id: 'g1', title: 'g1', nodeIds: ['A'] });
    const c = cloneModel(m);
    c.nodes[0].x = 99;
    expect(m.nodes[0].x).toBe(1);
    c.groups[0].nodeIds.push('B');
    expect(m.groups[0].nodeIds).toEqual(['A']);
  });
  it('cloneModel keeps a group titleFormat and its box', () => {
    const m = emptyModel();
    m.groups.push({
      id: 'g1', title: '**Bold**', titleFormat: 'markdown', nodeIds: [],
      parentId: 'g0', x: 5, y: 6, w: 7, h: 8,
    });
    const g = cloneModel(m).groups[0];
    expect(g.titleFormat).toBe('markdown');
    expect(g.parentId).toBe('g0');
    expect({ x: g.x, y: g.y, w: g.w, h: g.h }).toEqual({ x: 5, y: 6, w: 7, h: 8 });
  });
  it('cloneModel round-trips every DiagramGroup field', () => {
    // Guard against a future field being added to `DiagramGroup` without
    // cloneModel copying it: undo would then write the loss to the user's file.
    const full: Required<DiagramGroup> = {
      id: 'g1', title: 'T', titleFormat: 'markdown', nodeIds: ['A', 'B'],
      parentId: 'g0', x: 1, y: 2, w: 3, h: 4,
      style: { fillColor: '#f00', extra: ['rx:4'] }, classes: ['hot'],
    };
    const m = emptyModel();
    m.groups.push({
      ...full,
      nodeIds: [...full.nodeIds],
      classes: [...full.classes],
      style: { ...full.style, extra: [...full.style.extra!] },
    });
    const clone = cloneModel(m).groups[0]!;
    expect(clone).toEqual(full);
    // Deep, not shared: mutating the clone must not reach the original.
    clone.classes!.push('cold');
    clone.style!.extra!.push('ry:4');
    expect(m.groups[0]!.classes).toEqual(['hot']);
    expect(m.groups[0]!.style!.extra).toEqual(['rx:4']);
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

  it('removeGroup drops edges touching the group but keeps unrelated ones', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 0, 0), nodeAt('D', 200, 0));
    m.groups.push({ id: 'S1', title: 'Pipeline', nodeIds: ['A'] });
    m.edges.push({ id: 'e1', from: 'S1', to: 'D', label: '', kind: 'arrow' });
    m.edges.push({ id: 'e2', from: 'D', to: 'S1', label: '', kind: 'arrow' });
    m.edges.push({ id: 'e3', from: 'A', to: 'D', label: '', kind: 'arrow' });
    removeGroup(m, 'S1');
    expect(m.edges.map((e) => e.id)).toEqual(['e3']);
    // ...and the members it carried are still there.
    expect(m.nodes.map((n) => n.id)).toEqual(['A', 'D']);
  });
});

describe('endpoint id namespace', () => {
  it('endpointGeometry gives a node its centre and rendered size', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 60));
    expect(endpointGeometry(m, 'A')).toEqual({ x: 100, y: 60, w: 80, h: 40, shape: 'rect' });
  });

  it('endpointGeometry converts a stored group box to its centre', () => {
    const m = emptyModel('TB');
    m.groups.push({ id: 'S1', title: 'Pipeline', nodeIds: [], x: 10, y: 20, w: 100, h: 60 });
    expect(endpointGeometry(m, 'S1')).toEqual({ x: 60, y: 50, w: 100, h: 60, shape: 'rect' });
  });

  it('endpointGeometry centres a derived group box the same way', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100), nodeAt('B', 300, 100));
    m.groups.push({ id: 'S1', title: 'Pipeline', nodeIds: ['A', 'B'] });
    const b = groupBounds(m, m.groups[0]);
    expect(endpointGeometry(m, 'S1')).toEqual({
      x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h, shape: 'rect',
    });
  });

  it('endpointGeometry returns undefined for an unknown id', () => {
    expect(endpointGeometry(emptyModel('TB'), 'nope')).toBeUndefined();
  });

  it('a node wins over a group of the same id, so a collision stays defined', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('S1', 5, 5));
    m.groups.push({ id: 'S1', title: 'Pipeline', nodeIds: [], x: 900, y: 900, w: 10, h: 10 });
    expect(endpointGeometry(m, 'S1')).toMatchObject({ x: 5, y: 5 });
  });

  it('isGroupId distinguishes a subgraph id from a node id', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 0, 0));
    m.groups.push({ id: 'S1', title: 'Pipeline', nodeIds: ['A'] });
    expect(isGroupId(m, 'S1')).toBe(true);
    expect(isGroupId(m, 'A')).toBe(false);
  });

  it('nextNodeId skips an id already taken by a group', () => {
    const m = emptyModel('TB');
    m.groups.push({ id: 'A', title: 'A', nodeIds: [] });
    expect(nextNodeId(m)).toBe('B');
  });

  it('newGroupId skips ids already taken by nodes', () => {
    const m = emptyModel('TB');
    for (let i = 1; i <= 100; i++) m.nodes.push(nodeAt(`sub${i}`, 0, 0));
    const id = newGroupId(m);
    expect(m.nodes.some((n) => n.id === id)).toBe(false);
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

describe('resolveGroupStyle', () => {
  it('layers a group class under its own style, ignoring classDef default', () => {
    const m = emptyModel();
    m.classDefs.push({ name: 'default', style: { fillColor: '#eee' } });
    m.classDefs.push({ name: 'hot', style: { fillColor: '#f00', strokeColor: '#900' } });
    m.groups.push({ id: 'S', title: 'S', nodeIds: [], classes: ['hot'], style: { strokeColor: '#00f' } });
    expect(resolveGroupStyle(m, m.groups[0]!)).toEqual({ fillColor: '#f00', strokeColor: '#00f' });
  });

  it('returns undefined for a group with no class and no style', () => {
    const m = emptyModel();
    m.classDefs.push({ name: 'default', style: { fillColor: '#eee' } });
    m.groups.push({ id: 'S', title: 'S', nodeIds: [] });
    expect(resolveGroupStyle(m, m.groups[0]!)).toBeUndefined();
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

describe('shape exports derive from the registry', () => {
  it('NODE_SHAPES lists every registered shape in registry order', () => {
    expect(NODE_SHAPES).toEqual(ALL_SHAPES.map((d) => d.name));
  });

  it('SHAPE_LABELS has a label for every registered shape', () => {
    for (const def of ALL_SHAPES) {
      expect(SHAPE_LABELS[def.name]).toBe(def.label);
    }
  });

  it('keeps the historical labels for shapes that existed before', () => {
    expect(SHAPE_LABELS['rect']).toBe('Rectangle');
    expect(SHAPE_LABELS['cyl']).toBe('Cylinder / database');
    expect(SHAPE_LABELS['diam']).toBe('Decision');
  });
});
