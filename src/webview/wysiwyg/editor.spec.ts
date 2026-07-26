import { describe, it, expect, vi } from 'vitest';
import { WysiwygEditor } from './editor';

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
