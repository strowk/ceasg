import { braceD, path, polygon, unfilled } from './primitives';
import type { Pt, ShapeDef, ShapeGeom } from './types';

/** Spike count for the bang starburst. Even, so spikes alternate in and out. */
const BANG_SPIKES = 12;

const bangOutline = (g: ShapeGeom): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i < BANG_SPIKES; i++) {
    // Outer radius reaches the box edge exactly; inner pulls back to 0.32.
    const r = i % 2 === 0 ? 0.5 : 0.32;
    const angle = (i * 2 * Math.PI) / BANG_SPIKES;
    pts.push([g.cx + r * g.w * Math.cos(angle), g.cy + r * g.h * Math.sin(angle)]);
  }
  return pts;
};

export const ANNOTATION_SHAPES: ShapeDef[] = [
  {
    name: 'bang',
    label: 'Bang',
    group: 'annotations',
    aliases: ['explosion'],
    size: (b) => ({ w: b.w + 40, h: b.h + 30 }),
    outline: bangOutline,
    render: (g) => [polygon(bangOutline(g))],
  },
  {
    name: 'brace',
    label: 'Comment (left brace)',
    group: 'annotations',
    aliases: ['brace-l', 'comment'],
    size: (b) => ({ w: b.w + 14, h: b.h }),
    render: (g) => [unfilled(path(braceD(g.left + 10, g.top, g.bottom, 'left')))],
  },
  {
    name: 'brace-r',
    label: 'Comment (right brace)',
    group: 'annotations',
    aliases: ['comment-right'],
    size: (b) => ({ w: b.w + 14, h: b.h }),
    render: (g) => [unfilled(path(braceD(g.right - 10, g.top, g.bottom, 'right')))],
  },
  {
    name: 'braces',
    label: 'Comment (both braces)',
    group: 'annotations',
    aliases: ['comment-both'],
    size: (b) => ({ w: b.w + 28, h: b.h }),
    render: (g) => [
      unfilled(path(braceD(g.left + 10, g.top, g.bottom, 'left'))),
      unfilled(path(braceD(g.right - 10, g.top, g.bottom, 'right'))),
    ],
  },
  {
    name: 'cloud',
    label: 'Cloud',
    group: 'annotations',
    aliases: ['cloud-shape'],
    size: (b) => ({ w: b.w + 46, h: b.h + 26 }),
    /** Twelve points around the lobes; anchoring needs no more precision. */
    outline: (g) => Array.from({ length: 12 }, (_, i) => {
      const angle = (i * 2 * Math.PI) / 12;
      return [g.cx + 0.5 * g.w * Math.cos(angle), g.cy + 0.5 * g.h * Math.sin(angle)] as Pt;
    }),
    render: (g) => {
      // Five arcs around the box. rx/ry are sized so every chord between
      // consecutive arc endpoints is spannable by an ellipse of that size
      // without SVG's mandatory out-of-range-radius correction (SVG 1.1
      // §F.6.6): a renderer that has to scale rx/ry up to reach an endpoint
      // draws an arc bigger than requested, bulging past the box. The two
      // chord shapes here are the vertical ones (endpoints ry apart in y,
      // spannable once ry >= h/4) and the diagonal ones (endpoints offset by
      // (hw - rx, ry), spannable once rx >= hw / (1 + sqrt(3)) ≈ 0.183 * w —
      // notably independent of ry, since a diagonal's vertical leg is always
      // exactly ry by construction. w/5 and h/3 clear both with margin.
      const rx = g.w / 5;
      const ry = g.h / 3;
      const y0 = g.top + ry;
      const y1 = g.bottom - ry;
      return [path(
        `M${g.left + rx},${y1}` +
        ` A${rx},${ry} 0 0 1 ${g.left + rx},${y0}` +
        ` A${rx},${ry} 0 0 1 ${g.cx},${g.top}` +
        ` A${rx},${ry} 0 0 1 ${g.right - rx},${y0}` +
        ` A${rx},${ry} 0 0 1 ${g.right - rx},${y1}` +
        ` A${rx},${ry} 0 0 1 ${g.cx},${g.bottom} Z`,
      )];
    },
  },
];
