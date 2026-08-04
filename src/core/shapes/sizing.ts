/*
 * Shared sizing rules. Kept apart from primitives.ts, which only builds SVG.
 */

import type { SizingCtx } from './types';

/**
 * Grow a box until its label fits inside a shape that pinches toward a point.
 *
 * A rhombus or triangle contains a tw x th label only where tw/w + th/h <= 1,
 * so fixed padding gets relatively tighter as the label grows and long or
 * multi-line labels overflow outright. Both axes grow uniformly, preserving the
 * shape's aspect. `fit` is how much of that budget the label may occupy: 0.7
 * leaves a 30% margin.
 */
export function fitGrow(
  base: { w: number; h: number },
  ctx: Pick<SizingCtx, 'widest' | 'fontSize' | 'lineCount'>,
  fit: number,
): { w: number; h: number } {
  const grow = (ctx.widest / base.w + (ctx.fontSize * ctx.lineCount) / base.h) / fit;
  if (grow <= 1) { return base; }
  return { w: Math.ceil(base.w * grow), h: Math.ceil(base.h * grow) };
}
