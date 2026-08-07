import { describe, it, expect } from 'vitest';
import { ALL_SHAPES, SHAPES, ALIAS_INDEX, lookupShape } from './registry';
import { geom } from './primitives';
import { probeBounds } from './geometryProbe';
import { mermaidToModel } from '../parser';
import { modelToMermaid } from '../serializer';
import { estimateNodeSize } from '../nodeGeometry';
import { emptyModel } from '../model';
import type { DiagramModel, DiagramNode } from '../model';

/**
 * Boxes every shape is bounds-checked in. One box is not enough: checking only
 * 160x80 let `delay` ship drawing 6px left of its box on a tall node, and
 * `cloud` 4.7% of its height above and below on every node — the latter passed
 * only because MARGIN happens to be 4 and 4.7% of 80 is 3.73.
 *
 * The sizes are ones `estimateNodeSize` really produces (h = 16 * lines + 28,
 * w >= MIN_W): a long one-line label, a four-line label, and a ten-line label
 * whose height is more than twice its width — the shape of box that catches a
 * radius clamped against height alone. The 160x80 box is kept so the coverage
 * the suite already had is not traded away for the new coverage.
 */
const BOXES = [
  { name: 'wide 1-line 320x44', cx: 200, cy: 120, w: 320, h: 44 },
  { name: 'default 160x80', cx: 200, cy: 120, w: 160, h: 80 },
  { name: '4-line 120x92', cx: 200, cy: 120, w: 120, h: 92 },
  { name: 'tall 10-line 88x188', cx: 200, cy: 120, w: 88, h: 188 },
  // The palette icon box (createShapeIcon draws 28x16 inside a 36x24 viewBox).
  // Far smaller than any node, and the size that exposed absolute constants
  // which never scaled down: an unclamped DOC_WAVE put a stacked `docs` copy's
  // wave baseline above its own top edge, drawing the body inside out.
  { name: 'palette icon 28x16', cx: 18, cy: 12, w: 28, h: 16 },
];
/** Stroke width and rounding slop; a shape 4px outside its box is a bug. */
const MARGIN = 4;

function modelWith(node: DiagramNode): DiagramModel {
  // Use emptyModel rather than a literal: DiagramModel's spare-syntax field is
  // named `extras`, and hand-writing the shape here would drift from it.
  const m = emptyModel('TD');
  m.nodes.push(node);
  return m;
}

describe.each(ALL_SHAPES.map((d) => [d.name, d] as const))('shape "%s"', (name, def) => {
  it.each(BOXES)('renders elements that stay within its $name box', (box) => {
    const g = geom(box.cx, box.cy, box.w, box.h);
    const els = def.render(g);
    const b = probeBounds(els);
    if (b === null) {
      // Correct for `text`, which draws no border at all — only the label.
      expect(els).toHaveLength(0);
      return;
    }
    expect(b.minX).toBeGreaterThanOrEqual(g.left - MARGIN);
    expect(b.maxX).toBeLessThanOrEqual(g.right + MARGIN);
    expect(b.minY).toBeGreaterThanOrEqual(g.top - MARGIN);
    expect(b.maxY).toBeLessThanOrEqual(g.bottom + MARGIN);
  });

  // NOTE: this case is vacuous for every rect/circle/ellipse/polygon/line-built
  // shape — primitives.ts's `num()` already clamps any non-finite value to "0"
  // before it reaches an attribute, so those primitives can never emit a
  // literal "NaN"/"Infinity" string. It only has teeth for `path()`-based
  // shapes, whose `d` string is authored directly and bypasses `num()`. 13 of
  // the 48 shapes build a path that way, so the case has teeth: any of them
  // dividing by a zero extent, or taking the square root of a negative one,
  // shows up here.
  it('emits no non-finite coordinates for a degenerate box', () => {
    const els = def.render(geom(0, 0, 0, 0));
    for (const el of els) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.value, `${name} ${attr.name}`).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });

  it('sizes to a finite, positive box', () => {
    const node = { id: 'A', label: 'Sample label', shape: name, x: 0, y: 0 } as DiagramNode;
    const { w, h } = estimateNodeSize(node);
    expect(Number.isFinite(w) && Number.isFinite(h)).toBe(true);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });

  it('sizes a long multi-line label no smaller than a short one', () => {
    const short = estimateNodeSize({ id: 'A', label: 'Hi', shape: name, x: 0, y: 0 } as DiagramNode);
    const long = estimateNodeSize({
      id: 'A', label: 'A considerably longer label\nwith two lines', shape: name, x: 0, y: 0,
    } as DiagramNode);
    expect(long.w).toBeGreaterThanOrEqual(short.w);
    expect(long.h).toBeGreaterThanOrEqual(short.h);
  });

  it('resolves from its canonical name and every alias', () => {
    expect(lookupShape(name)?.name).toBe(name);
    for (const alias of def.aliases) {
      expect(lookupShape(alias)?.name, `alias "${alias}"`).toBe(name);
    }
  });

  it('round-trips label and shape through serializer and parser', () => {
    const node = {
      id: 'A', label: 'Round trip', shape: name, x: 0, y: 0,
      syntax: def.bracket ? 'bracket' : 'attr',
    } as DiagramNode;
    const text = modelToMermaid(modelWith(node), { includePositions: false });
    const back = mermaidToModel(text).model.nodes[0];
    expect(back?.shape, text).toBe(name);
    expect(back?.label, text).toBe('Round trip');
  });
});

