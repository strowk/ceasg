import { describe, it, expect, vi } from 'vitest';
import { WysiwygEditor } from './editor';
import { mermaidToModel, removeNode } from '../../core';
import { reassignNodeMembership, reassignGroupParent } from './editor';
import { makeGroupFromNodes, ungroup } from './editor';

function make() {
  const root = document.createElement('div');
  const posts: unknown[] = [];
  const api = { postMessage: (m: unknown) => posts.push(m), getState: () => null, setState: () => {} };
  const editor = new WysiwygEditor(root, api);
  return { editor, posts, root };
}

/** Dispatch a drop on the canvas host with a fabricated dataTransfer — jsdom
 *  has no DataTransfer, and only `types` + `getData` are read. */
function fireDrop(root: HTMLElement, data: Record<string, string>, clientX = 0, clientY = 0): void {
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clientX', { value: clientX });
  Object.defineProperty(ev, 'clientY', { value: clientY });
  Object.defineProperty(ev, 'dataTransfer', {
    value: { types: Object.keys(data), getData: (t: string) => data[t] ?? '' },
  });
  (root.querySelector('#canvas') as HTMLElement).dispatchEvent(ev);
}

describe('WysiwygEditor state', () => {
  it('mutate + undo restores prior model', () => {
    const { editor } = make();
    editor.init('flowchart TB\n%% ceasg:{"id":"abcd"} %%\nA[A]-->B[B]\n');
    const before = editor.getModel().nodes.length;
    editor.mutate((m) => { m.nodes.push({ id: 'C', label: 'C', shape: 'rect', x: 10, y: 10 }); }, { commit: true });
    expect(editor.getModel().nodes.length).toBe(before + 1);
    editor.undo();
    expect(editor.getModel().nodes.length).toBe(before);
  });
  it('serialize preserves the ceasg id comment', () => {
    const { editor } = make();
    editor.init('flowchart TB\n%% ceasg:{"id":"abcd"} %%\nA[A]\n');
    expect(editor.serialize()).toContain('ceasg:{"id":"abcd"}');
  });
});

describe('reassignGroupParent', () => {
  it('nests a group into another group whose box contains its centre', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph big\nA\nend\nsubgraph small\nB\nend\n');
    const big = model.groups.find((g) => g.id === 'big')!;
    const small = model.groups.find((g) => g.id === 'small')!;
    big.x = 0; big.y = 0; big.w = 400; big.h = 400;
    small.x = 100; small.y = 100; small.w = 80; small.h = 60; // centre inside big
    reassignGroupParent(model, 'small');
    expect(model.groups.find((g) => g.id === 'small')!.parentId).toBe('big');
  });
  it('promotes a group to top-level when its centre is on empty canvas', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph outer\nsubgraph inner\nA\nend\nend\n');
    const outer = model.groups.find((g) => g.id === 'outer')!;
    const inner = model.groups.find((g) => g.id === 'inner')!;
    outer.x = 0; outer.y = 0; outer.w = 200; outer.h = 200; // pin outer's box so it doesn't follow inner
    inner.x = 900; inner.y = 900; inner.w = 50; inner.h = 50; // outside everything
    reassignGroupParent(model, 'inner');
    expect(model.groups.find((g) => g.id === 'inner')!.parentId).toBeUndefined();
  });
});

describe('reassignNodeMembership', () => {
  it('moves a node into the group whose box it is dropped on', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\nB\n');
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    g1.x = 0; g1.y = 0; g1.w = 300; g1.h = 300;
    const B = model.nodes.find((n) => n.id === 'B')!;
    B.x = 150; B.y = 150; // inside g1
    reassignNodeMembership(model, 'B');
    expect(g1.nodeIds).toContain('B');
  });
  it('removes a node from all groups when dropped on empty canvas', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\n');
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    g1.x = 0; g1.y = 0; g1.w = 100; g1.h = 100;
    const A = model.nodes.find((n) => n.id === 'A')!;
    A.x = 500; A.y = 500; // outside
    reassignNodeMembership(model, 'A');
    expect(g1.nodeIds).not.toContain('A');
  });
});

describe('create / ungroup operations', () => {
  it('wraps selected nodes in a new group with bbox bounds', () => {
    const { model } = mermaidToModel('flowchart TB\nA\nB\nC\n');
    model.nodes.forEach((n, i) => { n.x = 100 + i * 100; n.y = 100; });
    const gid = makeGroupFromNodes(model, ['A', 'B']);
    const g = model.groups.find((gr) => gr.id === gid)!;
    expect(g.nodeIds.sort()).toEqual(['A', 'B']);
    expect(g.w).toBeGreaterThan(0);
    expect(g.x).toBeDefined();
    expect(g.nodeIds).not.toContain('C');
  });

  it('nests the new group under a shared parent group', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph outer\nA\nB\nend\n');
    model.nodes.forEach((n, i) => { n.x = 100 + i * 100; n.y = 100; });
    const gid = makeGroupFromNodes(model, ['A', 'B']);
    expect(model.groups.find((g) => g.id === gid)!.parentId).toBe('outer');
  });

  it('ungroup keeps nodes and removes the group', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\n');
    ungroup(model, 'g1');
    expect(model.groups.find((g) => g.id === 'g1')).toBeUndefined();
    expect(model.nodes.find((n) => n.id === 'A')).toBeTruthy();
  });

  it('mixed selection: ungroup a group and delete a node in one pass', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\nB\n');
    // simulate deleteSelected's pass over ids [g1, B]
    const groupIds = new Set(['g1']);
    for (const id of ['g1', 'B']) {
      if (groupIds.has(id)) { ungroup(model, id); }
      else if (model.nodes.some((n) => n.id === id)) { removeNode(model, id); }
    }
    expect(model.groups.find((g) => g.id === 'g1')).toBeUndefined(); // ungrouped
    expect(model.nodes.find((n) => n.id === 'A')).toBeTruthy();      // kept
    expect(model.nodes.find((n) => n.id === 'B')).toBeUndefined();   // deleted
  });
});

