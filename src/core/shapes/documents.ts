import { path, polygon, unfilled, vline, wavyBottom } from './primitives';
import type { ShapeDef, ShapeGeom } from './types';

/** Wave height, and therefore the extra bottom room every document needs. */
export const DOC_WAVE = 10;

/** A document body: square top and sides, wavy bottom. Absolute commands only. */
export function docBody(g: ShapeGeom): string {
  return `M${g.left},${g.top} L${g.right},${g.top} ${wavyBottom(g, DOC_WAVE)} Z`;
}

/** The folded corner tag shared by tag-doc and tag-rect. */
export function cornerTag(g: ShapeGeom): SVGElement {
  const s = Math.min(g.w * 0.18, 18);
  return polygon([
    [g.right - s, g.bottom - s], [g.right, g.bottom - s], [g.right - s, g.bottom],
  ]);
}

export const DOCUMENT_SHAPES: ShapeDef[] = [
  {
    name: 'doc',
    label: 'Document',
    group: 'documents',
    aliases: ['document'],
    size: (b) => ({ w: b.w, h: b.h + DOC_WAVE + 6 }),
    render: (g) => [path(docBody(g))],
  },
  {
    name: 'lin-doc',
    label: 'Lined document',
    group: 'documents',
    aliases: ['lined-document'],
    size: (b) => ({ w: b.w + 12, h: b.h + DOC_WAVE + 6 }),
    render: (g) => [path(docBody(g)), vline(g.left + 10, g.top, g.bottom - DOC_WAVE)],
  },
  {
    name: 'tag-doc',
    label: 'Tagged document',
    group: 'documents',
    aliases: ['tagged-document'],
    size: (b) => ({ w: b.w + 14, h: b.h + DOC_WAVE + 6 }),
    render: (g) => [path(docBody(g)), cornerTag(g)],
  },
];
