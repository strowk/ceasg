import { ellipse, polygon, rect } from './primitives';
import type { ShapeDef, ShapeGeom } from './types';

function slantOf(g: ShapeGeom): number {
  return Math.min(g.hw * 0.5, 20);
}

export const DATA_SHAPES: ShapeDef[] = [
  {
    name: 'cyl',
    label: 'Cylinder / database',
    group: 'data',
    aliases: ['cylinder', 'db', 'database'],
    bracket: (id, label) => `${id}[(${label})]`,
    size: (b) => ({ w: b.w, h: b.h + 20 }),
    render: (g) => {
      const ry = Math.min(g.hh * 0.5, 9);
      return [
        rect(g.left, g.top + ry, g.w, g.h - 2 * ry, 0),
        ellipse(g.cx, g.top + ry, g.hw, ry),
      ];
    },
  },
  {
    name: 'lean-r',
    label: 'Parallelogram',
    group: 'data',
    aliases: ['parallelogram', 'lean-right', 'in-out'],
    bracket: (id, label) => `${id}[/${label}/]`,
    size: (b) => ({ w: b.w + 46, h: b.h }),
    render: (g) => {
      const s = slantOf(g);
      return [polygon([
        [g.left + s, g.top], [g.right, g.top], [g.right - s, g.bottom], [g.left, g.bottom],
      ])];
    },
  },
  {
    name: 'lean-l',
    label: 'Parallelogram (alt)',
    group: 'data',
    aliases: ['parallelogram-alt', 'lean-left', 'out-in'],
    bracket: (id, label) => `${id}[\\${label}\\]`,
    size: (b) => ({ w: b.w + 46, h: b.h }),
    render: (g) => {
      const s = slantOf(g);
      return [polygon([
        [g.left, g.top], [g.right - s, g.top], [g.right, g.bottom], [g.left + s, g.bottom],
      ])];
    },
  },
];
