/*
 * Extracts the drawn extent of shape elements from their attributes.
 *
 * jsdom does not implement SVGGraphicsElement.getBBox, so the shape test suite
 * cannot ask the DOM where an element landed. This reads back the geometry the
 * primitives wrote, which is enough to catch a shape drawn outside its box.
 */

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }

function extend(b: Bounds | null, x: number, y: number): Bounds {
  if (!Number.isFinite(x) || !Number.isFinite(y)) { return b ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 }; }
  if (!b) { return { minX: x, minY: y, maxX: x, maxY: y }; }
  return {
    minX: Math.min(b.minX, x), minY: Math.min(b.minY, y),
    maxX: Math.max(b.maxX, x), maxY: Math.max(b.maxY, y),
  };
}

const n = (el: Element, name: string): number => Number(el.getAttribute(name) ?? NaN);

/**
 * Coordinate pairs from a path `d`. Every path the primitives emit uses
 * absolute commands, so only those are handled. For each command the trailing
 * pair is the endpoint; C/S/Q also contribute their control points, which bound
 * the curve conservatively (a bézier never leaves its control hull).
 */
function pathPoints(d: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let cmd = '';
  let i = 0;
  let cursor: [number, number] = [0, 0];
  const take = (): number => Number(tokens[i++] ?? NaN);
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[A-Za-z]/.test(t)) { cmd = t; i++; continue; }
    switch (cmd.toUpperCase()) {
      case 'M': case 'L': case 'T': {
        cursor = [take(), take()]; pts.push(cursor); break;
      }
      case 'H': { cursor = [take(), cursor[1]]; pts.push(cursor); break; }
      case 'V': { cursor = [cursor[0], take()]; pts.push(cursor); break; }
      case 'C': {
        pts.push([take(), take()], [take(), take()]);
        cursor = [take(), take()]; pts.push(cursor); break;
      }
      case 'S': case 'Q': {
        pts.push([take(), take()]);
        cursor = [take(), take()]; pts.push(cursor); break;
      }
      case 'A': {
        // rx ry rot large-arc sweep x y — only the endpoint is a coordinate.
        take(); take(); take(); take(); take();
        cursor = [take(), take()]; pts.push(cursor); break;
      }
      case 'Z': { i++; break; }
      default: { i++; break; }
    }
  }
  return pts;
}

/** The drawn extent of `elements`, or null when nothing draws (e.g. `text`). */
export function probeBounds(elements: SVGElement[]): Bounds | null {
  let b: Bounds | null = null;
  for (const el of elements) {
    switch (el.tagName.toLowerCase()) {
      case 'rect': {
        const x = n(el, 'x'), y = n(el, 'y');
        b = extend(extend(b, x, y), x + n(el, 'width'), y + n(el, 'height'));
        break;
      }
      case 'circle': {
        const cx = n(el, 'cx'), cy = n(el, 'cy'), r = n(el, 'r');
        b = extend(extend(b, cx - r, cy - r), cx + r, cy + r);
        break;
      }
      case 'ellipse': {
        const cx = n(el, 'cx'), cy = n(el, 'cy'), rx = n(el, 'rx'), ry = n(el, 'ry');
        b = extend(extend(b, cx - rx, cy - ry), cx + rx, cy + ry);
        break;
      }
      case 'line': {
        b = extend(extend(b, n(el, 'x1'), n(el, 'y1')), n(el, 'x2'), n(el, 'y2'));
        break;
      }
      case 'polygon': case 'polyline': {
        for (const pair of (el.getAttribute('points') ?? '').trim().split(/\s+/)) {
          if (!pair) { continue; }
          const [x, y] = pair.split(',').map(Number);
          b = extend(b, x ?? NaN, y ?? NaN);
        }
        break;
      }
      case 'path': {
        for (const [x, y] of pathPoints(el.getAttribute('d') ?? '')) { b = extend(b, x, y); }
        break;
      }
      default: break;
    }
  }
  return b;
}
