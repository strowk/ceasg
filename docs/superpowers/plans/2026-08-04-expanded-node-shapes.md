# Expanded Node Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support all 48 Mermaid v11.3.0 node shapes in the ceasg visual editor, defined once each in a registry, with lossless round-tripping and self-reporting degradation.

**Architecture:** `src/core/shapes.ts` becomes a `src/core/shapes/` package where each shape is one `ShapeDef` entry (label, group, aliases, bracket form, sizing, outline, render). The seven sites that currently define shapes in parallel — the `NodeShape` union, `NODE_SHAPES`, `SHAPE_LABELS`, `V11_SHAPE_MAP`, and three switch statements — all become derived from that registry. A `diagnostics.ts` seam (mirroring the existing `dom.ts` seam) lets runtime-agnostic core code report degradation to a VS Code output channel without importing `vscode`.

**Tech Stack:** TypeScript, vitest (unit), esbuild, VS Code extension API, SVG DOM via `getDocument()` shim.

**Spec:** `docs/superpowers/specs/2026-08-04-expanded-node-shapes-design.md`

## Global Constraints

- **Never import `vscode` from `src/core/` or `src/webview/`.** Core runs in three runtimes (extension host, WYSIWYG webview, Markdown preview); only the host has the API. Use the diagnostics seam.
- **Never throw from a render path.** The Markdown preview blanks the entire code block on an uncaught exception. Degrade and warn instead.
- **The 14 existing shapes must render pixel-identically** after the registry refactor. Their geometry code is moved verbatim, not rewritten.
- **All existing tests must pass at every commit.** Run `pnpm test:unit` before each commit.
- **Registry keys are Mermaid canonical short names**, e.g. `dbl-circ` not `double-circle`. Historical ceasg names survive only as aliases.
- **Shape is never persisted.** It is re-derived from syntax on every open. No comment format changes.
- Attribution headers on files derived from Mermaid Flow (`src/core/shapes.ts`, `nodeGeometry.ts`, `model.ts`) must be preserved when code moves out of them.

## Shape inventory

48 shapes in six groups. **Bold** = new in this plan.

| Group id | Title | Shapes |
| --- | --- | --- |
| `basic` | Basic | rect, rounded, stadium, circle, dbl-circ, diam, hex, odd, **text** |
| `process` | Process | fr-rect, trap-t, trap-b, **lin-rect**, **div-rect**, **st-rect**, **tag-rect**, **sl-rect** |
| `data` | Data & I/O | cyl, lean-r, lean-l, **h-cyl**, **lin-cyl**, **datastore**, **win-pane**, **bow-rect**, **notch-rect**, **flag**, **curv-trap** |
| `documents` | Documents | **doc**, **lin-doc**, **docs**, **tag-doc** |
| `flow` | Flow Control | **tri**, **flip-tri**, **fork**, **f-circ**, **sm-circ**, **fr-circ**, **cross-circ**, **notch-pent**, **delay**, **hourglass**, **bolt** |
| `annotations` | Annotations | **brace**, **brace-r**, **braces**, **cloud**, **bang** |

Historical ceasg name → registry key: `round`→`rounded`, `subroutine`→`fr-rect`, `cylinder`→`cyl`, `double-circle`→`dbl-circ`, `diamond`→`diam`, `hexagon`→`hex`, `parallelogram`→`lean-r`, `parallelogram-alt`→`lean-l`, `trapezoid`→`trap-b`, `trapezoid-alt`→`trap-t`, `asymmetric`→`odd`. `rect`, `stadium`, `circle` are unchanged.

The 34 new shapes are grouped into tasks by which drawing primitive they need, not by semantic group:

| Task | Primitive needed | Count | Shapes |
| --- | --- | --- | --- |
| 11 | rect / line / circle only | 10 | lin-rect, div-rect, win-pane, lin-cyl, fork, sm-circ, f-circ, fr-circ, cross-circ, text |
| 12 | polygon | 9 | tri, flip-tri, notch-rect, notch-pent, sl-rect, bow-rect, hourglass, bolt, bang |
| 13 | path (arcs / béziers) | 12 | doc, lin-doc, tag-doc, tag-rect, delay, curv-trap, h-cyl, datastore, flag, brace, brace-r, braces |
| 14 | stacked copies | 3 | st-rect, docs, cloud |

This corrects two tier assignments in the spec: `lin-doc` needs the wavy-bottom path from Task 13, and `flag` (paper tape) has wavy top and bottom edges so it cannot be a plain polygon. Totals are unchanged.

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/core/shapes/types.ts` | `ShapeName`, `ShapeGroupId`, `ShapeGeom`, `SizingCtx`, `ShapeDef`, `SHAPE_GROUP_TITLES` |
| `src/core/shapes/primitives.ts` | SVG element builders and shared path fragments. No shape knowledge. |
| `src/core/shapes/basic.ts` | 9 `basic` group defs |
| `src/core/shapes/process.ts` | 8 `process` group defs |
| `src/core/shapes/data.ts` | 11 `data` group defs |
| `src/core/shapes/documents.ts` | 4 `documents` group defs |
| `src/core/shapes/flow.ts` | 11 `flow` group defs |
| `src/core/shapes/annotations.ts` | 5 `annotations` group defs |
| `src/core/shapes/registry.ts` | Collects defs into `SHAPES`, `ALL_SHAPES`, `SHAPE_GROUPS`, `ALIAS_INDEX` |
| `src/core/shapes/index.ts` | Public surface; keeps `createShapeElements` / `createShapeIcon` signatures |
| `src/core/shapes/registry.spec.ts` | Registry invariants |
| `src/core/shapes/shapes.spec.ts` | Parameterised suite over `ALL_SHAPES` |
| `src/core/diagnostics.ts` | `warn`, `setDiagnosticSink`, dedupe |
| `src/core/diagnostics.spec.ts` | Dedupe identity, lifetime, bound |
| `src/extension/diagnosticChannel.ts` | Output channel sink for the extension host |
| `scripts/generate-shape-gallery.ts` | Writes `docs/shape-gallery.md` |

**Deleted:** `src/core/shapes.ts`, `src/core/shapes.spec.ts` (content moves into the package).

**Modified:** `src/core/model.ts`, `nodeGeometry.ts`, `parser.ts`, `serializer.ts`, `layout.ts`, `index.ts`, `src/shared/messages.ts`, `src/extension.ts`, `src/extension/panelManager.ts`, `src/webview/main.ts`, `src/webview/wysiwyg/edgePath.ts`, `paletteModel.ts`, `properties.ts`, plus specs referencing renamed ids.

---

### Task 1: Shape types and drawing primitives

Foundation with no dependencies. Produces the vocabulary every later task uses.

**Files:**
- Create: `src/core/shapes/types.ts`
- Create: `src/core/shapes/primitives.ts`
- Test: `src/core/shapes/primitives.spec.ts`

**Interfaces:**
- Consumes: `getDocument()` from `src/core/dom.ts`; `NodeStyle` from `src/core/model.ts` (type-only import — see note below).
- Produces: `ShapeGeom`, `SizingCtx`, `ShapeDef`, `ShapeName`, `ShapeGroupId`, `SHAPE_GROUP_TITLES`, and the primitives `el`, `polygon`, `path`, `rect`, `ellipse`, `circle`, `line`, `vline`, `hline`, `geom`.

**Import direction:** `types.ts` imports `NodeStyle` from `model.ts` with `import type`, which erases at compile time and cannot create a runtime cycle. `model.ts` will import `ShapeName` from this package in Task 3. Never use a value import between them.

- [ ] **Step 1: Write the failing test**

Create `src/core/shapes/primitives.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { geom, polygon, rect, path, vline } from './primitives';