describe('rect/line/circle shapes', () => {
  const render = (name: string) => SHAPES[name]!.render(geom(200, 120, 160, 80));

  it('text draws no border, only a label', () => {
    expect(render('text')).toHaveLength(0);
  });

  it('lin-rect adds a single divider line to a rectangle', () => {
    const els = render('lin-rect');
    expect(els.map((e) => e.tagName.toLowerCase())).toEqual(['rect', 'line']);
  });

  it('win-pane adds both a vertical and a horizontal divider', () => {
    const els = render('win-pane');
    expect(els).toHaveLength(3);
    expect(els.filter((e) => e.tagName.toLowerCase() === 'line')).toHaveLength(2);
  });

  it('fork is a solid bar, thin regardless of the box height', () => {
    const els = render('fork');
    expect(els).toHaveLength(1);
    expect(Number(els[0]!.getAttribute('height'))).toBeLessThan(16);
    expect(els[0]!.getAttribute('data-ceasg-solid')).toBe('true');
  });

  it('sm-circ and f-circ ignore the label when sizing', () => {
    const long = { id: 'A', label: 'An extremely long label', shape: 'sm-circ', x: 0, y: 0 };
    const short = { id: 'A', label: 'x', shape: 'sm-circ', x: 0, y: 0 };
    expect(estimateNodeSize(long as never)).toEqual(estimateNodeSize(short as never));
  });

  it('fr-circ and cross-circ draw an outer circle plus an inner mark', () => {
    expect(render('fr-circ').length).toBeGreaterThan(1);
    expect(render('cross-circ').length).toBeGreaterThan(1);
  });

  it('lin-cyl adds a second ellipse to the cylinder body', () => {
    const els = render('lin-cyl');
    expect(els.filter((e) => e.tagName.toLowerCase() === 'ellipse')).toHaveLength(2);
  });
});

describe('polygon shapes', () => {
  const pointsOf = (name: string) => {
    const els = SHAPES[name]!.render(geom(200, 120, 160, 80));
    return els.map((e) => (e.getAttribute('points') ?? '').trim().split(/\s+/).length);
  };

  it('tri and flip-tri are three-point polygons pointing opposite ways', () => {
    expect(pointsOf('tri')).toEqual([3]);
    expect(pointsOf('flip-tri')).toEqual([3]);
    const tri = SHAPES['tri']!.render(geom(0, 0, 100, 100))[0]!.getAttribute('points')!;
    const flip = SHAPES['flip-tri']!.render(geom(0, 0, 100, 100))[0]!.getAttribute('points')!;
    expect(tri).not.toBe(flip);
  });

  it('notch-rect cuts one corner, notch-pent cuts two', () => {
    expect(pointsOf('notch-rect')).toEqual([5]);
    expect(pointsOf('notch-pent')).toEqual([6]);
  });

  it('sl-rect slopes its top edge', () => {
    expect(pointsOf('sl-rect')).toEqual([4]);
  });

  it('bow-rect pinches both vertical edges inward', () => {
    expect(pointsOf('bow-rect')).toEqual([6]);
  });

  it('hourglass is two triangles meeting at the centre', () => {
    expect(pointsOf('hourglass')).toEqual([3, 3]);
  });

  it('bolt and bang are single closed polygons', () => {
    expect(pointsOf('bolt')).toEqual([7]);
    expect(pointsOf('bang')).toEqual([12]);
  });

  it('tri grows for a long label so the text stays inside the apex', () => {
    const short = estimateNodeSize({ id: 'A', label: 'Hi', shape: 'tri', x: 0, y: 0 } as never);
    const long = estimateNodeSize({
      id: 'A', label: 'A much longer extraction label', shape: 'tri', x: 0, y: 0,
    } as never);
    expect(long.w).toBeGreaterThan(short.w);
    expect(long.h).toBeGreaterThan(short.h);
  });
});

