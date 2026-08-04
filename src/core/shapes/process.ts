/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): `fr-rect`, `trap-b`, `trap-t` and `slantOf` are that code, geometry
 * unchanged and restructured into registry entries; the rest is new.
 */

import { STACK_DEPTH, hline, polygon, rect, vline } from './primitives';
import { cornerTag } from './documents';
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
  {
    name: 'tag-rect',
    label: 'Tagged process',
    group: 'process',
    aliases: ['tag-proc', 'tagged-process', 'tagged-rectangle'],
    size: (b) => ({ w: b.w + 14, h: b.h }),
    render: (g) => [rect(g.left, g.top, g.w, g.h, 0), cornerTag(g)],
  },
  {
    name: 'st-rect',
    label: 'Multi-process',
    group: 'process',
    aliases: ['processes', 'procs', 'stacked-rectangle'],
    size: (b) => ({ w: b.w + STACK_DEPTH * 2, h: b.h + STACK_DEPTH * 2 }),
    render: (g) => {
      // Drawn back-to-front. The body is inset by the full stack depth so the
      // copies fill the space toward the box edges rather than escaping it.
      const d = STACK_DEPTH;
      const w = g.w - d * 2;
      const h = g.h - d * 2;
      return [
        rect(g.left + d * 2, g.top, w, h, 0),
        rect(g.left + d, g.top + d, w, h, 0),
        rect(g.left, g.top + d * 2, w, h, 0),
      ];
    },
  },
];
