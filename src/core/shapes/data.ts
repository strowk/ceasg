/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): `cyl`, `lean-r` and `lean-l` are that code, geometry unchanged and
 * restructured into registry entries; the rest is new.
 */

import { ellipse, hline, path, polygon, rect, slantOf, vline } from './primitives';
import type { ShapeDef, ShapeGeom } from './types';

/**
 * Wave amplitude for the paper tape's mirrored top and bottom edges, shared by
 * its outline and its render so the two cannot drift apart.
 *
 * Clamped against the box. At a fixed 8 the two baselines (`top + amp` and
 * `bottom - amp`) meet on the centre line as soon as the box is 16px tall —
 * exactly the palette icon's height — collapsing the tape into a flat sliver.
 * `flag` reserves 20px of extra height, so a real node never reaches the clamp.
 */
function flagAmp(g: ShapeGeom): number {
  return Math.min(8, g.h * 0.2);
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
  {
    name: 'lin-cyl',
    label: 'Disk storage',
    group: 'data',
    aliases: ['disk', 'lined-cylinder'],
    size: (b) => ({ w: b.w, h: b.h + 26 }),
    render: (g) => {
      const ry = Math.min(g.hh * 0.5, 9);
      return [
        rect(g.left, g.top + ry, g.w, g.h - 2 * ry, 0),
        ellipse(g.cx, g.top + ry, g.hw, ry),
        // The second rim is what distinguishes disk storage from a plain cylinder.
        ellipse(g.cx, g.top + ry * 3, g.hw, ry),
      ];
    },
  },
  {
    name: 'win-pane',
    label: 'Internal storage',
    group: 'data',
    aliases: ['internal-storage', 'window-pane'],
    size: (b) => ({ w: b.w + 16, h: b.h + 12 }),
    render: (g) => [
      rect(g.left, g.top, g.w, g.h, 0),
      vline(g.left + Math.min(g.w * 0.22, 22), g.top, g.bottom),
      hline(g.top + Math.min(g.h * 0.28, 16), g.left, g.right),
    ],
  },
  {
    name: 'notch-rect',
    label: 'Card',
    group: 'data',
    aliases: ['card', 'notched-rectangle'],
    size: (b) => ({ w: b.w + 16, h: b.h }),
    render: (g) => {
      const n = Math.min(g.w * 0.15, 16);
      return [polygon([
        [g.left + n, g.top], [g.right, g.top], [g.right, g.bottom],
        [g.left, g.bottom], [g.left, g.top + n],
      ])];
    },
  },
  {
    name: 'bow-rect',
    label: 'Stored data',
    group: 'data',
    aliases: ['bow-tie-rectangle', 'stored-data'],
    size: (b) => ({ w: b.w + 30, h: b.h }),
    render: (g) => {
      // Both vertical edges pinch inward; that pinch is the whole symbol.
      const n = Math.min(g.w * 0.12, 16);
      return [polygon([
        [g.left, g.top], [g.right, g.top], [g.right - n, g.cy],
        [g.right, g.bottom], [g.left, g.bottom], [g.left + n, g.cy],
      ])];
    },
  },
  {
    name: 'h-cyl',
    label: 'Direct access storage',
    group: 'data',
    aliases: ['das', 'horizontal-cylinder'],
    size: (b) => ({ w: b.w + 30, h: b.h }),
    render: (g) => {
      // A cylinder on its side: a rounded right cap and a matching left arc.
      const rx = Math.min(g.hw * 0.25, 14);
      return [path(
        `M${g.left + rx},${g.top} L${g.right - rx},${g.top}` +
        ` A${rx},${g.hh} 0 0 1 ${g.right - rx},${g.bottom}` +
        ` L${g.left + rx},${g.bottom}` +
        ` A${rx},${g.hh} 0 0 1 ${g.left + rx},${g.top} Z`,
      )];
    },
  },
  {
    name: 'datastore',
    label: 'Data store',
    group: 'data',
    aliases: ['data-store'],
    size: (b) => ({ w: b.w + 24, h: b.h }),
    render: (g) => {
      // An open-sided cylinder: square right edge, curved left edge.
      const rx = Math.min(g.hw * 0.2, 12);
      return [path(
        `M${g.right},${g.top} L${g.left + rx},${g.top}` +
        ` A${rx},${g.hh} 0 0 0 ${g.left + rx},${g.bottom}` +
        ` L${g.right},${g.bottom} Z`,
      )];
    },
  },
  {
    name: 'curv-trap',
    label: 'Display',
    group: 'data',
    aliases: ['curved-trapezoid', 'display'],
    size: (b) => ({ w: b.w + 34, h: b.h }),
    outline: (g) => {
      const s = Math.min(g.hw * 0.3, 22);
      return [
        [g.left, g.cy], [g.left + s, g.top], [g.right - s, g.top],
        [g.right, g.cy], [g.right - s, g.bottom], [g.left + s, g.bottom],
      ];
    },
    render: (g) => {
      const s = Math.min(g.hw * 0.3, 22);
      return [path(
        `M${g.left},${g.cy} L${g.left + s},${g.top} L${g.right - s},${g.top}` +
        ` A${s},${g.hh} 0 0 1 ${g.right - s},${g.bottom}` +
        ` L${g.left + s},${g.bottom} Z`,
      )];
    },
  },
  {
    name: 'flag',
    label: 'Paper tape',
    group: 'data',
    aliases: ['paper-tape'],
    size: (b) => ({ w: b.w, h: b.h + 20 }),
    outline: (g) => {
      const amp = flagAmp(g);
      return [
        [g.left, g.top + amp], [g.cx, g.top], [g.right, g.top + amp],
        [g.right, g.bottom - amp], [g.cx, g.bottom], [g.left, g.bottom - amp],
      ];
    },
    render: (g) => {
      // Wavy top and bottom, mirrored, so the tape reads as continuous.
      const amp = flagAmp(g);
      const q = g.w / 4;
      const ty = g.top + amp;
      const by = g.bottom - amp;
      return [path(
        `M${g.left},${ty}` +
        ` C${g.left + q},${ty - amp} ${g.cx + q},${ty + amp} ${g.right},${ty}` +
        ` L${g.right},${by}` +
        ` C${g.right - q},${by - amp} ${g.cx - q},${by + amp} ${g.left},${by} Z`,
      )];
    },
  },
];