describe('curve shapes', () => {
  const tags = (name: string) =>
    SHAPES[name]!.render(geom(200, 120, 160, 80)).map((e) => e.tagName.toLowerCase());

  it('doc is a single path with a wavy bottom', () => {
    expect(tags('doc')).toEqual(['path']);
  });

  it('lin-doc adds a divider line to the document body', () => {
    expect(tags('lin-doc')).toEqual(['path', 'line']);
  });

  it('tag-doc and tag-rect add a corner tag', () => {
    expect(tags('tag-doc').length).toBeGreaterThan(1);
    expect(tags('tag-rect').length).toBeGreaterThan(1);
  });

  it('delay, curv-trap, h-cyl, datastore and flag are path-based', () => {
    for (const n of ['delay', 'curv-trap', 'h-cyl', 'datastore', 'flag']) {
      expect(tags(n), n).toContain('path');
    }
  });

  it('braces draws two curves, brace and brace-r draw one each', () => {
    expect(tags('brace')).toHaveLength(1);
    expect(tags('brace-r')).toHaveLength(1);
    expect(tags('braces')).toHaveLength(2);
  });

  it('every curve shape uses absolute path commands only', () => {
    for (const n of ['doc', 'lin-doc', 'tag-doc', 'tag-rect', 'delay', 'curv-trap',
      'h-cyl', 'datastore', 'flag', 'brace', 'brace-r', 'braces']) {
      for (const el of SHAPES[n]!.render(geom(200, 120, 160, 80))) {
        if (el.tagName.toLowerCase() !== 'path') { continue; }
        expect(el.getAttribute('d'), n).not.toMatch(/[a-z]/);
      }
    }
  });
});

describe('stacked shapes', () => {
  it('st-rect draws three offset rectangles', () => {
    const els = SHAPES['st-rect']!.render(geom(200, 120, 160, 80));
    expect(els.map((e) => e.tagName.toLowerCase())).toEqual(['rect', 'rect', 'rect']);
    const xs = els.map((e) => Number(e.getAttribute('x')));
    expect(new Set(xs).size).toBe(3);
  });

  it('docs draws three offset document bodies', () => {
    const els = SHAPES['docs']!.render(geom(200, 120, 160, 80));
    expect(els).toHaveLength(3);
    expect(new Set(els.map((e) => e.getAttribute('d'))).size).toBe(3);
  });

  it('cloud is a single closed path', () => {
    const els = SHAPES['cloud']!.render(geom(200, 120, 160, 80));
    expect(els).toHaveLength(1);
    expect(els[0]!.getAttribute('d')).toMatch(/Z$/);
  });

  it('the registry now holds all 48 shapes', () => {
    expect(ALL_SHAPES).toHaveLength(48);
  });
});

/**
 * The bounds cases above catch a shape drawing OUTSIDE its box. These catch the
 * opposite failure, which no bounds check can see: a shape that stays inside
 * but collapses, because an absolute pixel constant did not scale down to the
 * palette's 28x16 icon box. Both were live bugs.
 */
describe('shapes stay legible at palette icon size', () => {
  const ICON = () => geom(18, 12, 28, 16);

  it('flag keeps its two wave baselines apart instead of collapsing to a line', () => {
    // `amp` was a fixed 8, which is exactly half a 16px-tall box, so `top + amp`
    // and `bottom - amp` met on the centre line and the paper tape rendered as
    // a flat sliver 4.6px tall.
    const d = SHAPES['flag']!.render(ICON())[0]!.getAttribute('d')!;
    const top = Number(/^M[-\d.]+,([-\d.]+)/.exec(d)![1]);
    const bottom = Number(/L[-\d.]+,([-\d.]+)/.exec(d)![1]);
    expect(Math.abs(bottom - top)).toBeGreaterThan(16 * 0.3);
  });

  it('braces draws its two halves without overlapping them', () => {
    // The spine inset (10) and cusp reach (8) were absolute, so on a 28px-wide
    // box the left brace spanned x 10..22 and the right x 14..26 — they drew
    // through each other in the middle of the icon.
    const [left, right] = SHAPES['braces']!.render(ICON())
      .map((el) => probeBounds([el])!);
    expect(left!.maxX).toBeLessThan(right!.minX);
  });
});
