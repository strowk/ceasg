import { describe, it, expect } from 'vitest';
import { geom, polygon, rect, path, vline, wavyBottom, braceD } from './primitives';

describe('geom', () => {
  it('derives edges and half-extents from centre and size', () => {
    const g = geom(100, 50, 80, 44);
    expect(g).toEqual({
      cx: 100, cy: 50, w: 80, h: 44,
      left: 60, right: 140, top: 28, bottom: 72,
      hw: 40, hh: 22,
    });
  });

  it('clamps degenerate sizes to the floor instead of producing negatives', () => {
    const g = geom(0, 0, 0, -10);
    expect(g.w).toBeGreaterThan(0);
    expect(g.h).toBeGreaterThan(0);
    expect(g.right).toBeGreaterThan(g.left);
    expect(g.bottom).toBeGreaterThan(g.top);
  });
});

describe('primitives', () => {
  it('polygon joins points into a points attribute', () => {
    const p = polygon([[0, 0], [10, 0], [5, 10]]);
    expect(p.getAttribute('points')).toBe('0,0 10,0 5,10');
  });

  it('polygon emits no NaN for degenerate input', () => {
    const p = polygon([[NaN, 0], [10, 0]]);
    expect(p.getAttribute('points')).not.toContain('NaN');
  });

  it('rect sets position, size and corner radius', () => {
    const r = rect(1, 2, 30, 40, 5);
    expect(r.getAttribute('x')).toBe('1');
    expect(r.getAttribute('width')).toBe('30');
    expect(r.getAttribute('rx')).toBe('5');
  });

  it('path sets the d attribute', () => {
    expect(path('M0,0 L10,10').getAttribute('d')).toBe('M0,0 L10,10');
  });

  it('vline draws a vertical line with no fill', () => {
    const l = vline(5, 0, 10);
    expect(l.getAttribute('x1')).toBe('5');
    expect(l.getAttribute('x2')).toBe('5');
    expect(l.getAttribute('fill')).toBe('none');
  });
});

describe('curve fragments', () => {
  it('wavyBottom returns absolute commands only', () => {
    const d = wavyBottom(geom(100, 50, 80, 44), 6);
    expect(d).not.toMatch(/[a-z]/);
  });

  it('wavyBottom stays within the box vertically', () => {
    const g = geom(100, 50, 80, 44);
    const ys = (wavyBottom(g, 6).match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
      .filter((_, i) => i % 2 === 1);
    for (const y of ys) { expect(y).toBeLessThanOrEqual(g.bottom + 0.001); }
  });

  it('braceD draws opposite curves for left and right', () => {
    expect(braceD(10, 0, 40, 'left')).not.toBe(braceD(10, 0, 40, 'right'));
  });
});
