import { polygon, rect, vline } from './primitives';
import type { ShapeDef, ShapeGeom } from './types';

/** Shared slant for the parallelogram/trapezoid family (shapes.ts:51). */
export function slantOf(g: ShapeGeom): number {
  return Math.min(g.hw * 0.5, 20);
}

export const PROCESS_SHAPES: ShapeDef[] = [
  {
    name: 'fr-rect',
    label: 'Subprocess',
    group: 'process',
    aliases: ['subroutine', 'subproc', 'subprocess', 'framed-rectangle'],
    bracket: (id, label) => `${id}[[${label}]]`,
    render: (g) => {
      const inset = 7;
      return [
        rect(g.left, g.top, g.w, g.h, 3),
        vline(g.left + inset, g.top, g.bottom),
        vline(g.right - inset, g.top, g.bottom),
      ];
    },
  },
  {
    name: 'trap-b',
    label: 'Trapezoid',
    group: 'process',
    aliases: ['trapezoid', 'trapezoid-bottom', 'priority'],
    bracket: (id, label) => `${id}[/${label}\\]`,
    size: (b) => ({ w: b.w + 46, h: b.h }),
    render: (g) => {
      const s = slantOf(g);
      return [polygon([
        [g.left + s, g.top], [g.right - s, g.top], [g.right, g.bottom], [g.left, g.bottom],
      ])];
    },
  },
  {
    name: 'trap-t',
    label: 'Manual operation',
    group: 'process',
    aliases: ['trapezoid-alt', 'trapezoid-top', 'inv-trapezoid', 'manual'],
    bracket: (id, label) => `${id}[\\${label}/]`,
    size: (b) => ({ w: b.w + 46, h: b.h }),
    render: (g) => {
      const s = slantOf(g);
      return [polygon([
        [g.left, g.top], [g.right, g.top], [g.right - s, g.bottom], [g.left + s, g.bottom],
      ])];
    },
  },
];
