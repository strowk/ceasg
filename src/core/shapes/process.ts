import { hline, polygon, rect, vline } from './primitives';
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
  {
    name: 'lin-rect',
    label: 'Lined process',
    group: 'process',
    aliases: ['lin-proc', 'lined-process', 'lined-rectangle', 'shaded-process'],
    size: (b) => ({ w: b.w + 12, h: b.h }),
    render: (g) => [
      rect(g.left, g.top, g.w, g.h, 0),
      vline(g.left + 10, g.top, g.bottom),
    ],
  },
  {
    name: 'div-rect',
    label: 'Divided process',
    group: 'process',
    aliases: ['div-proc', 'divided-process', 'divided-rectangle'],
    size: (b) => ({ w: b.w, h: b.h + 12 }),
    render: (g) => [
      rect(g.left, g.top, g.w, g.h, 0),
      hline(g.top + Math.min(g.h * 0.28, 16), g.left, g.right),
    ],
  },
  {
    name: 'sl-rect',
    label: 'Manual input',
    group: 'process',
    aliases: ['manual-input', 'sloped-rectangle'],
    size: (b) => ({ w: b.w, h: b.h + 14 }),
    render: (g) => {
      const s = Math.min(g.h * 0.3, 14);
      return [polygon([
        [g.left, g.top + s], [g.right, g.top], [g.right, g.bottom], [g.left, g.bottom],
      ])];
    },
  },
];
