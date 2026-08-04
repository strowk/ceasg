import { geom } from './primitives';
import { SHAPES } from './registry';
import type { ShapeName } from './types';
import { getDocument } from '../dom';

export * from './types';
export * from './primitives';
export * from './registry';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Build the SVG element(s) that draw `shape` centred at (cx, cy) within a w x h
 * box. The caller adds CSS classes. Signature preserved from shapes.ts:37 so
 * render.ts and the Markdown preview path need no changes.
 */
export function createShapeElements(
  shape: ShapeName, cx: number, cy: number, w: number, h: number,
): SVGElement[] {
  const def = SHAPES[shape] ?? SHAPES['rect'];
  return def.render(geom(cx, cy, w, h));
}

/** A small preview icon for the shape palette. */
export function createShapeIcon(shape: ShapeName): SVGSVGElement {
  const svg = getDocument().createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 24');
  svg.classList.add('mermaid-flow-shape-icon');
  for (const node of createShapeElements(shape, 18, 12, 28, 16)) {
    node.classList.add('mermaid-flow-shape');
    svg.appendChild(node);
  }
  return svg;
}
