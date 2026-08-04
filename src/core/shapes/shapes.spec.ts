import { describe, it, expect } from 'vitest';
import { ALL_SHAPES, SHAPES, ALIAS_INDEX, lookupShape } from './registry';
import { geom } from './primitives';
import { probeBounds } from './geometryProbe';
import { mermaidToModel } from '../parser';
import { modelToMermaid } from '../serializer';
import { estimateNodeSize } from '../nodeGeometry';
import { emptyModel } from '../model';
import type { DiagramModel, DiagramNode } from '../model';

/** A generous box so shapes with internal insets have room to be themselves. */
const BOX = { cx: 200, cy: 120, w: 160, h: 80 };
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
  it('renders elements that stay within its box', () => {
    const g = geom(BOX.cx, BOX.cy, BOX.w, BOX.h);
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
  // shapes, whose `d` string is authored directly and bypasses `num()`. None
  // of the current 14 shapes use `path()`, so today this case always passes
  // trivially; it starts actually protecting something once a path-based
  // shape lands (Task 13).
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
