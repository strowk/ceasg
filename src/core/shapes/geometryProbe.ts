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
 *
 * A lowercase (relative) command is rejected rather than silently treated as
 * its uppercase equivalent: relative coordinates are offsets from the current
 * cursor, not absolute points, so reading them as absolute would produce
 * plausible-looking but wrong bounds instead of a visible failure. Throwing
 * is fine here — this module is test support, not a render path. `z` is the
 * one exception: closepath takes no coordinates, so there is no
 * relative-vs-absolute distinction for it to get wrong, and lowercase `z` is
 * unremarkable output from path-drawing code.
 *
 * The command-letter check below is anchored (`/^[A-Za-z]$/`, "the whole
 * token is one letter") rather than "the token contains a letter": the
 * number half of the tokenizer regex, `-?\d*\.?\d+(?:e-?\d+)?`, legitimately
 * absorbs a lowercase `e` exponent into a single multi-character token (e.g.
 * "1e-5" — the form `Number.prototype.toString()` emits for the near-zero
 * residuals trig-based curve math produces, such as `Math.cos(Math.PI / 2)`).
 * An unanchored test would misidentify that whole numeric token as a command
 * letter and reject a perfectly valid absolute coordinate.
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
    if (/^[A-Za-z]$/.test(t)) {
      const isRelative = t !== t.toUpperCase();
      if (isRelative && t.toLowerCase() !== 'z') {
        throw new Error(
          `geometryProbe: relative path command "${t}" is not supported; ` +
          `shape primitives must emit absolute path commands only.`,
        );
      }
      cmd = t; i++; continue;
    }
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

/**
 * The drawn extent of `elements`, or null when nothing draws (e.g. `text`).
 *
 * Every element tag a primitive can emit must have a case below. An unhandled
 * tag falls through to `default: break` and contributes nothing to the
 * bounds — a shape built from a new primitive type (Tasks 11-14) would then
 * pass the "stays within its box" assertion no matter where it actually
 * drew. Add a case here in lockstep with any new element type in primitives.ts.
 */
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
