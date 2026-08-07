/*
 * SVG element builders shared by every shape definition. Nothing here knows
 * about any particular shape.
 *
 * Derived from the element helpers in the Mermaid Flow port
 * (https://github.com/THANSHEER/obsidian-mermaid-flow), GPL-3.0-or-later.
 */

import { getDocument } from '../dom';
import type { Pt, ShapeGeom } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Smallest box any shape is drawn in; keeps degenerate input off the render path. */
const MIN_EXTENT = 1;

/** Offset between copies in a stacked shape. */
export const STACK_DEPTH = 5;

/**
 * Shared slant for the parallelogram/trapezoid family (shapes.ts:51). Lives
 * here, with STACK_DEPTH, because both the process and data families use it
 * and neither should have to depend on the other to get it.
 */
export function slantOf(g: ShapeGeom): number {
  return Math.min(g.hw * 0.5, 20);
}

export function el<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return getDocument().createElementNS(SVG_NS, name);
}

/** Non-finite coordinates would serialize as "NaN" and break the SVG. */
function num(n: number): string {
  return Number.isFinite(n) ? String(n) : '0';
}

export function geom(cx: number, cy: number, w: number, h: number): ShapeGeom {
  const sw = Number.isFinite(w) ? Math.max(w, MIN_EXTENT) : MIN_EXTENT;
  const sh = Number.isFinite(h) ? Math.max(h, MIN_EXTENT) : MIN_EXTENT;
  const scx = Number.isFinite(cx) ? cx : 0;
  const scy = Number.isFinite(cy) ? cy : 0;
  const hw = sw / 2;
  const hh = sh / 2;
  return {
    cx: scx, cy: scy, w: sw, h: sh,
    left: scx - hw, right: scx + hw, top: scy - hh, bottom: scy + hh,
    hw, hh,
  };
}

export function polygon(points: Pt[]): SVGPolygonElement {
  const p = el('polygon');
  p.setAttribute('points', points.map(([x, y]) => `${num(x)},${num(y)}`).join(' '));
  return p;
}

export function path(d: string): SVGPathElement {
  const p = el('path');
  p.setAttribute('d', d);
  return p;
}

export function rect(x: number, y: number, w: number, h: number, radius = 0): SVGRectElement {
  const r = el('rect');
  r.setAttribute('x', num(x));
  r.setAttribute('y', num(y));
  r.setAttribute('width', num(w));
  r.setAttribute('height', num(h));
  r.setAttribute('rx', num(radius));
  r.setAttribute('ry', num(radius));
  return r;
}

export function circle(cx: number, cy: number, r: number): SVGCircleElement {
  const c = el('circle');
  c.setAttribute('cx', num(cx));
  c.setAttribute('cy', num(cy));
  c.setAttribute('r', num(Math.max(r, MIN_EXTENT)));
  return c;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): SVGEllipseElement {
  const e = el('ellipse');
  e.setAttribute('cx', num(cx));
  e.setAttribute('cy', num(cy));
  e.setAttribute('rx', num(Math.max(rx, MIN_EXTENT)));
  e.setAttribute('ry', num(Math.max(ry, MIN_EXTENT)));
  return e;
}

export function line(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const l = el('line');
  l.setAttribute('x1', num(x1));
  l.setAttribute('y1', num(y1));
  l.setAttribute('x2', num(x2));
  l.setAttribute('y2', num(y2));
  l.setAttribute('fill', 'none');
  return l;
}

export function vline(x: number, y0: number, y1: number): SVGLineElement {
  return line(x, y0, x, y1);
}

export function hline(y: number, x0: number, x1: number): SVGLineElement {
  return line(x0, y, x1, y);
}

/** An element that should not be filled by the node's fill colour. */
export function unfilled<T extends SVGElement>(e: T): T {
  e.setAttribute('fill', 'none');
  return e;
}

/** An element that renders solid in the node's stroke colour (fork, junction). */
export function solid<T extends SVGElement>(e: T): T {
  e.setAttribute('data-ceasg-solid', 'true');
  return e;
}

/**
 * The wavy lower edge shared by every document shape, as absolute path
 * commands starting at the bottom-right corner and ending at bottom-left.
 * `amp` is the wave height; the curve never dips below `g.bottom`.
 */
export function wavyBottom(g: ShapeGeom, amp: number): string {
  const y = g.bottom - amp;
  const q = g.w / 4;
  return [
    `L${num(g.right)},${num(y)}`,
    `C${num(g.right - q)},${num(y - amp)} ${num(g.cx - q)},${num(y + amp)} ${num(g.left)},${num(y)}`,
  ].join(' ');
}

/**
 * A curly brace as absolute path commands, spanning `top`..`bottom` at `x`.
 * `dir` is which way the brace's cusp points.
 */
export function braceD(
  x: number, top: number, bottom: number, dir: 'left' | 'right', span = 8,
): string {
  const mid = (top + bottom) / 2;
  const reach = dir === 'left' ? span : -span;
  return [
    `M${num(x + reach)},${num(top)}`,
    `C${num(x)},${num(top)} ${num(x)},${num(mid)} ${num(x - reach / 2)},${num(mid)}`,
    `C${num(x)},${num(mid)} ${num(x)},${num(bottom)} ${num(x + reach)},${num(bottom)}`,
  ].join(' ');
}
