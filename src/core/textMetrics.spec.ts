import { describe, it, expect } from 'vitest';
import { measureTextWidth, BASE_FONT_SIZE, BASE_FONT_FAMILY } from './textMetrics';

describe('measureTextWidth', () => {
  it('scales with the font size in the font string', () => {
    const at = (px: number) => measureTextWidth('hello world', `${px}px ${BASE_FONT_FAMILY}`);
    expect(at(32)).toBeGreaterThan(at(BASE_FONT_SIZE));
    expect(at(8)).toBeLessThan(at(BASE_FONT_SIZE));
  });

  it('grows with the text', () => {
    expect(measureTextWidth('a longer string')).toBeGreaterThan(measureTextWidth('a'));
  });

  it('counts fullwidth characters as double width', () => {
    // The estimate path must not treat CJK as narrow, or wide labels overflow.
    expect(measureTextWidth('日本語')).toBeGreaterThan(measureTextWidth('abc'));
  });
});
