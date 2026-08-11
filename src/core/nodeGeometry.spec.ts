import { describe, it, expect } from 'vitest';
import { estimateNodeSize, edgeLabelSize, nodeLabelLayout, edgeLabelLayout, NODE_H, MIN_W } from './nodeGeometry';
import { measureTextWidth, BASE_FONT_FAMILY } from './textMetrics';
import { SHAPES } from './shapes';
import type { DiagramNode } from './model';

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

describe('sizing comes from the registry', () => {
  const node = (shape: string) => ({ id: 'A', label: 'Hi', shape, x: 0, y: 0 } as never);

  it('applies a shape size rule when the def has one', () => {
    expect(estimateNodeSize(node('hex')).w)
      .toBe(estimateNodeSize(node('rect')).w + 40);
  });

  it('uses the base box for shapes with no size rule', () => {
    expect(SHAPES['fr-rect'].size).toBeUndefined();
    expect(estimateNodeSize(node('fr-rect'))).toEqual(estimateNodeSize(node('rect')));
  });

  it('falls back to the base box for an unregistered shape', () => {
    expect(() => estimateNodeSize(node('not-a-shape'))).not.toThrow();
    expect(estimateNodeSize(node('not-a-shape')).w).toBeGreaterThan(0);
  });
});

function node(over: Partial<DiagramNode> = {}): DiagramNode {
  return { id: 'A', label: 'Hi', shape: 'rect', x: 0, y: 0, ...over };
}

describe('nodeLabelLayout', () => {
  it('leaves a plain label as one unstyled run', () => {
    expect(nodeLabelLayout(node({ label: '**B**' })).lines)
      .toEqual([[{ text: '**B**' }]]);
  });
  it('styles a markdown label', () => {
    expect(nodeLabelLayout(node({ label: '**B**', labelFormat: 'markdown' })).lines)
      .toEqual([[{ text: 'B', bold: true }]]);
  });
  it('wraps a markdown label at the default width', () => {
    const long = 'the quick brown fox jumps over the lazy dog again and again';
    expect(nodeLabelLayout(node({ label: long, labelFormat: 'markdown' })).lines.length)
      .toBeGreaterThan(1);
  });
  it('wraps to a manual node width instead', () => {
    const long = 'the quick brown fox jumps over the lazy dog again and again';
    const narrow = nodeLabelLayout(node({ label: long, labelFormat: 'markdown', w: 90, h: 44 }));
    const dflt = nodeLabelLayout(node({ label: long, labelFormat: 'markdown' }));
    expect(narrow.lines.length).toBeGreaterThan(dflt.lines.length);
  });
  it('measures in the node font size', () => {
    const big = nodeLabelLayout(node({ label: 'Hi' }), { fontSize: 32 });
    expect(big.height).toBe(32);
    expect(big.width).toBeGreaterThan(nodeLabelLayout(node({ label: 'Hi' })).width);
  });
});

describe('estimateNodeSize — markup', () => {
  // The whole point of the shared layout: a bold label reserves a wider box.
  it('sizes a bold markdown label wider than the same plain text', () => {
    const bold = estimateNodeSize(node({ label: '**Bold text here**', labelFormat: 'markdown' }));
    const plain = estimateNodeSize(node({ label: 'Bold text here' }));
    expect(bold.w).toBeGreaterThan(plain.w);
  });
  it('grows in height, not width, when a markdown label wraps', () => {
    const long = 'the quick brown fox jumps over the lazy dog again and again';
    const wrapped = estimateNodeSize(node({ label: long, labelFormat: 'markdown' }));
    const flat = estimateNodeSize(node({ label: long }));
    expect(wrapped.h).toBeGreaterThan(flat.h);
    expect(wrapped.w).toBeLessThan(flat.w);
  });
  // Regression guard: unmarked labels must keep their historical geometry.
  it('is unchanged for a plain single-line label', () => {
    expect(estimateNodeSize(node({ label: 'Start' }))).toEqual({ w: 80, h: 44 });
  });
  it('is unchanged for a plain multi-line label', () => {
    expect(estimateNodeSize(node({ label: 'a\nb\nc' })).h).toBe(16 * 3 + 28);
  });
});

describe('edgeLabelLayout', () => {
  it('styles a markdown edge label', () => {
    const layout = edgeLabelLayout({ id: 'e', from: 'A', to: 'B', label: '**y**', kind: 'arrow', labelFormat: 'markdown' });
    expect(layout.lines).toEqual([[{ text: 'y', bold: true }]]);
  });
  it('sizes a bold edge label wider than plain', () => {
    const bold = edgeLabelSize({ id: 'e', from: 'A', to: 'B', label: '**yes please**', kind: 'arrow', labelFormat: 'markdown' });
    const plain = edgeLabelSize({ id: 'e', from: 'A', to: 'B', label: 'yes please', kind: 'arrow' });
    expect(bold.w).toBeGreaterThan(plain.w);
  });
});
