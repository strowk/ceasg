import { describe, it, expect } from 'vitest';
import { estimateNodeSize, NODE_H, MIN_W } from './nodeGeometry';

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
});
