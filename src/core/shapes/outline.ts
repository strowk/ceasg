/*
 * Ray/outline intersection for edge anchoring. Shapes whose filled region
 * diverges sharply from their bounding box declare an outline so arrowheads
 * land on the drawn border rather than in whitespace beside it.
 */

import type { Pt } from './types';

/**
 * Where a ray from (ox, oy) in direction (dx, dy) leaves `poly`.
 *
 * Returns the farthest forward crossing, which is the border point for a
 * convex outline and the outer border for a concave one — the arrowhead should
 * stop at the shape's silhouette, not at an interior notch.
 * Returns null for a degenerate polygon or a zero-length direction.
 */
export function rayPolygonHit(
  ox: number, oy: number, dx: number, dy: number, poly: Pt[],
): { x: number; y: number } | null {
  if (poly.length < 3) { return null; }
  if (dx === 0 && dy === 0) { return null; }
  let best = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]!;
    const [bx, by] = poly[(i + 1) % poly.length]!;
    const ex = bx - ax;
    const ey = by - ay;
    // Solve origin + t*dir = a + u*edge for t > 0 and u in [0, 1]. Strictly
    // t > 0, not >= 0: the caller's origin is always a shape's own centre,
    // which for a pinched outline (hourglass) is itself a vertex shared by
    // two edges. Accepting t === 0 there reports the ray's own origin as a
    // "hit" for every direction that edge's line equation solves exactly —
    // i.e. the shape's centre, through the label, regardless of direction.
    // A ray origin is always strictly interior to a well-formed outline, so
    // every genuine crossing has t > 0; excluding t === 0 discards only that
    // degenerate self-touch, never a real border point.
    const denom = dx * ey - dy * ex;
    if (denom === 0) { continue; }
    const t = ((ax - ox) * ey - (ay - oy) * ex) / denom;
    const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
    if (t > 0 && u >= 0 && u <= 1 && t > best) { best = t; }
  }
  if (!Number.isFinite(best) || best < 0) { return null; }
  return { x: ox + dx * best, y: oy + dy * best };
}