describe('adding nodes from a palette', () => {
  it('addNodeAtFreeSpot cascades instead of stacking, and selects the new node', () => {
    const { editor } = make();
    editor.init('flowchart TB\nA[A]\n');

    editor.addNodeAtFreeSpot('rect');
    const nodes1 = editor.getModel().nodes;
    const first = nodes1[nodes1.length - 1];

    editor.addNodeAtFreeSpot('rect');
    const nodes2 = editor.getModel().nodes;
    const second = nodes2[nodes2.length - 1];

    expect(second.id).not.toBe(first.id);
    expect(first.x !== second.x || first.y !== second.y).toBe(true);
    expect(editor.selection!.single).toBe(second.id);
  });

  it('addNodeOfShape selects the dropped node', () => {
    const { editor } = make();
    editor.init('flowchart TB\nA[A]\n');
    editor.addNodeOfShape('diamond', 0, 0);
    const nodes = editor.getModel().nodes;
    const added = nodes[nodes.length - 1];
    expect(added.shape).toBe('diamond');
    expect(editor.selection!.single).toBe(added.id);
  });

  it('joins the subgraph whose box covers where the node lands', () => {
    const { editor } = make();
    editor.init('flowchart TB\nsubgraph g1\nA[A]\nend\n');
    // jsdom measures every element rect as zero, so the canvas centre resolves
    // to the viewBox origin. Cover that point (and the cascade's reach) so the
    // new node is unambiguously inside g1's box.
    const t = editor.viewport!.getTransform();
    const g1 = editor.getModel().groups.find((g) => g.id === 'g1')!;
    g1.x = t.vbX - 1000; g1.y = t.vbY - 1000; g1.w = 2000; g1.h = 2000;

    editor.addNodeAtFreeSpot('rect');
    const nodes = editor.getModel().nodes;
    const added = nodes[nodes.length - 1];
    expect(editor.getModel().groups.find((g) => g.id === 'g1')!.nodeIds).toContain(added.id);
  });
});

describe('canvas drop', () => {
  it('adds a node of the dropped palette shape', () => {
    const { editor, root } = make();
    editor.init('flowchart TB\nA[A]\n');
    const before = editor.getModel().nodes.length;

    fireDrop(root, { 'text/ceasg-shape': 'diamond' });

    const nodes = editor.getModel().nodes;
    expect(nodes).toHaveLength(before + 1);
    expect(nodes[nodes.length - 1].shape).toBe('diamond');
  });

  it('ignores a drop whose payload belongs to no palette', () => {
    const { editor, root } = make();
    editor.init('flowchart TB\nA[A]\n');
    const before = editor.getModel().nodes.length;

    fireDrop(root, { 'text/uri-list': 'https://example.com/' });

    expect(editor.getModel().nodes).toHaveLength(before);
  });
});

describe('canvas resize', () => {
  it('recomputes the viewBox when the ResizeObserver fires', () => {
    let fire: (() => void) | undefined;
    const g = globalThis as unknown as { ResizeObserver?: unknown };
    const had = 'ResizeObserver' in g;
    const prev = g.ResizeObserver;
    g.ResizeObserver = class {
      constructor(cb: () => void) { fire = cb; }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    try {
      const { editor, root } = make();
      editor.init('flowchart TB\nA[A]\n');
      const host = root.querySelector('#canvas') as HTMLElement;
      // jsdom lays nothing out, and the observer callback bails on a zero-sized
      // host — give it the size a real pane resize would report.
      Object.defineProperty(host, 'clientWidth', { value: 640, configurable: true });
      Object.defineProperty(host, 'clientHeight', { value: 480, configurable: true });
      const svg = host.querySelector('svg')!;
      svg.setAttribute('viewBox', 'stale');

      expect(fire).toBeDefined();
      fire!();

      const t = editor.viewport!.getTransform();
      expect(svg.getAttribute('viewBox')).toBe(`${t.vbX} ${t.vbY} ${640 / t.zoom} ${480 / t.zoom}`);
    } finally {
      // Restore so every other test keeps exercising the `typeof ResizeObserver
      // !== 'undefined'` guard.
      if (had) { g.ResizeObserver = prev; } else { delete g.ResizeObserver; }
    }
  });
});
