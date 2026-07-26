import { describe, it, expect } from 'vitest';
import { replaceBlockInner, ensureBlockId } from './blockText';
import { findMermaidBlocks } from './blockLocator';

describe('replaceBlockInner', () => {
  it('replaces only inner, keeps fences', () => {
    const doc = 'a\n```mermaid\ngraph TD\n```\nb\n';
    const out = replaceBlockInner(doc, findMermaidBlocks(doc)[0], 'graph LR\n  X --> Y\n');
    expect(out).toBe('a\n```mermaid\ngraph LR\n  X --> Y\n```\nb\n');
  });
  it('appends trailing newline', () => {
    const doc = '```mermaid\ngraph TD\n```\n';
    const out = replaceBlockInner(doc, findMermaidBlocks(doc)[0], 'graph LR');
    expect(out).toBe('```mermaid\ngraph LR\n```\n');
  });
});

describe('ensureBlockId', () => {
  it('prepends id comment when absent', () => {
    expect(ensureBlockId('graph TD\n', 'abcd1234')).toBe('%% ceasg:{"id":"abcd1234"} %%\ngraph TD\n');
  });
  it('leaves existing id untouched', () => {
    const s = '%% ceasg:{"id":"zzzz"} %%\ngraph TD\n';
    expect(ensureBlockId(s, 'abcd1234')).toBe(s);
  });
});
