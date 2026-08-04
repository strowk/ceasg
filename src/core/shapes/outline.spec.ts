import { describe, it, expect } from 'vitest';
import { rayPolygonHit } from './outline';

/** Unit square centred on the origin. */
const SQUARE: Array<[number, number]> = [[-10, -10], [10, -10], [10, 10], [-10, 10]];

describe('rayPolygonHit', () => {
  it('finds the crossing on a straight ray', () => {
    expect(rayPolygonHit(0, 0, 1, 0, SQUARE)).toEqual({ x: 10, y: 0 });
  });

  it('finds the crossing on a diagonal ray', () => {
    const hit = rayPolygonHit(0, 0, 1, 1, SQUARE)!;
    expect(hit.x).toBeCloseTo(10);
    expect(hit.y).toBeCloseTo(10);
  });

  it('respects direction, not just the line', () => {
    expect(rayPolygonHit(0, 0, -1, 0, SQUARE)).toEqual({ x: -10, y: 0 });
  });

  it('returns the far crossing for a triangle apex', () => {
    const tri: Array<[number, number]> = [[0, -10], [10, 10], [-10, 10]];
    const hit = rayPolygonHit(0, 0, 0, -1, tri)!;
    expect(hit.y).toBeCloseTo(-10);
  });

  it('returns null when the polygon is degenerate', () => {
    expect(rayPolygonHit(0, 0, 1, 0, [])).toBeNull();
    expect(rayPolygonHit(0, 0, 0, 0, SQUARE)).toBeNull();
  });
});
