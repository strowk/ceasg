import { circle, line, polygon, rect, solid, unfilled } from './primitives';
import { fitGrow } from './sizing';
import type { ShapeDef } from './types';

/** Junction and start markers are fixed-size markers, not label containers. */
const MARKER_D = 20;
const markerSize = () => ({ w: MARKER_D, h: MARKER_D });

export const FLOW_SHAPES: ShapeDef[] = [
  {
    name: 'fork',
    label: 'Fork / join',
    group: 'flow',
    aliases: ['join'],
    // A fork bar spans the flow but carries no label, so height is fixed.
    size: (b) => ({ w: b.w, h: 10 }),
    render: (g) => [solid(rect(g.left, g.cy - 5, g.w, 10, 2))],
  },
  {
    name: 'sm-circ',
    label: 'Small start',
    group: 'flow',
    aliases: ['small-circle', 'start'],
    size: markerSize,
    render: (g) => [circle(g.cx, g.cy, Math.min(g.hw, g.hh))],
  },
  {
    name: 'f-circ',
    label: 'Junction',
    group: 'flow',
    aliases: ['filled-circle', 'junction'],
    size: markerSize,
    render: (g) => [solid(circle(g.cx, g.cy, Math.min(g.hw, g.hh)))],
  },
  {
    name: 'fr-circ',
    label: 'Framed circle (stop)',
    group: 'flow',
    aliases: ['framed-circle'],
    size: (b) => { const d = Math.max(b.w, 66); return { w: d, h: d }; },
    render: (g) => {
      const r = Math.min(g.hw, g.hh);
      return [circle(g.cx, g.cy, r), solid(circle(g.cx, g.cy, Math.max(r * 0.55, 2)))];
    },
  },
  {
    name: 'cross-circ',
    label: 'Summary',
    group: 'flow',
    aliases: ['crossed-circle', 'summary'],
    size: (b) => { const d = Math.max(b.w, 66); return { w: d, h: d }; },
    render: (g) => {
      const r = Math.min(g.hw, g.hh);
      // The cross is inscribed, so its arms meet the rim rather than overshoot.
      const a = r / Math.SQRT2;
      return [
        circle(g.cx, g.cy, r),
        unfilled(line(g.cx - a, g.cy - a, g.cx + a, g.cy + a)),
        unfilled(line(g.cx + a, g.cy - a, g.cx - a, g.cy + a)),
      ];
    },
  },
  {
    name: 'tri',
    label: 'Extract',
    group: 'flow',
    aliases: ['extract', 'triangle'],
    // A triangle pinches toward its apex exactly as a rhombus does.
    size: (b, ctx) => fitGrow({ w: Math.max(b.w + 28, 100), h: Math.max(72, b.h + 28) }, ctx, 0.55),
    render: (g) => [polygon([[g.cx, g.top], [g.right, g.bottom], [g.left, g.bottom]])],
  },
  {
    name: 'flip-tri',
    label: 'Manual file',
    group: 'flow',
    aliases: ['flipped-triangle', 'manual-file'],
    size: (b, ctx) => fitGrow({ w: Math.max(b.w + 28, 100), h: Math.max(72, b.h + 28) }, ctx, 0.55),
    render: (g) => [polygon([[g.left, g.top], [g.right, g.top], [g.cx, g.bottom]])],
  },
  {
    name: 'notch-pent',
    label: 'Loop limit',
    group: 'flow',
    aliases: ['loop-limit', 'notched-pentagon'],
    size: (b) => ({ w: b.w + 16, h: b.h + 8 }),
    render: (g) => {
      const n = Math.min(g.w * 0.12, 16);
      return [polygon([
        [g.left + n, g.top], [g.right - n, g.top], [g.right, g.top + n],
        [g.right, g.bottom], [g.left, g.bottom], [g.left, g.top + n],
      ])];
    },
  },
  {
    name: 'hourglass',
    label: 'Collate',
    group: 'flow',
    aliases: ['collate'],
    // A collate marker carries no label, so it keeps a fixed square footprint.
    size: () => ({ w: 48, h: 48 }),
    render: (g) => [
      polygon([[g.left, g.top], [g.right, g.top], [g.cx, g.cy]]),
      polygon([[g.left, g.bottom], [g.right, g.bottom], [g.cx, g.cy]]),
    ],
  },
  {
    name: 'bolt',
    label: 'Communication link',
    group: 'flow',
    aliases: ['com-link', 'lightning-bolt'],
    size: () => ({ w: 48, h: 48 }),
    // Normalised outline mapped onto the box, so it can never leave it.
    render: (g) => [polygon(BOLT_OUTLINE.map(([u, v]) => [g.left + u * g.w, g.top + v * g.h]))],
  },
];

/** Unit-square lightning bolt, drawn clockwise from the top-right stroke. */
const BOLT_OUTLINE: Array<[number, number]> = [
  [0.85, 0.00], [0.15, 0.55], [0.45, 0.55],
  [0.35, 1.00], [0.85, 0.40], [0.55, 0.40], [0.85, 0.00],
];
