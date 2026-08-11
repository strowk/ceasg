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

describe('measureTextWidth — weight', () => {
  const f = '"trebuchet ms", verdana, arial, sans-serif';
  // Under vitest's jsdom there is no canvas, so measureTextWidth takes its
  // per-codepoint fallback. That fallback used to be weight-blind, which made
  // a bold label size exactly like a plain one.
  it('estimates bold text wider than plain text', () => {
    expect(measureTextWidth('Bold', `bold 16px ${f}`))
      .toBeGreaterThan(measureTextWidth('Bold', `16px ${f}`));
  });
  it('leaves plain text unchanged', () => {
    expect(measureTextWidth('Bold', `16px ${f}`)).toBe(32.8);
  });
});
