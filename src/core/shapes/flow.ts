import { circle, line, rect, solid, unfilled } from './primitives';
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
];
