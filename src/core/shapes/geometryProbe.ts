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
 * Sample points along an elliptical arc, conservatively padded so the
 * reported extent can never be smaller than the arc's true extent.
 *
 * Implements the SVG 1.1 §F.6.5 endpoint-to-center parameterisation,
 * including the §F.6.6 mandatory radius correction: when the requested
 * `rx`/`ry` are too small to span the chord from the arc's start to its end,
 * a conforming renderer scales both radii up until they just barely can.
 * Skipping that step means the sampled arc would be smaller than what
 * actually gets drawn — silently blind to exactly the failure mode this
 * function exists to catch (a `cloud` whose diagonal chords force the
 * renderer to inflate its radii well past the box edge).
 *
 * The arc is then walked in `SAMPLES` equal steps of its parameter `theta`
 * and every sample point is returned, plus two extra corner points that pad
 * the sampled bounding box outward. That padding is what makes the result
 * conservative rather than merely "probably close enough": for any fixed
 * direction (in particular, the x and y axes), the arc's coordinate along
 * that direction is `A + R*cos(theta - theta0)` for some phase `theta0` and
 * amplitude `R <= max(rx, ry)` — a single sinusoid, regardless of the
 * ellipse's rotation. Between two adjacent samples spaced `step` apart, the
 * true peak of a sinusoid can fall exactly at the midpoint, where it exceeds
 * both neighbouring samples by at most `R*(1-cos(step/2))`. Padding the
 * sampled min/max by `maxR*(1-cos(step/2))` in every direction therefore
 * bounds the true extent no matter where in each interval the real extremum
 * sits, without needing to locate it exactly.
 */
function arcPoints(
  x1: number, y1: number, rxIn: number, ryIn: number, rotDeg: number,
  largeArc: boolean, sweep: boolean, x2: number, y2: number,
): Array<[number, number]> {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) { return [[x1, y1], [x2, y2]]; }

  const phi = (rotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // §F.6.6: scale rx/ry up just enough to make the chord spannable.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s; ry *= s;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const coef = (largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (coef * -ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Signed angle from (ux,uy) to (vx,vy), via atan2(cross, dot) — robust at
  // the boundaries where an acos-based formula would need explicit clamping.
  const angleBetween = (ux: number, uy: number, vx: number, vy: number): number =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween(
    (x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry,
  );
  if (!sweep && dTheta > 0) { dTheta -= 2 * Math.PI; }
  if (sweep && dTheta < 0) { dTheta += 2 * Math.PI; }

  const SAMPLES = 64;
  const step = dTheta / SAMPLES;
  const maxR = Math.max(rx, ry);
  const pad = maxR * (1 - Math.cos(step / 2));

  const pts: Array<[number, number]> = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = theta1 + step * i;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const x = cx + rx * cosPhi * ct - ry * sinPhi * st;
    const y = cy + rx * sinPhi * ct + ry * cosPhi * st;
    pts.push([x, y]);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  pts.push([minX - pad, minY - pad], [maxX + pad, maxY + pad]);
  return pts;
}

/**
 * Coordinate pairs from a path `d`. Every path the primitives emit uses
 * absolute commands, so only those are handled. For each command the trailing
 * pair is the endpoint; C/S/Q also contribute their control points, which bound
 * the curve conservatively (a bézier never leaves its control hull). A only
 * contributed its endpoint until `cloud` showed that blind — an arc can bulge
 * well outside the chord between its endpoints — so it now goes through
 * `arcPoints`, which samples (and conservatively pads) the arc itself; see
 * that function's doc comment for why the padding is sound.
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
        // rx ry rot large-arc sweep x y
        const rx = take(), ry = take(), rot = take(), laf = take(), sf = take();
        const [ex, ey] = [take(), take()];
        pts.push(...arcPoints(cursor[0], cursor[1], rx, ry, rot, laf === 1, sf === 1, ex, ey));
        cursor = [ex, ey]; break;
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
 * bounds — a shape built from a new primitive type would then pass the "stays
 * within its box" assertion no matter where it actually drew. Add a case here
 * in lockstep with any new element type in primitives.ts.
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
