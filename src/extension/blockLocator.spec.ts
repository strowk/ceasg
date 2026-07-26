import { describe, it, expect } from 'vitest';
import { findMermaidBlocks, sniffType, extractId } from './blockLocator';

const doc = [
  '# Title', '', '```mermaid', 'graph TD', '  A --> B', '```', '', 'text', '',
  '```mermaid', 'sequenceDiagram', '  Alice->>Bob: hi', '```', '',
].join('\n');

describe('findMermaidBlocks', () => {
  it('finds both blocks', () => { expect(findMermaidBlocks(doc)).toHaveLength(2); });
  it('extracts inner source exactly', () => {
    const b = findMermaidBlocks(doc);
    expect(b[0].source).toBe('graph TD\n  A --> B\n');
    expect(doc.slice(b[0].innerStart, b[0].innerEnd)).toBe(b[0].source);
  });
  it('sniffs types', () => {
    const b = findMermaidBlocks(doc);
    expect(b[0].type).toBe('flowchart');
    expect(b[1].type).toBe('sequence');
  });
  it('fenceStart points at opening fence', () => {
    const b = findMermaidBlocks(doc);
    expect(doc.slice(b[0].fenceStart, b[0].fenceStart + 10)).toBe('```mermaid');
  });
  it('ignores an unterminated block', () => {
    expect(findMermaidBlocks('```mermaid\ngraph TD\n')).toHaveLength(0);
  });
  it('reads an embedded id', () => {
    const t = '```mermaid\n%% ceasg:{"id":"abcd1234"} %%\ngraph TD\n```\n';
    expect(findMermaidBlocks(t)[0].id).toBe('abcd1234');
  });
});

describe('sniffType', () => {
  it('skips comments', () => { expect(sniffType('%% ceasg:{"id":"x"} %%\nflowchart LR\n')).toBe('flowchart'); });
  it('unknown for empty', () => { expect(sniffType('   \n')).toBe('unknown'); });
});

describe('extractId', () => {
  it('null when absent', () => { expect(extractId('graph TD')).toBeNull(); });
});
