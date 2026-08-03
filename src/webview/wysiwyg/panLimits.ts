/** Pure pan-boundary arithmetic. All distances that carry a unit are screen
 *  pixels; callers working in viewBox coordinates divide by zoom first. */

/** How much of the content bounds must stay on screen, in screen px. */
export const VISIBLE_MARGIN = 80;
/** How far past the boundary a gesture may push before motion stops, in screen px. */
export const OVERSHOOT_CAP = 120;

/** The closed range a viewBox origin may occupy on one axis while keeping at
 *  least `margin` of overlap with the content. When the viewport is so small
 *  that no position satisfies the rule, the range collapses to its midpoint
 *  rather than inverting. */
export function allowedRange(
  contentMin: number, contentMax: number, viewSize: number, margin: number,
): { lo: number; hi: number } {
  const lo = contentMin + margin - viewSize;
  const hi = contentMax - margin;
  if (lo > hi) {
    const mid = (lo + hi) / 2;
    return { lo: mid, hi: mid };
  }
  return { lo, hi };
}

/** Signed distance outside [lo, hi]; 0 when inside or exactly on an edge. */
export function overshootOf(value: number, lo: number, hi: number): number {
  if (value > hi) { return value - hi; }
  if (value < lo) { return value - lo; }
  return 0;
}

/** Scale an outward delta by how far the boundary has already been pushed, so
 *  motion asymptotically halts at `cap`. Sign is preserved; the factor floors
 *  at 0 so an over-cap overshoot can never be pushed further out. */
export function dampenDelta(delta: number, overshoot: number, cap: number): number {
  return delta * Math.max(0, 1 - overshoot / cap);
}

/** Exponential decay of an overshoot toward 0, parameterised by elapsed time
 *  rather than frame count so the settle takes the same ~200ms at any refresh
 *  rate. Snaps to 0 below half a pixel so the animation loop terminates. */
export function springStep(overshoot: number, dtMs: number): number {
  const next = overshoot * Math.pow(0.001, dtMs / 200);
  return Math.abs(next) < 0.5 ? 0 : next;
}
