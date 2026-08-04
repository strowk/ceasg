/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): geometry unchanged, restructured into registry entries.
 */

import { circle, polygon, rect, unfilled } from './primitives';
import { fitGrow } from './sizing';
import type { ShapeDef } from './types';

export const BASIC_SHAPES: ShapeDef[] = [
  {
    name: 'rect',
    label: 'Rectangle',
    group: 'basic',
    aliases: ['proc', 'process', 'rectangle'],
    bracket: (id, label) => `${id}[${label}]`,
    render: (g) => [rect(g.left, g.top, g.w, g.h, 4)],
  },
  {
    name: 'rounded',
    label: 'Rounded',
    group: 'basic',
    aliases: ['round', 'event'],
    bracket: (id, label) => `${id}(${label})`,
    render: (g) => [rect(g.left, g.top, g.w, g.h, Math.min(14, g.hh))],
  },
  {
    name: 'stadium',
    label: 'Stadium',
    group: 'basic',
    aliases: ['pill', 'terminal'],
    bracket: (id, label) => `${id}([${label}])`,
    size: (b) => ({ w: b.w + 16, h: b.h }),
    render: (g) => [rect(g.left, g.top, g.w, g.h, g.hh)],
  },
  {
    name: 'circle',
    label: 'Circle',
    group: 'basic',
    aliases: ['circ'],
    bracket: (id, label) => `${id}((${label}))`,
    size: (b) => { const d = Math.max(b.w, 66); return { w: d, h: d }; },
    render: (g) => [circle(g.cx, g.cy, Math.min(g.hw, g.hh))],
  },
  {
    name: 'dbl-circ',
    label: 'Double circle',
    group: 'basic',
    aliases: ['double-circle', 'stop'],
    bracket: (id, label) => `${id}(((${label})))`,
    size: (b) => { const d = Math.max(b.w, 66); return { w: d, h: d }; },
    render: (g) => {
      const r = Math.min(g.hw, g.hh);
      return [circle(g.cx, g.cy, r), unfilled(circle(g.cx, g.cy, Math.max(r - 5, 2)))];
    },
  },
  {
    name: 'diam',
    label: 'Decision',
    group: 'basic',
    aliases: ['diamond', 'decision', 'question'],
    bracket: (id, label) => `${id}{${label}}`,
    size: diamondSize,
    render: (g) => [polygon([
      [g.cx, g.top], [g.right, g.cy], [g.cx, g.bottom], [g.left, g.cy],
    ])],
  },
  {
    name: 'hex',
    label: 'Hexagon',
    group: 'basic',
    aliases: ['hexagon', 'prepare'],
    bracket: (id, label) => `${id}{{${label}}}`,
    size: (b) => ({ w: b.w + 40, h: b.h }),
    render: (g) => {
      const inset = Math.min(g.hw * 0.3, g.hh);
      return [polygon([
        [g.left, g.cy], [g.left + inset, g.top], [g.right - inset, g.top],
        [g.right, g.cy], [g.right - inset, g.bottom], [g.left + inset, g.bottom],
      ])];
    },
  },
  {
    name: 'odd',
    label: 'Asymmetric',
    group: 'basic',
    aliases: ['asymmetric'],
    bracket: (id, label) => `${id}>${label}]`,
    size: (b) => ({ w: b.w + 26, h: b.h }),
    render: (g) => {
      const ind = Math.min(g.hw * 0.35, 16);
      return [polygon([
        [g.left, g.top], [g.right, g.top], [g.right, g.bottom],
        [g.left, g.bottom], [g.left + ind, g.cy],
      ])];
    },
  },
  {
    name: 'text',
    label: 'Text block',
    group: 'basic',
    aliases: ['text-block'],
    // No border: the renderer draws only the label. probeBounds returns null
    // for this shape, which the suite accepts for an empty element list.
    render: () => [],
  },
];

/** Leaves a 30% margin inside the rhombus; calibrated so ordinary diamonds
 *  keep the size they had before the registry refactor. */
const DIAMOND_FIT = 0.7;

function diamondSize(
  b: { w: number; h: number },
  ctx: { widest: number; fontSize: number; lineCount: number },
): { w: number; h: number } {
  return fitGrow(
    { w: Math.max(b.w + 28, 100), h: Math.max(72, b.h + 28) },
    ctx,
    DIAMOND_FIT,
  );
}
