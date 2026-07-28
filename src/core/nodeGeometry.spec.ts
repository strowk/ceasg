import { describe, it, expect } from 'vitest';
import { estimateNodeSize, NODE_H, MIN_W } from './nodeGeometry';
import { measureTextWidth, BASE_FONT_FAMILY } from './textMetrics';

describe('estimateNodeSize', () => {
  it('respects manual overrides', () => {
    const s = estimateNodeSize({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, w: 200, h: 100 });
    expect(s).toEqual({ w: 200, h: 100 });
  });
  it('gives a sane default size for a short label', () => {
    const s = estimateNodeSize({ id: 'A', label: 'Hi', shape: 'rect', x: 0, y: 0 });
    expect(s.w).toBeGreaterThanOrEqual(MIN_W);
    expect(s.h).toBe(NODE_H);
  });
  it('makes circles square-ish', () => {
    const s = estimateNodeSize({ id: 'A', label: 'Hi', shape: 'circle', x: 0, y: 0 });
    expect(Math.abs(s.w - s.h)).toBeLessThanOrEqual(2);
  });

  describe('font-aware sizing', () => {
    const rect = (label: string) => ({ id: 'A', label, shape: 'rect' as const, x: 0, y: 0 });

    it('reproduces the historical constants at the default font size', () => {
      // Passing no style, an explicit 16px, or the base family must all agree
      // with the pre-font-aware numbers, so unstyled diagrams keep their layout.
      expect(estimateNodeSize(rect('Hi')).h).toBe(NODE_H);
      expect(estimateNodeSize(rect('Hi'), { fontSize: 16 }).h).toBe(NODE_H);
      expect(estimateNodeSize(rect('a\nb')).h).toBe(NODE_H + 16);
      expect(estimateNodeSize(rect('a\nb\nc')).h).toBe(NODE_H + 32);
      expect(estimateNodeSize(rect('Hi'), {})).toEqual(estimateNodeSize(rect('Hi')));
    });

    it('grows the box for a larger font size', () => {
      const plain = estimateNodeSize(rect('A longer label'));
      const big = estimateNodeSize(rect('A longer label'), { fontSize: 32 });
      expect(big.h).toBeGreaterThan(plain.h);
      expect(big.w).toBeGreaterThan(plain.w);
    });

    it('scales height per line at a larger font size', () => {
      expect(estimateNodeSize(rect('a\nb'), { fontSize: 24 }).h)
        .toBe(estimateNodeSize(rect('a'), { fontSize: 24 }).h + 24);
    });

    it('keeps the diamond height floor but grows past it', () => {
      const dia = (style?: { fontSize: number }) =>
        estimateNodeSize({ id: 'A', label: 'Hi', shape: 'diamond', x: 0, y: 0 }, style).h;
      expect(dia()).toBe(72);
      expect(dia({ fontSize: 12 })).toBe(72); // floor holds for small fonts
      expect(dia({ fontSize: 32 })).toBeGreaterThan(72);
    });

    it('still honours manual w/h overrides regardless of font', () => {
      const s = estimateNodeSize({ ...rect('Hi'), w: 200, h: 100 }, { fontSize: 40 });
      expect(s).toEqual({ w: 200, h: 100 });
    });
  });

  describe('diamond label fit', () => {
    // A rhombus contains a `tw x th` label only where tw/w + th/h <= 1, so a
    // diamond that merely pads by a constant pinches its text as the label grows.
    const fit = (label: string, style?: { fontSize?: number }) => {
      const node = { id: 'A', label, shape: 'diamond' as const, x: 0, y: 0 };
      const { w, h } = estimateNodeSize(node, style);
      const lines = label.split('\n');
      const fontSize = style?.fontSize ?? 16;
      const tw = Math.max(...lines.map((l) => measureTextWidth(l, `${fontSize}px ${BASE_FONT_FAMILY}`)));
      return tw / w + (fontSize * lines.length) / h;
    };

    it('keeps a long label inside the rhombus', () => {
      expect(fit('Is the value greater than zero?')).toBeLessThanOrEqual(0.71);
    });

    it('keeps a large-font label inside the rhombus', () => {
      expect(fit('Decide about this?', { fontSize: 26 })).toBeLessThanOrEqual(0.71);
    });

    it('keeps a multi-line label inside the rhombus', () => {
      expect(fit('two lines\nof label here')).toBeLessThanOrEqual(0.71);
    });

    it('leaves a comfortable short label at its historical size', () => {
      const s = estimateNodeSize({ id: 'A', label: 'Choice', shape: 'diamond', x: 0, y: 0 });
      expect(s).toEqual({ w: 110, h: 72 });
    });
  });
});
