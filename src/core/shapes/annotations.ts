import { braceD, path, polygon, unfilled } from './primitives';
import type { Pt, ShapeDef, ShapeGeom } from './types';

/** Spike count for the bang starburst. Even, so spikes alternate in and out. */
const BANG_SPIKES = 12;

/**
 * How far the cloud's top and bottom apexes sit *inside* the box, as a
 * fraction of `ry`. Staying inside is what keeps the arcs inside.
 *
 * A lobe arc runs from (left + rx, top + ry) to the apex, and it reaches the
 * topmost point of its own ellipse *before* that endpoint (the apex is not
 * where the tangent goes horizontal). Put the apex on `g.top` and the arc
 * bulges 0.0466 * h above it — 3.7px on the 80px-tall test box, which only
 * passed because the bounds margin is 4px, and 7.5px at h = 160.
 *
 * Solving for the apex that puts the extremum on the edge: with half-chord
 * components u = |x1p| = (hw - rx) / 2 and q = y1p = (ry - inset) / 2, SVG
 * 1.1 §F.6.5 gives the arc's centre offset cy' = coef * ry * u / rx, and the
 * topmost point of the arc is (y1 + y2) / 2 + cy' - ry. Setting that equal to
 * `g.top` reduces to cy' = q, i.e. coef = rx * q / (ry * u); squaring and
 * substituting §F.6.5's coef collapses to (rx^2 q^2 + ry^2 u^2)^2 =
 * (rx * ry^2 * u)^2, so q = (ry / rx) * sqrt(u * (rx - u)).
 *
 * With rx = w/5 (so u = 3w/20 and rx - u = w/20) that is q = ry * sqrt(3) / 4,
 * and inset = ry - 2q = ry * (1 - sqrt(3) / 2) — scale-invariant, as the
 * overflow it cancels was. The extremum then lands exactly on the edge, so
 * the drawn cloud still touches `top` and `bottom` and looks unchanged.
 */
const APEX_INSET = 1 - Math.sqrt(3) / 2;

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

/**
 * Where a brace's spine sits relative to the box edge, and how far its cusp
 * reaches, both clamped against the width.
 *
 * At the fixed 10 and 8 these were, a 28px-wide palette icon put the two
 * spines 8px apart while each brace spanned 12px — so `braces` drew its two
 * halves overlapping in the middle, and `brace`/`brace-r` sat marooned in the
 * centre third of an otherwise empty icon. The brace shapes reserve 14-28px of
 * extra width, so a real node stays on the constants and is unchanged.
 */
function braceInset(g: ShapeGeom): number {
  return Math.min(10, g.w * 0.2);
}

function braceSpan(g: ShapeGeom): number {
  return Math.min(8, g.w * 0.15);
}

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
    render: (g) => [unfilled(path(braceD(g.left + braceInset(g), g.top, g.bottom, 'left', braceSpan(g))))],
  },
  {
    name: 'brace-r',
    label: 'Comment (right brace)',
    group: 'annotations',
    aliases: ['comment-right'],
    size: (b) => ({ w: b.w + 14, h: b.h }),
    render: (g) => [unfilled(path(braceD(g.right - braceInset(g), g.top, g.bottom, 'right', braceSpan(g))))],
  },
  {
    name: 'braces',
    label: 'Comment (both braces)',
    group: 'annotations',
    aliases: ['comment-both'],
    size: (b) => ({ w: b.w + 28, h: b.h }),
    render: (g) => [
      unfilled(path(braceD(g.left + braceInset(g), g.top, g.bottom, 'left', braceSpan(g)))),
      unfilled(path(braceD(g.right - braceInset(g), g.top, g.bottom, 'right', braceSpan(g)))),
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
      const inset = APEX_INSET * ry;
      return [path(
        `M${g.left + rx},${y1}` +
        ` A${rx},${ry} 0 0 1 ${g.left + rx},${y0}` +
        ` A${rx},${ry} 0 0 1 ${g.cx},${g.top + inset}` +
        ` A${rx},${ry} 0 0 1 ${g.right - rx},${y0}` +
        ` A${rx},${ry} 0 0 1 ${g.right - rx},${y1}` +
        ` A${rx},${ry} 0 0 1 ${g.cx},${g.bottom - inset} Z`,
      )];
    },
  },
];
