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
