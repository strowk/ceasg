import { describe, it, expect } from 'vitest';
import { locateById, computeInnerEdit } from './documentSync';

const doc = '```mermaid\n%% ceasg:{"id":"abcd"} %%\ngraph TD\n  A --> B\n```\n';

describe('locateById', () => {
  it('finds by id', () => { expect(locateById(doc, 'abcd')?.id).toBe('abcd'); });
  it('undefined for unknown', () => { expect(locateById(doc, 'nope')).toBeUndefined(); });
});

describe('computeInnerEdit', () => {
  it('covers only inner source', () => {
    const e = computeInnerEdit(doc, 'abcd', '%% ceasg:{"id":"abcd"} %%\ngraph LR\n');
    expect(e).not.toBeNull();
    const applied = doc.slice(0, e!.start) + e!.replacement + doc.slice(e!.end);
    expect(applied).toBe('```mermaid\n%% ceasg:{"id":"abcd"} %%\ngraph LR\n```\n');
  });
  it('no-op when unchanged', () => {
    expect(computeInnerEdit(doc, 'abcd', '%% ceasg:{"id":"abcd"} %%\ngraph TD\n  A --> B\n')).toBeNull();
  });
  it('returns null when the block id is not found', () => {
    expect(computeInnerEdit(doc, 'nope', 'graph LR\n')).toBeNull();
  });
  it('treats CRLF vs LF as unchanged (no spurious edit)', () => {
    const crlf = '```mermaid\r\n%% ceasg:{"id":"abcd"} %%\r\ngraph TD\r\n```\r\n';
    // same logical content the webview would send back with LF endings
    expect(computeInnerEdit(crlf, 'abcd', '%% ceasg:{"id":"abcd"} %%\ngraph TD\n')).toBeNull();
  });
});