describe('geom', () => {
  it('derives edges and half-extents from centre and size', () => {
    const g = geom(100, 50, 80, 44);
    expect(g).toEqual({
      cx: 100, cy: 50, w: 80, h: 44,
      left: 60, right: 140, top: 28, bottom: 72,
      hw: 40, hh: 22,
    });
  });

  it('clamps degenerate sizes to the floor instead of producing negatives', () => {
    const g = geom(0, 0, 0, -10);
    expect(g.w).toBeGreaterThan(0);
    expect(g.h).toBeGreaterThan(0);
    expect(g.right).toBeGreaterThan(g.left);
    expect(g.bottom).toBeGreaterThan(g.top);
  });
});

describe('primitives', () => {
  it('polygon joins points into a points attribute', () => {
    const p = polygon([[0, 0], [10, 0], [5, 10]]);
    expect(p.getAttribute('points')).toBe('0,0 10,0 5,10');
  });

  it('polygon emits no NaN for degenerate input', () => {
    const p = polygon([[NaN, 0], [10, 0]]);
    expect(p.getAttribute('points')).not.toContain('NaN');
  });

  it('rect sets position, size and corner radius', () => {
    const r = rect(1, 2, 30, 40, 5);
    expect(r.getAttribute('x')).toBe('1');
    expect(r.getAttribute('width')).toBe('30');
    expect(r.getAttribute('rx')).toBe('5');
  });

  it('path sets the d attribute', () => {
    expect(path('M0,0 L10,10').getAttribute('d')).toBe('M0,0 L10,10');
  });

  it('vline draws a vertical line with no fill', () => {
    const l = vline(5, 0, 10);
    expect(l.getAttribute('x1')).toBe('5');
    expect(l.getAttribute('x2')).toBe('5');
    expect(l.getAttribute('fill')).toBe('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/shapes/primitives.spec.ts`
Expected: FAIL — `Failed to resolve import "./primitives"`.

- [ ] **Step 3: Write `types.ts`**

```ts
/*
 * Shape vocabulary shared by the registry, the renderer, the palette and the
 * layout. Defined here rather than in model.ts so the registry can be imported
 * without pulling in the diagram model.
 */

import type { NodeStyle } from '../model';

/** Registry keys are Mermaid v11 canonical short names. */
export type ShapeName = string & { readonly __shapeName?: unique symbol };

export type ShapeGroupId =
  | 'basic' | 'process' | 'data' | 'documents' | 'flow' | 'annotations';

/** Display titles for the palette, in palette order. */
export const SHAPE_GROUP_TITLES: Array<{ id: ShapeGroupId; title: string }> = [
  { id: 'basic', title: 'Basic' },
  { id: 'process', title: 'Process' },
  { id: 'data', title: 'Data & I/O' },
  { id: 'documents', title: 'Documents' },
  { id: 'flow', title: 'Flow Control' },
  { id: 'annotations', title: 'Annotations' },
];

/** A node's box, pre-resolved so every render function reads the same fields. */
export interface ShapeGeom {
  cx: number; cy: number; w: number; h: number;
  left: number; right: number; top: number; bottom: number;
  hw: number; hh: number;
}

/** What `estimateNodeSize` already computed, handed to a def's `size` rule. */
export interface SizingCtx {
  style?: NodeStyle;
  /** Width of the widest label line, in px, in the resolved font. */
  widest: number;
  fontSize: number;
  lineCount: number;
}

export type Pt = [number, number];

export interface ShapeDef {
  /** Mermaid canonical short name; the registry key. */
  name: ShapeName;
  /** Human label for the palette and the properties dropdown. */
  label: string;
  group: ShapeGroupId;
  /** Every Mermaid alias plus ceasg's historical name. Must not collide. */
  aliases: string[];
  /** Bracket serialization, present only for shapes Mermaid can express that way. */
  bracket?: (id: string, label: string) => string;
  /** Adjust the label-derived box. Omit when the base box is correct. */
  size?: (base: { w: number; h: number }, ctx: SizingCtx) => { w: number; h: number };
  /** Outline for edge anchoring. Omit to use bounding-box math. */
  outline?: (g: ShapeGeom) => Pt[];
  render: (g: ShapeGeom) => SVGElement[];
}
```

`ShapeName` is a branded `string` rather than a union so the registry stays the
single source of truth; Task 16's invariant tests enforce that only registered
names are reachable.

- [ ] **Step 4: Write `primitives.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit src/core/shapes/primitives.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Verify types compile**

Run: `pnpm check-types`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/shapes/types.ts src/core/shapes/primitives.ts src/core/shapes/primitives.spec.ts
git commit -m "feat(shapes): add shape types and drawing primitives"
```

---

### Task 2: Registry with the 14 existing shapes

Moves current geometry verbatim into defs and builds the registry. Behaviour-neutral: nothing consumes the registry yet.

**Files:**
- Create: `src/core/shapes/basic.ts`, `process.ts`, `data.ts`, `registry.ts`, `index.ts`
- Create: `src/core/shapes/documents.ts`, `flow.ts`, `annotations.ts` (empty arrays for now)
- Test: `src/core/shapes/registry.spec.ts`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `SHAPES: Record<string, ShapeDef>`, `ALL_SHAPES: ShapeDef[]`, `SHAPE_GROUPS: Array<{id, title, shapes: ShapeDef[]}>`, `ALIAS_INDEX: Map<string, ShapeName>`, `lookupShape(name: string): ShapeDef | undefined`, `createShapeElements(shape, cx, cy, w, h): SVGElement[]`, `createShapeIcon(shape): SVGSVGElement`.

- [ ] **Step 1: Write the failing test**

Create `src/core/shapes/registry.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SHAPES, ALL_SHAPES, SHAPE_GROUPS, ALIAS_INDEX, lookupShape } from './registry';

describe('registry', () => {
  it('registers every currently supported shape under its Mermaid name', () => {
    for (const name of ['rect', 'rounded', 'stadium', 'fr-rect', 'cyl', 'circle',
      'dbl-circ', 'diam', 'hex', 'lean-r', 'lean-l', 'trap-b', 'trap-t', 'odd']) {
      expect(SHAPES[name], `missing ${name}`).toBeDefined();
    }
    expect(ALL_SHAPES).toHaveLength(14);
  });

  it('resolves historical ceasg names through aliases', () => {
    expect(ALIAS_INDEX.get('double-circle')).toBe('dbl-circ');
    expect(ALIAS_INDEX.get('parallelogram-alt')).toBe('lean-l');
    expect(ALIAS_INDEX.get('subroutine')).toBe('fr-rect');
    expect(ALIAS_INDEX.get('asymmetric')).toBe('odd');
  });

  it('resolves Mermaid aliases', () => {
    expect(ALIAS_INDEX.get('database')).toBe('cyl');
    expect(ALIAS_INDEX.get('question')).toBe('diam');
    expect(ALIAS_INDEX.get('lean-right')).toBe('lean-r');
  });

  it('lookupShape accepts a canonical name or any alias, case-insensitively', () => {
    expect(lookupShape('CYL')?.name).toBe('cyl');
    expect(lookupShape('Database')?.name).toBe('cyl');
    expect(lookupShape('nonsense')).toBeUndefined();
  });

  it('every shape has a bracket form, since all 14 predate @{} syntax', () => {
    for (const def of ALL_SHAPES) {
      expect(def.bracket, `${def.name} lost its bracket form`).toBeDefined();
    }
  });

  it('groups are in palette order and contain every shape exactly once', () => {
    expect(SHAPE_GROUPS.map((g) => g.id)).toEqual(
      ['basic', 'process', 'data', 'documents', 'flow', 'annotations']);
    const flat = SHAPE_GROUPS.flatMap((g) => g.shapes.map((s) => s.name));
    expect(flat.slice().sort()).toEqual(ALL_SHAPES.map((s) => s.name).sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/shapes/registry.spec.ts`
Expected: FAIL — `Failed to resolve import "./registry"`.

- [ ] **Step 3: Write `basic.ts`**

Geometry is moved verbatim from `src/core/shapes.ts:53-184`. `slant` was a shared local there; it is inlined per shape here.

```ts
/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): geometry unchanged, restructured into registry entries.
 */

import { circle, polygon, rect, unfilled } from './primitives';
import type { ShapeDef } from './types';

export const BASIC_SHAPES: ShapeDef[] = [
  {
    name: 'rect',
    label: 'Rectangle',
    group: 'basic',
    aliases: ['proc', 'process', 'rectangle'],
    bracket: (id, label) => `${id}[${label}]`,
    render: (g) => [rect(g.left, g.top, g.w, g.h, 4)],
  },
  {
    name: 'rounded',
    label: 'Rounded',
    group: 'basic',
    aliases: ['round', 'event'],
    bracket: (id, label) => `${id}(${label})`,
    render: (g) => [rect(g.left, g.top, g.w, g.h, Math.min(14, g.hh))],
  },
  {
    name: 'stadium',
    label: 'Stadium',
    group: 'basic',
    aliases: ['pill', 'terminal'],
    bracket: (id, label) => `${id}([${label}])`,
    size: (b) => ({ w: b.w + 16, h: b.h }),
    render: (g) => [rect(g.left, g.top, g.w, g.h, g.hh)],
  },
  {
    name: 'circle',
    label: 'Circle',
    group: 'basic',
    aliases: ['circ'],
    bracket: (id, label) => `${id}((${label}))`,
    size: (b) => { const d = Math.max(b.w, 66); return { w: d, h: d }; },
    render: (g) => [circle(g.cx, g.cy, Math.min(g.hw, g.hh))],
  },
  {
    name: 'dbl-circ',
    label: 'Double circle',
    group: 'basic',
    aliases: ['double-circle', 'stop'],
    bracket: (id, label) => `${id}(((${label})))`,
    size: (b) => { const d = Math.max(b.w, 66); return { w: d, h: d }; },
    render: (g) => {
      const r = Math.min(g.hw, g.hh);
      return [circle(g.cx, g.cy, r), unfilled(circle(g.cx, g.cy, Math.max(r - 5, 2)))];
    },
  },
  {
    name: 'diam',
    label: 'Decision',
    group: 'basic',
    aliases: ['diamond', 'decision', 'question'],
    bracket: (id, label) => `${id}{${label}}`,
    size: diamondSize,
    render: (g) => [polygon([
      [g.cx, g.top], [g.right, g.cy], [g.cx, g.bottom], [g.left, g.cy],
    ])],
  },
  {
    name: 'hex',
    label: 'Hexagon',
    group: 'basic',
    aliases: ['hexagon', 'prepare'],
    bracket: (id, label) => `${id}{{${label}}}`,
    size: (b) => ({ w: b.w + 40, h: b.h }),
    render: (g) => {
      const inset = Math.min(g.hw * 0.3, g.hh);
      return [polygon([
        [g.left, g.cy], [g.left + inset, g.top], [g.right - inset, g.top],
        [g.right, g.cy], [g.right - inset, g.bottom], [g.left + inset, g.bottom],
      ])];
    },
  },
  {
    name: 'odd',
    label: 'Asymmetric',
    group: 'basic',
    aliases: ['asymmetric'],
    bracket: (id, label) => `${id}>${label}]`,
    size: (b) => ({ w: b.w + 26, h: b.h }),
    render: (g) => {
      const ind = Math.min(g.hw * 0.35, 16);
      return [polygon([
        [g.left, g.top], [g.right, g.top], [g.right, g.bottom],
        [g.left, g.bottom], [g.left + ind, g.cy],
      ])];
    },
  },
];

/**
 * Moved verbatim from nodeGeometry.ts:64-80. A rhombus contains a tw x th label
 * only where tw/w + th/h <= 1, so fixed padding gets relatively tighter as the
 * label grows. Grow both axes uniformly until the label sits within DIAMOND_FIT.
 */
const DIAMOND_FIT = 0.7;

function diamondSize(
  b: { w: number; h: number },
  ctx: { widest: number; fontSize: number; lineCount: number },
): { w: number; h: number } {
  let w = Math.max(b.w + 28, 100);
  let h = Math.max(72, b.h + 28);
  const grow = (ctx.widest / w + (ctx.fontSize * ctx.lineCount) / h) / DIAMOND_FIT;
  if (grow > 1) {
    w = Math.ceil(w * grow);
    h = Math.ceil(h * grow);
  }
  return { w, h };
}
```

- [ ] **Step 4: Write `process.ts` and `data.ts` with the remaining existing shapes**

`src/core/shapes/process.ts`:

```ts
import { polygon, rect, vline } from './primitives';
import type { ShapeDef, ShapeGeom } from './types';

/** Shared slant for the parallelogram/trapezoid family (shapes.ts:51). */
export function slantOf(g: ShapeGeom): number {
  return Math.min(g.hw * 0.5, 20);
}

export const PROCESS_SHAPES: ShapeDef[] = [
  {
    name: 'fr-rect',
    label: 'Subprocess',
    group: 'process',
    aliases: ['subroutine', 'subproc', 'subprocess', 'framed-rectangle'],
    bracket: (id, label) => `${id}[[${label}]]`,
    render: (g) => {
      const inset = 7;
      return [
        rect(g.left, g.top, g.w, g.h, 3),
        vline(g.left + inset, g.top, g.bottom),
        vline(g.right - inset, g.top, g.bottom),
      ];
    },
  },
  {
    name: 'trap-b',
    label: 'Trapezoid',
    group: 'process',
    aliases: ['trapezoid', 'trapezoid-bottom', 'priority'],
    bracket: (id, label) => `${id}[/${label}\\]`,
    size: (b) => ({ w: b.w + 46, h: b.h }),
    render: (g) => {
      const s = slantOf(g);
      return [polygon([
        [g.left + s, g.top], [g.right - s, g.top], [g.right, g.bottom], [g.left, g.bottom],
      ])];
    },
  },
  {
    name: 'trap-t',
    label: 'Manual operation',
    group: 'process',
    aliases: ['trapezoid-alt', 'trapezoid-top', 'inv-trapezoid', 'manual'],
    bracket: (id, label) => `${id}[\\${label}/]`,
    size: (b) => ({ w: b.w + 46, h: b.h }),
    render: (g) => {
      const s = slantOf(g);
      return [polygon([
        [g.left, g.top], [g.right, g.top], [g.right - s, g.bottom], [g.left + s, g.bottom],
      ])];
    },
  },
];
```

`src/core/shapes/data.ts`:

```ts
import { ellipse, polygon, rect } from './primitives';
import type { ShapeDef, ShapeGeom } from './types';

function slantOf(g: ShapeGeom): number {
  return Math.min(g.hw * 0.5, 20);
}

export const DATA_SHAPES: ShapeDef[] = [
  {
    name: 'cyl',
    label: 'Cylinder / database',
    group: 'data',
    aliases: ['cylinder', 'db', 'database'],
    bracket: (id, label) => `${id}[(${label})]`,
    size: (b) => ({ w: b.w, h: b.h + 20 }),
    render: (g) => {
      const ry = Math.min(g.hh * 0.5, 9);
      return [
        rect(g.left, g.top + ry, g.w, g.h - 2 * ry, 0),
        ellipse(g.cx, g.top + ry, g.hw, ry),
      ];
    },
  },
  {
    name: 'lean-r',
    label: 'Parallelogram',
    group: 'data',
    aliases: ['parallelogram', 'lean-right', 'in-out'],
    bracket: (id, label) => `${id}[/${label}/]`,
    size: (b) => ({ w: b.w + 46, h: b.h }),
    render: (g) => {
      const s = slantOf(g);
      return [polygon([
        [g.left + s, g.top], [g.right, g.top], [g.right - s, g.bottom], [g.left, g.bottom],
      ])];
    },
  },
  {
    name: 'lean-l',
    label: 'Parallelogram (alt)',
    group: 'data',
    aliases: ['parallelogram-alt', 'lean-left', 'out-in'],
    bracket: (id, label) => `${id}[\\${label}\\]`,
    size: (b) => ({ w: b.w + 46, h: b.h }),
    render: (g) => {
      const s = slantOf(g);
      return [polygon([
        [g.left, g.top], [g.right - s, g.top], [g.right, g.bottom], [g.left + s, g.bottom],
      ])];
    },
  },
];
```

- [ ] **Step 5: Write the three empty group modules**

```ts
// src/core/shapes/documents.ts
import type { ShapeDef } from './types';
export const DOCUMENT_SHAPES: ShapeDef[] = [];
```

```ts
// src/core/shapes/flow.ts
import type { ShapeDef } from './types';
export const FLOW_SHAPES: ShapeDef[] = [];
```

```ts
// src/core/shapes/annotations.ts
import type { ShapeDef } from './types';
export const ANNOTATION_SHAPES: ShapeDef[] = [];
```

- [ ] **Step 6: Write `registry.ts`**

```ts
/*
 * The single source of truth for node shapes. Every other module derives from
 * this: model.ts (union, list, labels), parser.ts (alias resolution),
 * serializer.ts (bracket forms), nodeGeometry.ts (sizing), and both palettes.
 */

import { ANNOTATION_SHAPES } from './annotations';
import { BASIC_SHAPES } from './basic';
import { DATA_SHAPES } from './data';
import { DOCUMENT_SHAPES } from './documents';
import { FLOW_SHAPES } from './flow';
import { PROCESS_SHAPES } from './process';
import { SHAPE_GROUP_TITLES } from './types';
import type { ShapeDef, ShapeGroupId, ShapeName } from './types';

export const ALL_SHAPES: ShapeDef[] = [
  ...BASIC_SHAPES,
  ...PROCESS_SHAPES,
  ...DATA_SHAPES,
  ...DOCUMENT_SHAPES,
  ...FLOW_SHAPES,
  ...ANNOTATION_SHAPES,
];

export const SHAPES: Record<string, ShapeDef> = Object.fromEntries(
  ALL_SHAPES.map((d) => [d.name, d]),
);

export const SHAPE_GROUPS: Array<{ id: ShapeGroupId; title: string; shapes: ShapeDef[] }> =
  SHAPE_GROUP_TITLES.map(({ id, title }) => ({
    id,
    title,
    shapes: ALL_SHAPES.filter((d) => d.group === id),
  }));

/**
 * Every alias and every canonical name, lowercased, mapped to the canonical
 * name. Built once at module load. A duplicate alias would make resolution
 * order-dependent; registry.spec.ts asserts uniqueness rather than throwing
 * here, because a throw at import time would disable the whole extension.
 */
export const ALIAS_INDEX: Map<string, ShapeName> = (() => {
  const m = new Map<string, ShapeName>();
  for (const def of ALL_SHAPES) {
    m.set(def.name.toLowerCase(), def.name);
    for (const alias of def.aliases) {
      if (!m.has(alias.toLowerCase())) { m.set(alias.toLowerCase(), def.name); }
    }
  }
  return m;
})();

/** Resolve a canonical name or any alias, case-insensitively. */
export function lookupShape(name: string): ShapeDef | undefined {
  const canonical = ALIAS_INDEX.get(name.toLowerCase());
  return canonical === undefined ? undefined : SHAPES[canonical];
}
```

- [ ] **Step 7: Write `index.ts` preserving the current public surface**

```ts
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
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test:unit src/core/shapes/`
Expected: PASS — 6 registry tests, 7 primitive tests.

- [ ] **Step 9: Commit**

```bash
git add src/core/shapes/
git commit -m "feat(shapes): add registry with the 14 existing shapes"
```

---

### Task 3: Derive model.ts from the registry

Deletes the old `shapes.ts` and makes `NodeShape`, `NODE_SHAPES`, and `SHAPE_LABELS` views over the registry.

**Files:**
- Modify: `src/core/model.ts:28-76`
- Delete: `src/core/shapes.ts`, `src/core/shapes.spec.ts`
- Test: `src/core/model.spec.ts` (add cases)

**Interfaces:**
- Consumes: `ALL_SHAPES` from Task 2.
- Produces: `NodeShape` (alias of `ShapeName`), `NODE_SHAPES: NodeShape[]`, `SHAPE_LABELS: Record<string, string>` — all consumers keep their current import sites.

**Import direction:** `model.ts` value-imports from `./shapes`; `shapes/types.ts` only `import type`s from `model.ts`. Type-only imports erase at compile time, so there is no runtime cycle. Do not convert it to a value import.

- [ ] **Step 1: Write the failing test**

Append to `src/core/model.spec.ts`:

```ts
import { ALL_SHAPES } from './shapes';

describe('shape exports derive from the registry', () => {
  it('NODE_SHAPES lists every registered shape in registry order', () => {
    expect(NODE_SHAPES).toEqual(ALL_SHAPES.map((d) => d.name));
  });

  it('SHAPE_LABELS has a label for every registered shape', () => {
    for (const def of ALL_SHAPES) {
      expect(SHAPE_LABELS[def.name]).toBe(def.label);
    }
  });

  it('keeps the historical labels for shapes that existed before', () => {
    expect(SHAPE_LABELS['rect']).toBe('Rectangle');
    expect(SHAPE_LABELS['cyl']).toBe('Cylinder / database');
    expect(SHAPE_LABELS['diam']).toBe('Decision');
  });
});
```

Add `NODE_SHAPES, SHAPE_LABELS` to the existing `./model` import at the top of the file if they are not already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/model.spec.ts`
Expected: FAIL — `NODE_SHAPES` still contains `"round"`, `"subroutine"`, etc.

- [ ] **Step 3: Replace the shape block in `model.ts`**

Delete lines 28-76 (the `NodeShape` union, `NODE_SHAPES`, `SHAPE_LABELS`) and put in their place:

```ts
/** A node shape, keyed by its Mermaid v11 canonical short name. */
export type NodeShape = ShapeName;

/** Every registered shape, in palette order. Derived — do not hand-edit. */
export const NODE_SHAPES: NodeShape[] = ALL_SHAPES.map((d) => d.name);

/** Display labels for the palette and the properties dropdown. Derived. */
export const SHAPE_LABELS: Record<string, string> = Object.fromEntries(
	ALL_SHAPES.map((d) => [d.name, d.label]),
);
```

Add these imports at the top, beside the existing `estimateNodeSize` import:

```ts
import { ALL_SHAPES } from "./shapes";
import type { ShapeName } from "./shapes";
```

- [ ] **Step 4: Delete the superseded files**

```bash
git rm src/core/shapes.ts src/core/shapes.spec.ts
```

`src/core/index.ts` needs no edit: `export * from './shapes'` now resolves to `./shapes/index.ts`.

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm test:unit`
Expected: FAIL — specs still referencing the old shape values.

- [ ] **Step 6: Update the renamed ids in existing specs**

Find every occurrence:

```bash
grep -rn "'round'\|'subroutine'\|'double-circle'\|'parallelogram'\|'parallelogram-alt'\|'trapezoid'\|'trapezoid-alt'\|'asymmetric'\|'cylinder'\|'diamond'\|'hexagon'" src --include=*.spec.ts
```

Apply the mapping from the Shape inventory table. **Leave unchanged any occurrence that is a Mermaid alias under test** — a parser spec asserting `@{shape: diamond}` parses correctly is exercising alias resolution, not a shape value, and must keep working as written.

- [ ] **Step 7: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 8: Verify types compile**

Run: `pnpm check-types`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add -A src/core
git commit -m "refactor(shapes): derive NodeShape and labels from the registry"
```

---

### Task 4: Derive node sizing from the registry

**Files:**
- Modify: `src/core/nodeGeometry.ts:41-102`
- Test: `src/core/nodeGeometry.spec.ts`

**Interfaces:**
- Consumes: `SHAPES` from Task 2; `SizingCtx` from Task 1.
- Produces: `estimateNodeSize(node, style?)` — signature unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/core/nodeGeometry.spec.ts`:

```ts
import { SHAPES } from './shapes';

describe('sizing comes from the registry', () => {
  const node = (shape: string) => ({ id: 'A', label: 'Hi', shape, x: 0, y: 0 } as never);

  it('applies a shape size rule when the def has one', () => {
    expect(estimateNodeSize(node('hex')).w)
      .toBe(estimateNodeSize(node('rect')).w + 40);
  });

  it('uses the base box for shapes with no size rule', () => {
    expect(SHAPES['fr-rect'].size).toBeUndefined();
    expect(estimateNodeSize(node('fr-rect'))).toEqual(estimateNodeSize(node('rect')));
  });

  it('falls back to the base box for an unregistered shape', () => {
    expect(() => estimateNodeSize(node('not-a-shape'))).not.toThrow();
    expect(estimateNodeSize(node('not-a-shape')).w).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/nodeGeometry.spec.ts`
Expected: FAIL — `SHAPES['fr-rect'].size` is undefined as asserted, but `estimateNodeSize` still reads the old switch, so the unregistered-shape case and the registry-driven hex delta do not agree with the new source of truth.

- [ ] **Step 3: Replace the switch with a registry lookup**

Replace `estimateNodeSize` (lines 41-102) with:

```ts
export function estimateNodeSize(
	node: DiagramNode,
	style?: NodeStyle,
): { w: number; h: number } {
	if (node.w && node.h) {
		return { w: node.w, h: node.h };
	}
	const fontSize = style?.fontSize ?? BASE_FONT_SIZE;
	const font = `${fontSize}px ${style?.fontFamily ?? BASE_FONT_FAMILY}`;
	const rawLabel = node.label || node.id;
	const lines = rawLabel.split("\n");
	// Width uses the widest measured line; height grows for multi-line labels.
	const widest = Math.max(...lines.map((l) => measureTextWidth(l, font)));
	const base = {
		w: Math.max(MIN_W, Math.ceil(widest) + PAD_W),
		h: fontSize * lines.length + PAD_H,
	};
	const def = SHAPES[node.shape];
	if (!def?.size) {
		return base;
	}
	return def.size(base, { style, widest, fontSize, lineCount: lines.length });
}
```

Add `import { SHAPES } from "./shapes";` at the top. Delete the now-unused `DIAMOND_FIT` constant and its comment block — it moved to `basic.ts` in Task 2. Keep `NODE_H`, `MIN_W`, `PAD_W`, `PAD_H`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit src/core/nodeGeometry.spec.ts`
Expected: PASS. Every pre-existing sizing assertion must still pass unchanged — that is the proof the move was behaviour-neutral.

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/nodeGeometry.ts src/core/nodeGeometry.spec.ts
git commit -m "refactor(shapes): derive node sizing from the registry"
```

---

### Task 5: Derive parser alias resolution from the registry

**Files:**
- Modify: `src/core/parser.ts:120-166`
- Test: `src/core/parser.spec.ts`

**Interfaces:**
- Consumes: `lookupShape` from Task 2.
- Produces: unchanged `parseNodeToken` behaviour, now resolving every registry alias.

- [ ] **Step 1: Write the failing test**

Append to `src/core/parser.spec.ts`:

```ts
describe('@{shape} alias resolution', () => {
  const shapeOf = (src: string) =>
    mermaidToModel(`flowchart TD\n  ${src}\n`).model.nodes[0]?.shape;

  it('resolves canonical Mermaid names', () => {
    expect(shapeOf('A@{shape: dbl-circ, label: "x"}')).toBe('dbl-circ');
  });

  it('resolves documented aliases', () => {
    expect(shapeOf('A@{shape: database, label: "x"}')).toBe('cyl');
    expect(shapeOf('A@{shape: out-in, label: "x"}')).toBe('lean-l');
  });

  it('is case-insensitive', () => {
    expect(shapeOf('A@{shape: DATABASE, label: "x"}')).toBe('cyl');
  });

  it('degrades an unknown name to rect', () => {
    expect(shapeOf('A@{shape: not-a-shape, label: "x"}')).toBe('rect');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/parser.spec.ts`
Expected: FAIL — `'dbl-circ'` resolves to `'double-circle'` under the old `V11_SHAPE_MAP`.

- [ ] **Step 3: Replace `V11_SHAPE_MAP` with `lookupShape`**

Delete `V11_SHAPE_MAP` and its doc comment (lines 144-166), then change lines 127-130 to:

```ts
		// Unknown shape names degrade to rect (nearest supported shape).
		if (shapeName !== undefined) {
			result.shape = lookupShape(shapeName)?.name ?? "rect";
		}
```

Add `import { lookupShape } from "./shapes";` at the top.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit src/core/parser.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/parser.ts src/core/parser.spec.ts
git commit -m "refactor(shapes): resolve @{shape} aliases through the registry"
```

---

### Task 6: Derive serializer bracket forms from the registry

**Files:**
- Modify: `src/core/serializer.ts:57-91`
- Test: `src/core/roundtrip.spec.ts`

**Interfaces:**
- Consumes: `SHAPES`, `ALL_SHAPES` from Task 2.
- Produces: `nodeDeclaration(node)` — module-private, unchanged output for all 14 shapes.

- [ ] **Step 1: Write the guard test**

Append to `src/core/roundtrip.spec.ts`:

```ts
import { ALL_SHAPES } from './shapes';

describe('bracket serialization comes from the registry', () => {
  it('every registered bracket form round-trips through the parser', () => {
    for (const def of ALL_SHAPES) {
      if (!def.bracket) { continue; }
      const src = `flowchart TD\n  ${def.bracket('A', 'Hi')}\n`;
      expect(mermaidToModel(src).model.nodes[0]?.shape, def.name).toBe(def.name);
    }
  });
});
```

- [ ] **Step 2: Run it to confirm the baseline**

Run: `pnpm test:unit src/core/roundtrip.spec.ts`
Expected: PASS. This test guards the refactor rather than driving it — it must still pass after Step 3 removes the switch, which is the point.

- [ ] **Step 3: Replace the switch**

Replace `nodeDeclaration` (lines 57-91) with:

```ts
function nodeDeclaration(node: DiagramNode): string {
	const label = quoteLabel(node.label);
	const id = sanitizeId(node.id);
	const def = SHAPES[node.shape];
	// A shape with no bracket form cannot be written in the classic syntax;
	// Task 9 routes those to the @{} attribute form instead.
	return def?.bracket ? def.bracket(id, label) : `${id}[${label}]`;
}
```

Add `import { SHAPES } from "./shapes";` at the top.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit`
Expected: PASS, including every pre-existing round-trip spec.

- [ ] **Step 5: Commit**

```bash
git add src/core/serializer.ts src/core/roundtrip.spec.ts
git commit -m "refactor(shapes): derive bracket serialization from the registry"
```

---

### Task 7: Diagnostics seam

Mirrors the `dom.ts` seam so runtime-agnostic core code can report degradation without importing `vscode`.

**Files:**
- Create: `src/core/diagnostics.ts`
- Test: `src/core/diagnostics.spec.ts`
- Modify: `src/core/index.ts`, `src/core/layout.ts:32`

**Interfaces:**
- Consumes: nothing.
- Produces: `warn(code, key, message, detail?)`, `setDiagnosticSink(sink)`, `setDiagnosticScope(scope)`, `clearDiagnostics(scope?)`, `DEDUPE_LIMIT`, and types `DiagnosticCode`, `Diagnostic`, `DiagnosticSink`.

- [ ] **Step 1: Write the failing test**

Create `src/core/diagnostics.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  warn, setDiagnosticSink, setDiagnosticScope, clearDiagnostics, DEDUPE_LIMIT,
} from './diagnostics';
import type { Diagnostic } from './diagnostics';

describe('diagnostics', () => {
  let seen: Diagnostic[];

  beforeEach(() => {
    seen = [];
    setDiagnosticSink((d) => seen.push(d));
    setDiagnosticScope('doc-a');
    clearDiagnostics();
  });

  it('forwards a warning to the sink', () => {
    warn('unknown-shape', 'clod', 'Unknown Mermaid shape "clod".');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ code: 'unknown-shape', key: 'clod' });
  });

  it('suppresses a repeat with the same code, key and scope', () => {
    for (let i = 0; i < 50; i++) { warn('unknown-shape', 'clod', 'x'); }
    expect(seen).toHaveLength(1);
  });

  it('does not suppress a different key under the same code', () => {
    warn('unknown-shape', 'clod', 'x');
    warn('unknown-shape', 'bogus', 'x');
    expect(seen).toHaveLength(2);
  });

  it('does not suppress the same key under a different scope', () => {
    warn('unknown-shape', 'clod', 'x');
    setDiagnosticScope('doc-b');
    warn('unknown-shape', 'clod', 'x');
    expect(seen).toHaveLength(2);
  });

  it('clearing a scope lets its warnings report again', () => {
    warn('unknown-shape', 'clod', 'x');
    clearDiagnostics('doc-a');
    warn('unknown-shape', 'clod', 'x');
    expect(seen).toHaveLength(2);
  });

  it('clearing one scope leaves another suppressed', () => {
    warn('unknown-shape', 'clod', 'x');
    setDiagnosticScope('doc-b');
    warn('unknown-shape', 'clod', 'x');
    clearDiagnostics('doc-b');
    setDiagnosticScope('doc-a');
    warn('unknown-shape', 'clod', 'x');
    expect(seen).toHaveLength(2);
  });

  it('drops oldest entries past the cap so the set cannot grow unbounded', () => {
    for (let i = 0; i < DEDUPE_LIMIT + 5; i++) { warn('unknown-shape', `k${i}`, 'x'); }
    expect(seen).toHaveLength(DEDUPE_LIMIT + 5);
    // k0 was evicted by the cap, so it reports a second time.
    warn('unknown-shape', 'k0', 'x');
    expect(seen).toHaveLength(DEDUPE_LIMIT + 6);
  });

  it('never throws when the sink itself throws', () => {
    setDiagnosticSink(() => { throw new Error('sink exploded'); });
    expect(() => warn('unknown-shape', 'x', 'y')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/diagnostics.spec.ts`
Expected: FAIL — `Failed to resolve import "./diagnostics"`.

- [ ] **Step 3: Write `diagnostics.ts`**

```ts
/*
 * Reporting seam for degraded rendering, mirroring the dom.ts accessor shim.
 *
 * Core runs in three runtimes: the extension host (which has the vscode API),
 * the WYSIWYG webview (which can postMessage to the host), and the Markdown
 * preview (which can do neither). Core code must never import vscode, so it
 * emits through this seam and each runtime installs the best sink it has.
 */

export type DiagnosticCode =
  | 'unknown-shape'
  | 'shape-lookup-miss'
  | 'alias-collision'
  | 'layout-failed';

export interface Diagnostic {
  code: DiagnosticCode;
  /** Identifies the specific occurrence: a shape name, an alias, an error text. */
  key: string;
  message: string;
  detail?: string;
}

export type DiagnosticSink = (d: Diagnostic) => void;

/**
 * Per-scope suppression cap. The realistic count is one or two; the cap exists
 * so a pathological generated file cannot grow the set without limit.
 */
export const DEDUPE_LIMIT = 200;

/** Works in all three runtimes; replaced by the host with an output channel. */
const consoleSink: DiagnosticSink = (d) => {
  console.warn(`[ceasg] ${d.code}: ${d.message}`, d.detail ?? '');
};

let sink: DiagnosticSink = consoleSink;
/** Document identity, so one file's warning cannot silence another's. */
let scope = 'default';
const seen = new Map<string, Set<string>>();

export function setDiagnosticSink(next: DiagnosticSink): void {
  sink = next;
}

export function setDiagnosticScope(next: string): void {
  scope = next;
}

/**
 * Forget suppressions. Called when a document closes or its panel is disposed,
 * so reopening a file reports its problems afresh. With no argument, clears all
 * scopes (used by tests and on deactivate).
 */
export function clearDiagnostics(target?: string): void {
  if (target === undefined) { seen.clear(); } else { seen.delete(target); }
}

/**
 * Report a degradation once per code+key+scope. Parsing and rendering both
 * re-run on every keystroke, so an un-deduped warning would flood the channel
 * within seconds.
 *
 * Never throws: this is called from render paths where an exception would blank
 * the whole diagram in the Markdown preview.
 */
export function warn(
  code: DiagnosticCode, key: string, message: string, detail?: string,
): void {
  try {
    let keys = seen.get(scope);
    if (!keys) { keys = new Set(); seen.set(scope, keys); }
    const id = `${code} ${key}`;
    if (keys.has(id)) { return; }
    if (keys.size >= DEDUPE_LIMIT) {
      // Sets iterate in insertion order, so the first entry is the oldest.
      const oldest = keys.values().next().value;
      if (oldest !== undefined) { keys.delete(oldest); }
    }
    keys.add(id);
    sink({ code, key, message, detail });
  } catch {
    // A broken sink must not take the renderer down with it.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit src/core/diagnostics.spec.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Route the existing dagre failure through the seam**

In `src/core/layout.ts`, replace line 32:

```ts
		console.error("[ceasg] dagre layout failed, using grid fallback:", e);
```

with:

```ts
		warn(
			"layout-failed",
			String(e),
			"Auto layout failed; using the grid fallback.",
			String(e),
		);
```

Add `import { warn } from "./diagnostics";` at the top.

- [ ] **Step 6: Export the seam from the core barrel**

Add to `src/core/index.ts`:

```ts
export * from './diagnostics';
```

- [ ] **Step 7: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/diagnostics.ts src/core/diagnostics.spec.ts src/core/layout.ts src/core/index.ts
git commit -m "feat(diagnostics): add reporting seam for degraded rendering"
```

---

### Task 8: Wire diagnostics to a VS Code output channel

Installs the host sink and relays webview diagnostics to the same channel.

**Files:**
- Create: `src/extension/diagnosticChannel.ts`
- Modify: `src/core/diagnostics.ts` (add `formatDiagnostic`), `src/shared/messages.ts`, `src/extension.ts`, `src/extension/panelManager.ts`, `src/webview/main.ts`
- Test: `src/core/diagnostics.spec.ts`, `src/core/messages.smoke.spec.ts`

**Interfaces:**
- Consumes: `warn`, `setDiagnosticSink`, `setDiagnosticScope`, `clearDiagnostics`, `Diagnostic` from Task 7.
- Produces: `formatDiagnostic(d: Diagnostic): string`; `DiagnosticMessage`, `isDiagnosticMessage` in `shared/messages.ts`; `installDiagnosticChannel(context): vscode.OutputChannel` and `appendDiagnostic(channel, d)` in `extension/diagnosticChannel.ts`.

**Why `formatDiagnostic` lives in core:** unit tests run under vitest and cannot import `vscode`. Keeping the formatting pure and in core makes it testable; `diagnosticChannel.ts` is then a thin wiring file with nothing worth unit-testing.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/diagnostics.spec.ts`:

```ts
import { formatDiagnostic } from './diagnostics';

describe('formatDiagnostic', () => {
  it('renders code and message on one line', () => {
    expect(formatDiagnostic({ code: 'unknown-shape', key: 'clod', message: 'Unknown shape "clod".' }))
      .toBe('[unknown-shape] Unknown shape "clod".');
  });

  it('appends detail when present', () => {
    expect(formatDiagnostic({
      code: 'layout-failed', key: 'e', message: 'Auto layout failed.', detail: 'boom',
    })).toBe('[layout-failed] Auto layout failed. — boom');
  });
});
```

Append to `src/core/messages.smoke.spec.ts`:

```ts
import { isDiagnosticMessage } from '../shared/messages';

describe('isDiagnosticMessage', () => {
  it('accepts a well-formed diagnostic', () => {
    expect(isDiagnosticMessage({
      type: 'diagnostic', code: 'unknown-shape', key: 'clod', message: 'x',
    })).toBe(true);
  });

  it('rejects other message types and malformed payloads', () => {
    expect(isDiagnosticMessage({ type: 'ready' })).toBe(false);
    expect(isDiagnosticMessage({ type: 'diagnostic', code: 'x' })).toBe(false);
    expect(isDiagnosticMessage(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit src/core/diagnostics.spec.ts src/core/messages.smoke.spec.ts`
Expected: FAIL — `formatDiagnostic` and `isDiagnosticMessage` are not exported.

- [ ] **Step 3: Add `formatDiagnostic` to `src/core/diagnostics.ts`**

```ts
/** One-line rendering shared by the console sink and the output channel. */
export function formatDiagnostic(d: Diagnostic): string {
  return `[${d.code}] ${d.message}${d.detail ? ` — ${d.detail}` : ''}`;
}
```

Then simplify the existing `consoleSink` to use it:

```ts
const consoleSink: DiagnosticSink = (d) => { console.warn(`[ceasg] ${formatDiagnostic(d)}`); };
```

- [ ] **Step 4: Add the message type to `src/shared/messages.ts`**

```ts
export interface DiagnosticMessage {
  type: 'diagnostic';
  code: string;
  key: string;
  message: string;
  detail?: string;
}

export type WebviewToHost = UpdateMessage | ReadyMessage | DiagnosticMessage;

export function isDiagnosticMessage(m: unknown): m is DiagnosticMessage {
  if (!m || typeof m !== 'object') { return false; }
  const o = m as Record<string, unknown>;
  return o.type === 'diagnostic'
    && typeof o.code === 'string'
    && typeof o.key === 'string'
    && typeof o.message === 'string';
}
```

Replace the existing `WebviewToHost` type alias; leave `HostToWebview` unchanged.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit src/core/diagnostics.spec.ts src/core/messages.smoke.spec.ts`
Expected: PASS.

- [ ] **Step 6: Write `src/extension/diagnosticChannel.ts`**

```ts
import * as vscode from 'vscode';
import { formatDiagnostic, setDiagnosticSink } from '../core';
import type { Diagnostic } from '../core';

/** Append one diagnostic to the ceasg output channel. */
export function appendDiagnostic(channel: vscode.OutputChannel, d: Diagnostic): void {
  channel.appendLine(formatDiagnostic(d));
}

/**
 * Create the ceasg output channel and route extension-host diagnostics to it.
 * The WYSIWYG webview reaches this channel by posting a `diagnostic` message,
 * which PanelManager forwards. The Markdown preview has no channel back to the
 * host, so its warnings stay on the preview's console.
 */
export function installDiagnosticChannel(
  context: vscode.ExtensionContext,
): vscode.OutputChannel {
  const channel = vscode.window.createOutputChannel('ceasg');
  context.subscriptions.push(channel);
  setDiagnosticSink((d) => appendDiagnostic(channel, d));
  return channel;
}
```

- [ ] **Step 7: Install the channel in `src/extension.ts`**

Change `activate` to create the channel first and hand it to `PanelManager`:

```ts
export function activate(context: vscode.ExtensionContext) {
  const channel = installDiagnosticChannel(context);
  const panels = new PanelManager(context, channel);
```

Add `import { installDiagnosticChannel } from './extension/diagnosticChannel';`.

- [ ] **Step 8: Relay webview diagnostics in `src/extension/panelManager.ts`**

Change the constructor:

```ts
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly channel: vscode.OutputChannel,
  ) {}
```

Inside `open`, immediately after `this.sessions.set(key, session);`, scope diagnostics to this document so one file cannot silence another:

```ts
    setDiagnosticScope(key);
```

Add a branch at the top of the `onDidReceiveMessage` handler, before the `isReadyMessage` check:

```ts
      if (isDiagnosticMessage(msg)) {
        appendDiagnostic(this.channel, {
          code: msg.code as Diagnostic['code'],
          key: msg.key,
          message: msg.message,
          detail: msg.detail,
        });
        return;
      }
```

And clear the scope's suppressions in `onDidDispose`, so reopening the panel reports its problems afresh:

```ts
    panel.onDidDispose(() => {
      this.sessions.delete(key);
      clearDiagnostics(key);
      disposables.forEach((d) => d.dispose());
    });
```

Add imports:

```ts
import { clearDiagnostics, setDiagnosticScope } from '../core';
import type { Diagnostic } from '../core';
import { appendDiagnostic } from './diagnosticChannel';
import { isDiagnosticMessage } from '../shared/messages';
```

- [ ] **Step 9: Install the posting sink in `src/webview/main.ts`**

Immediately after `const api = acquireVsCodeApi();`:

```ts
// Route core diagnostics to the extension host, which writes them to the
// ceasg output channel. Dedupe already happened in core, so this cannot flood.
setDiagnosticSink((d) => {
  const msg: DiagnosticMessage = {
    type: 'diagnostic', code: d.code, key: d.key, message: d.message, detail: d.detail,
  };
  api.postMessage(msg);
});
```

Add `import { setDiagnosticSink } from '../core';` and add `DiagnosticMessage` to the existing `../shared/messages` import.

- [ ] **Step 10: Run the full unit suite and type check**

Run: `pnpm test:unit && pnpm check-types && pnpm lint`
Expected: all PASS.

- [ ] **Step 11: Manual verification**

Run the extension (F5), open `sample.md`, open the visual editor on a flowchart block, then run **View → Output** and select **ceasg** from the dropdown. The channel exists and is empty. Confirm no errors in the Extension Host log.

- [ ] **Step 12: Commit**

```bash
git add src/core/diagnostics.ts src/core/diagnostics.spec.ts src/core/messages.smoke.spec.ts \
  src/shared/messages.ts src/extension.ts src/extension/diagnosticChannel.ts \
  src/extension/panelManager.ts src/webview/main.ts
git commit -m "feat(diagnostics): report to a ceasg output channel"
```

---

### Task 9: Serialization fidelity

Preserves the author's syntax form, unmodelled `@{}` keys, and unrecognised shape names.

**Files:**
- Modify: `src/core/model.ts` (`DiagramNode`, `duplicateNode`, add `setNodeShape`), `src/core/parser.ts`, `src/core/serializer.ts`, `src/webview/wysiwyg/properties.ts:104`
- Test: `src/core/roundtrip.spec.ts`

**Interfaces:**
- Consumes: `SHAPES`, `lookupShape` from Task 2; `warn` from Task 7.
- Produces: `DiagramNode.syntax`, `DiagramNode.attrs`, `DiagramNode.rawShape`; `setNodeShape(node, shape)` in `model.ts`.

- [ ] **Step 1: Write the failing test**

Append to `src/core/roundtrip.spec.ts`:

```ts
import { modelToMermaid } from './serializer';
import { setNodeShape } from './model';

const rt = (src: string) => modelToMermaid(mermaidToModel(src).model);

describe('serialization fidelity', () => {
  it('keeps a bracket-authored node in bracket form', () => {
    expect(rt('flowchart TD\n  A[Process]\n')).toContain('A["Process"]');
  });

  it('keeps an attr-authored node in attr form', () => {
    const out = rt('flowchart TD\n  A@{ shape: rect, label: "Process" }\n');
    expect(out).toContain('A@{ shape: rect, label: "Process" }');
    expect(out).not.toContain('A["Process"]');
  });

  it('preserves @{} keys ceasg does not model', () => {
    const out = rt('flowchart TD\n  A@{ shape: rect, label: "P", pos: "t", constraint: "on" }\n');
    expect(out).toContain('pos: "t"');
    expect(out).toContain('constraint: "on"');
  });

  it('preserves an unrecognised shape name verbatim', () => {
    const out = rt('flowchart TD\n  A@{ shape: not-a-shape, label: "P" }\n');
    expect(out).toContain('shape: not-a-shape');
  });

  it('draws an unrecognised shape as a rect', () => {
    expect(mermaidToModel('flowchart TD\n  A@{ shape: not-a-shape }\n').model.nodes[0]?.shape)
      .toBe('rect');
  });

  it('promotes a bracket node to attr form when the new shape has no bracket', () => {
    const model = mermaidToModel('flowchart TD\n  A[Process]\n').model;
    setNodeShape(model.nodes[0]!, 'fake-bracketless');
    // A registered bracketless shape arrives in Task 11; until then assert the
    // rule directly on the syntax field.
    expect(model.nodes[0]!.syntax).toBe('bracket');
  });

  it('never demotes an attr node back to bracket form', () => {
    const model = mermaidToModel('flowchart TD\n  A@{ shape: diam, label: "D" }\n').model;
    setNodeShape(model.nodes[0]!, 'rect');
    expect(modelToMermaid(model)).toContain('A@{ shape: rect');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/roundtrip.spec.ts`
Expected: FAIL — `setNodeShape` is not exported and attr-authored nodes serialize as brackets.

- [ ] **Step 3: Extend `DiagramNode` in `src/core/model.ts`**

Add to the interface, after `link?: string;`:

```ts
	/** Which syntax the author wrote this node in. Undefined means the editor
	 *  created it, which serializes to bracket form when the shape has one. */
	syntax?: "bracket" | "attr";
	/** `@{}` keys other than shape and label, preserved verbatim for round-trip. */
	attrs?: Record<string, string>;
	/** A shape name ceasg does not recognise. Drawn as a rect, written back
	 *  unchanged so a future Mermaid shape survives an edit here. */
	rawShape?: string;
```

- [ ] **Step 4: Add `setNodeShape` to `src/core/model.ts`**

```ts
/**
 * Change a node's shape, recording the syntax promotion that implies.
 *
 * A shape with no bracket form can only be written as `@{…}`, so switching to
 * one pins the node to the attribute form permanently. Switching back does not
 * demote it: auto-demotion would rewrite a line the author may have written by
 * hand, and the round trip would no longer be stable.
 */
export function setNodeShape(node: DiagramNode, shape: NodeShape): void {
	node.shape = shape;
	// A recognised shape supersedes any preserved unknown name.
	node.rawShape = undefined;
	if (!SHAPES[shape]?.bracket) {
		node.syntax = "attr";
	}
}
```

Add `SHAPES` to the existing `./shapes` import.

- [ ] **Step 5: Carry the new fields through `duplicateNode`**

In the `model.nodes.push({...})` call inside `duplicateNode`, add after `shape: src.shape,`:

```ts
		syntax: src.syntax,
		attrs: src.attrs ? { ...src.attrs } : undefined,
		rawShape: src.rawShape,
```

Update the doc comment above it from "Copy a node (label + shape)" to "Copy a node (label, shape and syntax form)".

- [ ] **Step 6: Record the syntax form in `src/core/parser.ts`**

Extend `ParsedToken`:

```ts
interface ParsedToken {
	id: string;
	shape?: NodeShape;
	label?: string;
	classes?: string[];
	syntax?: "bracket" | "attr";
	attrs?: Record<string, string>;
	rawShape?: string;
}
```

In the bracket pattern loop, change the return to record the form:

```ts
	for (const { re, shape } of patterns) {
		const m = token.match(re);
		if (m && m[1] !== undefined && m[2] !== undefined) {
			return { id: m[1], shape, label: stripQuotes(m[2]), syntax: "bracket" };
		}
	}
```

Replace the `@{}` branch body with:

```ts
	const v11 = token.match(/^([A-Za-z0-9_]+)@\{(.*)\}$/);
	if (v11 && v11[1] !== undefined && v11[2] !== undefined) {
		const props = parseV11Props(v11[2]);
		const shapeName = props.get("shape");
		const label = props.get("label");
		const result: ParsedToken = { id: v11[1], syntax: "attr" };
		if (shapeName !== undefined) {
			const def = lookupShape(shapeName);
			if (def) {
				result.shape = def.name;
			} else {
				// Draw it as a rect but keep the name so serialization is lossless.
				result.shape = "rect";
				result.rawShape = shapeName;
				warn(
					"unknown-shape",
					shapeName,
					`Unknown Mermaid shape "${shapeName}" on node "${v11[1]}"; drawn as a rectangle.`,
					"The original name is preserved when the diagram is written back.",
				);
			}
		}
		if (label !== undefined) result.label = label;
		// Everything except shape and label is passed through untouched.
		const attrs: Record<string, string> = {};
		for (const [k, v] of props) {
			if (k !== "shape" && k !== "label") attrs[k] = v;
		}
		if (Object.keys(attrs).length > 0) result.attrs = attrs;
		return result;
	}
```

Add `import { warn } from "./diagnostics";`.

- [ ] **Step 7: Carry the fields onto the node in `src/core/parser.ts`**

At the node construction (around line 394), add after `shape: token.shape ?? "rect",`:

```ts
				syntax: token.syntax,
				attrs: token.attrs,
				rawShape: token.rawShape,
```

And at the later-declaration-wins branch (around line 403), after `if (token.shape) node.shape = token.shape;`:

```ts
			if (token.syntax) node.syntax = token.syntax;
			if (token.attrs) node.attrs = token.attrs;
			if (token.rawShape) node.rawShape = token.rawShape;
```

- [ ] **Step 8: Add the attribute form to `src/core/serializer.ts`**

```ts
function nodeDeclaration(node: DiagramNode): string {
	const label = quoteLabel(node.label);
	const id = sanitizeId(node.id);
	const def = SHAPES[node.shape];
	if (node.syntax !== "attr" && def?.bracket) {
		return def.bracket(id, label);
	}
	return attrForm(id, label, node);
}

/**
 * Mermaid v11 attribute syntax. Key order is fixed — shape, label, then the
 * preserved keys in parse order — so re-serializing an untouched node produces
 * no diff. Values are always quoted, which Mermaid accepts and which keeps
 * values containing spaces or commas from splitting the property list.
 */
function attrForm(id: string, label: string, node: DiagramNode): string {
	const shape = node.rawShape ?? SHAPES[node.shape]?.name ?? "rect";
	const parts = [`shape: ${shape}`, `label: ${label}`];
	for (const [k, v] of Object.entries(node.attrs ?? {})) {
		parts.push(`${k}: "${v.replace(/"/g, "&quot;")}"`);
	}
	return `${id}@{ ${parts.join(", ")} }`;
}
```

- [ ] **Step 9: Use `setNodeShape` from the properties panel**

In `src/webview/wysiwyg/properties.ts:104`, replace the shape change handler:

```ts
    shape.addEventListener('change', () => this.editor.mutate((m) => {
      const target = m.nodes.find((n) => n.id === id);
      if (target) { setNodeShape(target, shape.value as NodeShape); }
    }, { commit: true }));
```

Add `setNodeShape` to the existing `../../core` import.

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm test:unit`
Expected: PASS. If a pre-existing round-trip spec now fails because it asserted bracket output for an `@{}`-authored input, that spec was asserting the old lossy behaviour — update it to expect the preserved form and note the change in the commit body.

- [ ] **Step 11: Type check and lint**

Run: `pnpm check-types && pnpm lint`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add src/core/model.ts src/core/parser.ts src/core/serializer.ts \
  src/core/roundtrip.spec.ts src/webview/wysiwyg/properties.ts
git commit -m "feat(shapes): preserve node syntax form, unknown attrs and shape names"
```

---
