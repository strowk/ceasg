import { describe, it, expect, vi } from 'vitest';
import { WysiwygEditor } from './editor';
import { mermaidToModel } from '../../core';
import { reassignNodeMembership, reassignGroupParent } from './editor';

function make() {
  const root = document.createElement('div');
  const posts: unknown[] = [];
  const api = { postMessage: (m: unknown) => posts.push(m), getState: () => null, setState: () => {} };
  const editor = new WysiwygEditor(root, api);
  return { editor, posts };
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
