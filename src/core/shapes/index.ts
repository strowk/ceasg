import { geom } from './primitives';
import { SHAPES, lookupShape } from './registry';
import type { ShapeName } from './types';
import { getDocument } from '../dom';
import { warn } from '../diagnostics';

export * from './types';
export * from './primitives';
export * from './registry';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Build the SVG element(s) that draw `shape` centred at (cx, cy) within a w x h
 * box. The caller adds CSS classes. Signature preserved from shapes.ts:37 so
 * render.ts and the Markdown preview path need no changes.
 *
 * Resolved through `lookupShape` (canonical name or any alias) rather than a
 * bare `SHAPES[shape]` lookup: parser.ts is not yet migrated (Task 5) and
 * still emits historical names like `"diamond"`, which are registered
 * aliases, not registry keys. A bare keyed lookup would silently fall back to
 * `rect` for every one of those.
 */
export function createShapeElements(
  shape: ShapeName, cx: number, cy: number, w: number, h: number,
): SVGElement[] {
  let def = lookupShape(shape);
  if (!def) {
    // Unreachable once NodeShape is registry-derived; a typed hole today is a
    // blank diagram tomorrow, so degrade loudly rather than silently.
    warn('shape-lookup-miss', String(shape),
      `No shape registered as "${shape}"; drawn as a rectangle.`);
    def = SHAPES['rect']!;
  }
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
