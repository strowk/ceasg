import { describe, it, expect } from 'vitest';
import { modeForType } from './blockLocator';

describe('modeForType', () => {
  it('routes flowchart to wysiwyg', () => {
    expect(modeForType('flowchart')).toBe('wysiwyg');
  });
  it('routes other types to preview', () => {
    for (const t of ['sequence', 'class', 'state', 'er', 'unknown']) {
      expect(modeForType(t)).toBe('preview');
    }
  });
});
