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

- [ ] **Step 6: Warn on a registry lookup miss**

`createShapeElements` in `src/core/shapes/index.ts` already falls back to `rect`, but does so silently. Make the fallback report itself:

```ts
export function createShapeElements(
  shape: ShapeName, cx: number, cy: number, w: number, h: number,
): SVGElement[] {
  let def = SHAPES[shape];
  if (!def) {
    // Unreachable once NodeShape is registry-derived; a typed hole today is a
    // blank diagram tomorrow, so degrade loudly rather than silently.
    warn('shape-lookup-miss', String(shape),
      `No shape registered as "${shape}"; drawn as a rectangle.`);
    def = SHAPES['rect']!;
  }
  return def.render(geom(cx, cy, w, h));
}
```

Add `import { warn } from '../diagnostics';`.

- [ ] **Step 7: Report alias collisions once, on demand**

`ALIAS_INDEX` is built at module load, which happens before `activate()` installs the output-channel sink — a warning raised there would only ever reach the console. So detection is exposed as a function the host calls after wiring. Add to `src/core/shapes/registry.ts`:

```ts
/**
 * Report aliases claimed by more than one shape. First registration wins in
 * ALIAS_INDEX, so a collision silently makes resolution order-dependent.
 *
 * Called by the extension host after the output-channel sink is installed;
 * building ALIAS_INDEX at module load happens too early to warn usefully.
 * registry.spec.ts asserts there are none, so this firing in production means
 * a shape was added without running the suite.
 */
export function reportAliasCollisions(): void {
  const owner = new Map<string, string>();
  for (const def of ALL_SHAPES) {
    for (const alias of def.aliases) {
      const key = alias.toLowerCase();
      const prev = owner.get(key);
      if (prev && prev !== def.name) {
        warn('alias-collision', key,
          `Shape alias "${alias}" is claimed by both "${prev}" and "${def.name}".`,
          `"${prev}" wins; "${def.name}" is unreachable through this alias.`);
      } else {
        owner.set(key, def.name);
      }
    }
  }
}
```

Add `import { warn } from '../diagnostics';`.

- [ ] **Step 8: Export the seam from the core barrel**

Add to `src/core/index.ts`:

```ts
export * from './diagnostics';
```

- [ ] **Step 9: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/core/diagnostics.ts src/core/diagnostics.spec.ts src/core/layout.ts \
  src/core/index.ts src/core/shapes/index.ts src/core/shapes/registry.ts
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
  // Now that the sink writes to the channel, surface any registry problem that
  // was invisible at module-load time.
  reportAliasCollisions();
  const panels = new PanelManager(context, channel);
```

Also clear a document's suppressions when it closes, so reopening reports afresh. Add to the existing `context.subscriptions.push(...)` call:

```ts
    vscode.workspace.onDidCloseTextDocument((doc) => clearDiagnostics(doc.uri.toString())),
```

Add imports:

```ts
import { installDiagnosticChannel } from './extension/diagnosticChannel';
import { clearDiagnostics, reportAliasCollisions } from './core';
```

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
    setDiagnosticScope(documentUri.toString());
```

Use the **document** URI, not the session `key`. `key` is `${uri}#${blockId}`, and `activate`'s `onDidCloseTextDocument` handler clears by document URI — mismatched keys would leave suppressions that nothing ever clears.

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
      clearDiagnostics(documentUri.toString());
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

### Task 10: Registry-driven test suite

Written **before** the 34 new shapes so every later shape task is covered the moment its def is added. A new shape that renders off-box, sizes to `NaN`, collides on an alias, or fails to round-trip fails this suite automatically.

**Files:**
- Create: `src/core/shapes/geometryProbe.ts`, `src/core/shapes/shapes.spec.ts`
- Modify: `src/core/shapes/registry.spec.ts`
- Test: both spec files above

**Interfaces:**
- Consumes: `ALL_SHAPES`, `SHAPES`, `ALIAS_INDEX`, `SHAPE_GROUPS` from Task 2; `geom` from Task 1; `mermaidToModel`, `modelToMermaid`, `estimateNodeSize`.
- Produces: `probeBounds(elements: SVGElement[]): Bounds | null` in `geometryProbe.ts`, reused by Task 17's gallery.

**Why a probe rather than `getBBox`:** jsdom does not implement `SVGGraphicsElement.getBBox`, so bounds have to come from the attributes we set. The probe understands every element type the primitives emit.

- [ ] **Step 1: Write the failing test**

Create `src/core/shapes/shapes.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/shapes/shapes.spec.ts`
Expected: FAIL — `Failed to resolve import "./geometryProbe"`.

- [ ] **Step 3: Write `geometryProbe.ts`**

```ts
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
```

- [ ] **Step 4: Add registry invariants**

Append to `src/core/shapes/registry.spec.ts`:

```ts
describe('registry invariants', () => {
  it('canonical names are unique', () => {
    const names = ALL_SHAPES.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('no alias is claimed by two shapes', () => {
    const owner = new Map<string, string>();
    const collisions: string[] = [];
    for (const def of ALL_SHAPES) {
      for (const alias of def.aliases) {
        const key = alias.toLowerCase();
        const prev = owner.get(key);
        if (prev && prev !== def.name) { collisions.push(`${alias}: ${prev} vs ${def.name}`); }
        owner.set(key, def.name);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('no alias shadows a different shape canonical name', () => {
    const canonical = new Set(ALL_SHAPES.map((d) => d.name.toLowerCase()));
    for (const def of ALL_SHAPES) {
      for (const alias of def.aliases) {
        if (canonical.has(alias.toLowerCase())) {
          expect(alias.toLowerCase(), `alias "${alias}" of ${def.name}`).toBe(def.name.toLowerCase());
        }
      }
    }
  });

  it('every shape belongs to exactly one declared group', () => {
    const ids = new Set(SHAPE_GROUPS.map((g) => g.id));
    for (const def of ALL_SHAPES) { expect(ids.has(def.group), def.name).toBe(true); }
  });

  it('no group is empty', () => {
    for (const g of SHAPE_GROUPS) { expect(g.shapes.length, g.id).toBeGreaterThan(0); }
  });

  it('every shape that had a bracket form before still has one', () => {
    for (const name of ['rect', 'rounded', 'stadium', 'fr-rect', 'cyl', 'circle',
      'dbl-circ', 'diam', 'hex', 'lean-r', 'lean-l', 'trap-b', 'trap-t', 'odd']) {
      expect(SHAPES[name]?.bracket, `${name} lost its bracket form`).toBeDefined();
    }
  });
});
```

The empty-group assertion will fail until Task 14 fills `documents`, `flow`, and `annotations`. Mark it `it.skip` now with the comment `// unskip in Task 14, once every group has members` and unskip it there.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit src/core/shapes/`
Expected: PASS — 14 shapes × 6 cases, plus the registry invariants.

- [ ] **Step 6: Commit**

```bash
git add src/core/shapes/geometryProbe.ts src/core/shapes/shapes.spec.ts src/core/shapes/registry.spec.ts
git commit -m "test(shapes): add registry-driven suite and invariants"
```

---

### Task 11: Shapes drawn from rect, line and circle (10)

`lin-rect`, `div-rect`, `win-pane`, `lin-cyl`, `fork`, `sm-circ`, `f-circ`, `fr-circ`, `cross-circ`, `text`.

**Files:**
- Modify: `src/core/shapes/process.ts`, `data.ts`, `flow.ts`, `basic.ts`
- Test: covered automatically by Task 10's suite; add targeted cases to `shapes.spec.ts`

**Interfaces:**
- Consumes: `rect`, `circle`, `ellipse`, `vline`, `hline`, `solid`, `unfilled` from Task 1.
- Produces: 10 new `ShapeDef` entries.

- [ ] **Step 1: Write the failing test**

Append to `src/core/shapes/shapes.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/shapes/shapes.spec.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'render')` for every new name.

- [ ] **Step 3: Add the `basic` entry**

Append to `BASIC_SHAPES` in `src/core/shapes/basic.ts`:

```ts
  {
    name: 'text',
    label: 'Text block',
    group: 'basic',
    aliases: ['text-block'],
    // No border: the renderer draws only the label. probeBounds returns null
    // for this shape, which the suite accepts for an empty element list.
    render: () => [],
  },
```

- [ ] **Step 4: Add the `process` entries**

Append to `PROCESS_SHAPES` in `src/core/shapes/process.ts`, and add `hline` to the imports:

```ts
  {
    name: 'lin-rect',
    label: 'Lined process',
    group: 'process',
    aliases: ['lin-proc', 'lined-process', 'lined-rectangle', 'shaded-process'],
    size: (b) => ({ w: b.w + 12, h: b.h }),
    render: (g) => [
      rect(g.left, g.top, g.w, g.h, 0),
      vline(g.left + 10, g.top, g.bottom),
    ],
  },
  {
    name: 'div-rect',
    label: 'Divided process',
    group: 'process',
    aliases: ['div-proc', 'divided-process', 'divided-rectangle'],
    size: (b) => ({ w: b.w, h: b.h + 12 }),
    render: (g) => [
      rect(g.left, g.top, g.w, g.h, 0),
      hline(g.top + Math.min(g.h * 0.28, 16), g.left, g.right),
    ],
  },
```

- [ ] **Step 5: Add the `data` entries**

Append to `DATA_SHAPES` in `src/core/shapes/data.ts`, adding `vline`, `hline` to the imports:

```ts
  {
    name: 'lin-cyl',
    label: 'Disk storage',
    group: 'data',
    aliases: ['disk', 'lined-cylinder'],
    size: (b) => ({ w: b.w, h: b.h + 26 }),
    render: (g) => {
      const ry = Math.min(g.hh * 0.5, 9);
      return [
        rect(g.left, g.top + ry, g.w, g.h - 2 * ry, 0),
        ellipse(g.cx, g.top + ry, g.hw, ry),
        // The second rim is what distinguishes disk storage from a plain cylinder.
        ellipse(g.cx, g.top + ry * 3, g.hw, ry),
      ];
    },
  },
  {
    name: 'win-pane',
    label: 'Internal storage',
    group: 'data',
    aliases: ['internal-storage', 'window-pane'],
    size: (b) => ({ w: b.w + 16, h: b.h + 12 }),
    render: (g) => [
      rect(g.left, g.top, g.w, g.h, 0),
      vline(g.left + Math.min(g.w * 0.22, 22), g.top, g.bottom),
      hline(g.top + Math.min(g.h * 0.28, 16), g.left, g.right),
    ],
  },
```

- [ ] **Step 6: Add the `flow` entries**

Replace the empty `FLOW_SHAPES` array in `src/core/shapes/flow.ts`:

```ts
import { circle, line, rect, solid, unfilled } from './primitives';
import type { ShapeDef } from './types';

/** Junction and start markers are fixed-size markers, not label containers. */
const MARKER_D = 20;
const markerSize = () => ({ w: MARKER_D, h: MARKER_D });

export const FLOW_SHAPES: ShapeDef[] = [
  {
    name: 'fork',
    label: 'Fork / join',
    group: 'flow',
    aliases: ['join'],
    // A fork bar spans the flow but carries no label, so height is fixed.
    size: (b) => ({ w: b.w, h: 10 }),
    render: (g) => [solid(rect(g.left, g.cy - 5, g.w, 10, 2))],
  },
  {
    name: 'sm-circ',
    label: 'Small start',
    group: 'flow',
    aliases: ['small-circle', 'start'],
    size: markerSize,
    render: (g) => [circle(g.cx, g.cy, Math.min(g.hw, g.hh))],
  },
  {
    name: 'f-circ',
    label: 'Junction',
    group: 'flow',
    aliases: ['filled-circle', 'junction'],
    size: markerSize,
    render: (g) => [solid(circle(g.cx, g.cy, Math.min(g.hw, g.hh)))],
  },
  {
    name: 'fr-circ',
    label: 'Framed circle (stop)',
    group: 'flow',
    aliases: ['framed-circle'],
    size: (b) => { const d = Math.max(b.w, 66); return { w: d, h: d }; },
    render: (g) => {
      const r = Math.min(g.hw, g.hh);
      return [circle(g.cx, g.cy, r), solid(circle(g.cx, g.cy, Math.max(r * 0.55, 2)))];
    },
  },
  {
    name: 'cross-circ',
    label: 'Summary',
    group: 'flow',
    aliases: ['crossed-circle', 'summary'],
    size: (b) => { const d = Math.max(b.w, 66); return { w: d, h: d }; },
    render: (g) => {
      const r = Math.min(g.hw, g.hh);
      // The cross is inscribed, so its arms meet the rim rather than overshoot.
      const a = r / Math.SQRT2;
      return [
        circle(g.cx, g.cy, r),
        unfilled(line(g.cx - a, g.cy - a, g.cx + a, g.cy + a)),
        unfilled(line(g.cx + a, g.cy - a, g.cx - a, g.cy + a)),
      ];
    },
  },
];
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test:unit src/core/shapes/`
Expected: PASS. The parameterised suite now covers 24 shapes.

- [ ] **Step 8: Style the solid marker**

`solid()` sets `data-ceasg-solid="true"`. Add to `media/diagram.css`, next to the existing `.ceasg-shape` rule:

```css
/* Fork bars and junction dots render filled in the stroke colour, not the
   node fill, so they read as markers rather than as containers. */
.ceasg-shape[data-ceasg-solid='true'] {
  fill: var(--ceasg-node-stroke, currentColor);
}
```

- [ ] **Step 9: Run the full unit suite, type check and lint**

Run: `pnpm test:unit && pnpm check-types && pnpm lint`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/core/shapes/ media/diagram.css
git commit -m "feat(shapes): add the 10 rect/line/circle shapes"
```

---

### Task 12: Polygon shapes (9)

`tri`, `flip-tri`, `notch-rect`, `notch-pent`, `sl-rect`, `bow-rect`, `hourglass`, `bolt`, `bang`.

**Files:**
- Create: `src/core/shapes/sizing.ts`
- Modify: `src/core/shapes/basic.ts` (use the shared grow helper), `process.ts`, `data.ts`, `flow.ts`, `annotations.ts`
- Test: `src/core/shapes/shapes.spec.ts`, `src/core/shapes/sizing.spec.ts`

**Interfaces:**
- Consumes: `polygon` from Task 1; `SizingCtx` from Task 1.
- Produces: `fitGrow(base, ctx, fit)` in `sizing.ts`; 9 new `ShapeDef` entries.

**Shared helper:** a triangle pinches toward its apex exactly as a rhombus does, so the growth rule already written inline for `diam` becomes `fitGrow` and both use it. Extracting it is required here, not optional — duplicating that formula is how the two drift apart.

- [ ] **Step 1: Write the failing test**

Create `src/core/shapes/sizing.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fitGrow } from './sizing';

const ctx = (widest: number, lineCount = 1, fontSize = 16) =>
  ({ widest, lineCount, fontSize });

describe('fitGrow', () => {
  it('leaves a box alone when the label already fits', () => {
    expect(fitGrow({ w: 200, h: 120 }, ctx(20), 0.7)).toEqual({ w: 200, h: 120 });
  });

  it('grows both axes uniformly when the label is too wide', () => {
    const out = fitGrow({ w: 100, h: 72 }, ctx(90), 0.7);
    expect(out.w).toBeGreaterThan(100);
    expect(out.h).toBeGreaterThan(72);
    // Aspect is preserved, so the shape does not distort as it grows.
    expect(out.w / out.h).toBeCloseTo(100 / 72, 1);
  });

  it('grows for multi-line labels too', () => {
    expect(fitGrow({ w: 100, h: 72 }, ctx(20, 4), 0.7).h).toBeGreaterThan(72);
  });
});
```

Append to `src/core/shapes/shapes.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit src/core/shapes/`
Expected: FAIL — `Failed to resolve import "./sizing"`, and the new shape names are undefined.

- [ ] **Step 3: Write `sizing.ts`**

```ts
/*
 * Shared sizing rules. Kept apart from primitives.ts, which only builds SVG.
 */

import type { SizingCtx } from './types';

/**
 * Grow a box until its label fits inside a shape that pinches toward a point.
 *
 * A rhombus or triangle contains a tw x th label only where tw/w + th/h <= 1,
 * so fixed padding gets relatively tighter as the label grows and long or
 * multi-line labels overflow outright. Both axes grow uniformly, preserving the
 * shape's aspect. `fit` is how much of that budget the label may occupy: 0.7
 * leaves a 30% margin.
 */
export function fitGrow(
  base: { w: number; h: number },
  ctx: Pick<SizingCtx, 'widest' | 'fontSize' | 'lineCount'>,
  fit: number,
): { w: number; h: number } {
  const grow = (ctx.widest / base.w + (ctx.fontSize * ctx.lineCount) / base.h) / fit;
  if (grow <= 1) { return base; }
  return { w: Math.ceil(base.w * grow), h: Math.ceil(base.h * grow) };
}
```

- [ ] **Step 4: Refactor `diamondSize` in `basic.ts` onto the helper**

Replace the `DIAMOND_FIT` constant and `diamondSize` function with:

```ts
/** Leaves a 30% margin inside the rhombus; calibrated so ordinary diamonds
 *  keep the size they had before the registry refactor. */
const DIAMOND_FIT = 0.7;

function diamondSize(
	b: { w: number; h: number },
	ctx: { widest: number; fontSize: number; lineCount: number },
): { w: number; h: number } {
	return fitGrow(
		{ w: Math.max(b.w + 28, 100), h: Math.max(72, b.h + 28) },
		ctx,
		DIAMOND_FIT,
	);
}
```

Add `import { fitGrow } from './sizing';`.

- [ ] **Step 5: Verify diamond sizing is unchanged**

Run: `pnpm test:unit src/core/nodeGeometry.spec.ts`
Expected: PASS — the pre-existing diamond assertions must be untouched. If any fails, the refactor changed behaviour; fix `fitGrow` rather than the assertion.

- [ ] **Step 6: Add the `process` entry**

Append to `PROCESS_SHAPES`, adding `polygon` to the imports:

```ts
  {
    name: 'sl-rect',
    label: 'Manual input',
    group: 'process',
    aliases: ['manual-input', 'sloped-rectangle'],
    size: (b) => ({ w: b.w, h: b.h + 14 }),
    render: (g) => {
      const s = Math.min(g.h * 0.3, 14);
      return [polygon([
        [g.left, g.top + s], [g.right, g.top], [g.right, g.bottom], [g.left, g.bottom],
      ])];
    },
  },
```

- [ ] **Step 7: Add the `data` entries**

Append to `DATA_SHAPES`:

```ts
  {
    name: 'notch-rect',
    label: 'Card',
    group: 'data',
    aliases: ['card', 'notched-rectangle'],
    size: (b) => ({ w: b.w + 16, h: b.h }),
    render: (g) => {
      const n = Math.min(g.w * 0.15, 16);
      return [polygon([
        [g.left + n, g.top], [g.right, g.top], [g.right, g.bottom],
        [g.left, g.bottom], [g.left, g.top + n],
      ])];
    },
  },
  {
    name: 'bow-rect',
    label: 'Stored data',
    group: 'data',
    aliases: ['bow-tie-rectangle', 'stored-data'],
    size: (b) => ({ w: b.w + 30, h: b.h }),
    render: (g) => {
      // Both vertical edges pinch inward; that pinch is the whole symbol.
      const n = Math.min(g.w * 0.12, 16);
      return [polygon([
        [g.left, g.top], [g.right, g.top], [g.right - n, g.cy],
        [g.right, g.bottom], [g.left, g.bottom], [g.left + n, g.cy],
      ])];
    },
  },
```

- [ ] **Step 8: Add the `flow` entries**

Append to `FLOW_SHAPES`, adding `polygon` and `fitGrow` to the imports:

```ts
  {
    name: 'tri',
    label: 'Extract',
    group: 'flow',
    aliases: ['extract', 'triangle'],
    // A triangle pinches toward its apex exactly as a rhombus does.
    size: (b, ctx) => fitGrow({ w: Math.max(b.w + 28, 100), h: Math.max(72, b.h + 28) }, ctx, 0.55),
    render: (g) => [polygon([[g.cx, g.top], [g.right, g.bottom], [g.left, g.bottom]])],
  },
  {
    name: 'flip-tri',
    label: 'Manual file',
    group: 'flow',
    aliases: ['flipped-triangle', 'manual-file'],
    size: (b, ctx) => fitGrow({ w: Math.max(b.w + 28, 100), h: Math.max(72, b.h + 28) }, ctx, 0.55),
    render: (g) => [polygon([[g.left, g.top], [g.right, g.top], [g.cx, g.bottom]])],
  },
  {
    name: 'notch-pent',
    label: 'Loop limit',
    group: 'flow',
    aliases: ['loop-limit', 'notched-pentagon'],
    size: (b) => ({ w: b.w + 16, h: b.h + 8 }),
    render: (g) => {
      const n = Math.min(g.w * 0.12, 16);
      return [polygon([
        [g.left + n, g.top], [g.right - n, g.top], [g.right, g.top + n],
        [g.right, g.bottom], [g.left, g.bottom], [g.left, g.top + n],
      ])];
    },
  },
  {
    name: 'hourglass',
    label: 'Collate',
    group: 'flow',
    aliases: ['collate'],
    // A collate marker carries no label, so it keeps a fixed square footprint.
    size: () => ({ w: 48, h: 48 }),
    render: (g) => [
      polygon([[g.left, g.top], [g.right, g.top], [g.cx, g.cy]]),
      polygon([[g.left, g.bottom], [g.right, g.bottom], [g.cx, g.cy]]),
    ],
  },
  {
    name: 'bolt',
    label: 'Communication link',
    group: 'flow',
    aliases: ['com-link', 'lightning-bolt'],
    size: () => ({ w: 48, h: 48 }),
    // Normalised outline mapped onto the box, so it can never leave it.
    render: (g) => [polygon(BOLT_OUTLINE.map(([u, v]) => [g.left + u * g.w, g.top + v * g.h]))],
  },
];

/** Unit-square lightning bolt, drawn clockwise from the top-right stroke. */
const BOLT_OUTLINE: Array<[number, number]> = [
  [0.85, 0.00], [0.15, 0.55], [0.45, 0.55],
  [0.35, 1.00], [0.85, 0.40], [0.55, 0.40], [0.85, 0.00],
];
```

Note the array literal now closes before `BOLT_OUTLINE`; keep the existing `];` in place and append the constant after it.

- [ ] **Step 9: Add the `annotations` entry**

Replace the empty `ANNOTATION_SHAPES` array in `src/core/shapes/annotations.ts`:

```ts
import { polygon } from './primitives';
import type { ShapeDef } from './types';

/** Spike count for the bang starburst. Even, so spikes alternate in and out. */
const BANG_SPIKES = 12;

export const ANNOTATION_SHAPES: ShapeDef[] = [
  {
    name: 'bang',
    label: 'Bang',
    group: 'annotations',
    aliases: ['explosion'],
    size: (b) => ({ w: b.w + 40, h: b.h + 30 }),
    render: (g) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < BANG_SPIKES; i++) {
        // Outer radius reaches the box edge exactly; inner pulls back to 0.32.
        const r = i % 2 === 0 ? 0.5 : 0.32;
        const angle = (i * 2 * Math.PI) / BANG_SPIKES;
        pts.push([g.cx + r * g.w * Math.cos(angle), g.cy + r * g.h * Math.sin(angle)]);
      }
      return [polygon(pts)];
    },
  },
];
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm test:unit src/core/shapes/`
Expected: PASS. The parameterised suite now covers 33 shapes.

- [ ] **Step 11: Run the full unit suite, type check and lint**

Run: `pnpm test:unit && pnpm check-types && pnpm lint`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add src/core/shapes/
git commit -m "feat(shapes): add the 9 polygon shapes"
```

---

### Task 13: Curve shapes (12)

`doc`, `lin-doc`, `tag-doc`, `tag-rect`, `delay`, `curv-trap`, `h-cyl`, `datastore`, `flag`, `brace`, `brace-r`, `braces`.

**Files:**
- Modify: `src/core/shapes/primitives.ts` (add `wavyBottom`, `braceD`), `process.ts`, `data.ts`, `documents.ts`, `annotations.ts`
- Test: `src/core/shapes/shapes.spec.ts`, `src/core/shapes/primitives.spec.ts`

**Interfaces:**
- Consumes: `path`, `rect`, `vline`, `polygon` from Task 1.
- Produces: `wavyBottom(g, amp)` and `braceD(x, top, bottom, dir)` path fragments; 12 new `ShapeDef` entries.

**All paths must use absolute commands.** `geometryProbe.pathPoints` (Task 10) only parses absolute commands; a relative command would silently escape the bounds assertion.

- [ ] **Step 1: Write the failing test**

Append to `src/core/shapes/primitives.spec.ts`:

```ts
import { geom, wavyBottom, braceD } from './primitives';

describe('curve fragments', () => {
  it('wavyBottom returns absolute commands only', () => {
    const d = wavyBottom(geom(100, 50, 80, 44), 6);
    expect(d).not.toMatch(/[a-z]/);
  });

  it('wavyBottom stays within the box vertically', () => {
    const g = geom(100, 50, 80, 44);
    const ys = (wavyBottom(g, 6).match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
      .filter((_, i) => i % 2 === 1);
    for (const y of ys) { expect(y).toBeLessThanOrEqual(g.bottom + 0.001); }
  });

  it('braceD draws opposite curves for left and right', () => {
    expect(braceD(10, 0, 40, 'left')).not.toBe(braceD(10, 0, 40, 'right'));
  });
});
```

Append to `src/core/shapes/shapes.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit src/core/shapes/`
Expected: FAIL — `wavyBottom` is not exported and the 12 names are undefined.

- [ ] **Step 3: Add the curve fragments to `primitives.ts`**

```ts
/**
 * The wavy lower edge shared by every document shape, as absolute path
 * commands starting at the bottom-right corner and ending at bottom-left.
 * `amp` is the wave height; the curve never dips below `g.bottom`.
 */
export function wavyBottom(g: ShapeGeom, amp: number): string {
  const y = g.bottom - amp;
  const q = g.w / 4;
  return [
    `L${num(g.right)},${num(y)}`,
    `C${num(g.right - q)},${num(y - amp)} ${num(g.cx - q)},${num(y + amp)} ${num(g.left)},${num(y)}`,
  ].join(' ');
}

/**
 * A curly brace as absolute path commands, spanning `top`..`bottom` at `x`.
 * `dir` is which way the brace's cusp points.
 */
export function braceD(x: number, top: number, bottom: number, dir: 'left' | 'right'): string {
  const mid = (top + bottom) / 2;
  const reach = dir === 'left' ? 8 : -8;
  return [
    `M${num(x + reach)},${num(top)}`,
    `C${num(x)},${num(top)} ${num(x)},${num(mid)} ${num(x - reach / 2)},${num(mid)}`,
    `C${num(x)},${num(mid)} ${num(x)},${num(bottom)} ${num(x + reach)},${num(bottom)}`,
  ].join(' ');
}
```

`num` is already module-private in `primitives.ts`; reuse it rather than adding another.

- [ ] **Step 4: Add the `documents` entries**

Replace the empty `DOCUMENT_SHAPES` array in `src/core/shapes/documents.ts`:

```ts
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
```

`docs` (stacked document) arrives in Task 14, which is why this file has three entries rather than four.

- [ ] **Step 5: Add the `process` entry**

Append to `PROCESS_SHAPES`, importing `cornerTag` from `./documents`:

```ts
  {
    name: 'tag-rect',
    label: 'Tagged process',
    group: 'process',
    aliases: ['tag-proc', 'tagged-process', 'tagged-rectangle'],
    size: (b) => ({ w: b.w + 14, h: b.h }),
    render: (g) => [rect(g.left, g.top, g.w, g.h, 0), cornerTag(g)],
  },
```

- [ ] **Step 6: Add the `data` entries**

Append to `DATA_SHAPES`, adding `path` to the imports:

```ts
  {
    name: 'h-cyl',
    label: 'Direct access storage',
    group: 'data',
    aliases: ['das', 'horizontal-cylinder'],
    size: (b) => ({ w: b.w + 30, h: b.h }),
    render: (g) => {
      // A cylinder on its side: a rounded right cap and a matching left arc.
      const rx = Math.min(g.hw * 0.25, 14);
      return [path(
        `M${g.left + rx},${g.top} L${g.right - rx},${g.top}` +
        ` A${rx},${g.hh} 0 0 1 ${g.right - rx},${g.bottom}` +
        ` L${g.left + rx},${g.bottom}` +
        ` A${rx},${g.hh} 0 0 1 ${g.left + rx},${g.top} Z`,
      )];
    },
  },
  {
    name: 'datastore',
    label: 'Data store',
    group: 'data',
    aliases: ['data-store'],
    size: (b) => ({ w: b.w + 24, h: b.h }),
    render: (g) => {
      // An open-sided cylinder: square right edge, curved left edge.
      const rx = Math.min(g.hw * 0.2, 12);
      return [path(
        `M${g.right},${g.top} L${g.left + rx},${g.top}` +
        ` A${rx},${g.hh} 0 0 0 ${g.left + rx},${g.bottom}` +
        ` L${g.right},${g.bottom} Z`,
      )];
    },
  },
  {
    name: 'curv-trap',
    label: 'Display',
    group: 'data',
    aliases: ['curved-trapezoid', 'display'],
    size: (b) => ({ w: b.w + 34, h: b.h }),
    render: (g) => {
      const s = Math.min(g.hw * 0.3, 22);
      return [path(
        `M${g.left},${g.cy} L${g.left + s},${g.top} L${g.right - s},${g.top}` +
        ` A${s},${g.hh} 0 0 1 ${g.right - s},${g.bottom}` +
        ` L${g.left + s},${g.bottom} Z`,
      )];
    },
  },
  {
    name: 'flag',
    label: 'Paper tape',
    group: 'data',
    aliases: ['paper-tape'],
    size: (b) => ({ w: b.w, h: b.h + 20 }),
    render: (g) => {
      // Wavy top and bottom, mirrored, so the tape reads as continuous.
      const amp = 8;
      const q = g.w / 4;
      const ty = g.top + amp;
      const by = g.bottom - amp;
      return [path(
        `M${g.left},${ty}` +
        ` C${g.left + q},${ty - amp} ${g.cx + q},${ty + amp} ${g.right},${ty}` +
        ` L${g.right},${by}` +
        ` C${g.right - q},${by - amp} ${g.cx - q},${by + amp} ${g.left},${by} Z`,
      )];
    },
  },
```

- [ ] **Step 7: Add the `annotations` entries**

Append to `ANNOTATION_SHAPES`, adding `braceD`, `path`, `unfilled` to the imports:

```ts
  {
    name: 'brace',
    label: 'Comment (left brace)',
    group: 'annotations',
    aliases: ['brace-l', 'comment'],
    size: (b) => ({ w: b.w + 14, h: b.h }),
    render: (g) => [unfilled(path(braceD(g.left + 10, g.top, g.bottom, 'left')))],
  },
  {
    name: 'brace-r',
    label: 'Comment (right brace)',
    group: 'annotations',
    aliases: ['comment-right'],
    size: (b) => ({ w: b.w + 14, h: b.h }),
    render: (g) => [unfilled(path(braceD(g.right - 10, g.top, g.bottom, 'right')))],
  },
  {
    name: 'braces',
    label: 'Comment (both braces)',
    group: 'annotations',
    aliases: ['comment-both'],
    size: (b) => ({ w: b.w + 28, h: b.h }),
    render: (g) => [
      unfilled(path(braceD(g.left + 10, g.top, g.bottom, 'left'))),
      unfilled(path(braceD(g.right - 10, g.top, g.bottom, 'right'))),
    ],
  },
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test:unit src/core/shapes/`
Expected: PASS. The parameterised suite now covers 45 shapes. If a bounds assertion fails, the shape is drawn outside its box — fix the geometry, not the margin.

- [ ] **Step 9: Run the full unit suite, type check and lint**

Run: `pnpm test:unit && pnpm check-types && pnpm lint`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/core/shapes/
git commit -m "feat(shapes): add the 12 curve shapes"
```

---

### Task 14: Stacked shapes (3)

`st-rect`, `docs`, `cloud`. Completes the 48.

**Files:**
- Modify: `src/core/shapes/process.ts`, `documents.ts`, `annotations.ts`, `registry.spec.ts`
- Test: `src/core/shapes/shapes.spec.ts`

**Interfaces:**
- Consumes: `docBody`, `DOC_WAVE` from Task 13; `rect`, `path` from Task 1.
- Produces: the final 3 `ShapeDef` entries; all six groups become non-empty.

**Offset copies must stay inside the box.** A stacked shape draws its body inset by the stack depth and its copies toward the original edges, rather than drawing at full size and offsetting outward — the latter would fail Task 10's bounds assertion, correctly.

- [ ] **Step 1: Write the failing test**

Append to `src/core/shapes/shapes.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit src/core/shapes/shapes.spec.ts`
Expected: FAIL — the three names are undefined and the count is 45.

- [ ] **Step 3: Add `st-rect` to `process.ts`**

```ts
  {
    name: 'st-rect',
    label: 'Multi-process',
    group: 'process',
    aliases: ['processes', 'procs', 'stacked-rectangle'],
    size: (b) => ({ w: b.w + STACK_DEPTH * 2, h: b.h + STACK_DEPTH * 2 }),
    render: (g) => {
      // Drawn back-to-front. The body is inset by the full stack depth so the
      // copies fill the space toward the box edges rather than escaping it.
      const d = STACK_DEPTH;
      const w = g.w - d * 2;
      const h = g.h - d * 2;
      return [
        rect(g.left + d * 2, g.top, w, h, 0),
        rect(g.left + d, g.top + d, w, h, 0),
        rect(g.left, g.top + d * 2, w, h, 0),
      ];
    },
  },
```

Add near the top of `process.ts`:

```ts
/** Offset between copies in a stacked shape. */
export const STACK_DEPTH = 5;
```

- [ ] **Step 4: Add `docs` to `documents.ts`**

```ts
  {
    name: 'docs',
    label: 'Multi-document',
    group: 'documents',
    aliases: ['documents', 'st-doc', 'stacked-document'],
    size: (b) => ({ w: b.w + STACK_DEPTH * 2, h: b.h + DOC_WAVE + 6 + STACK_DEPTH * 2 }),
    render: (g) => {
      const d = STACK_DEPTH;
      const inner = (dx: number, dy: number): ShapeGeom => {
        const w = g.w - d * 2;
        const h = g.h - d * 2;
        const cx = g.left + dx + w / 2;
        const cy = g.top + dy + h / 2;
        return {
          cx, cy, w, h,
          left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2,
          hw: w / 2, hh: h / 2,
        };
      };
      return [
        path(docBody(inner(d * 2, 0))),
        path(docBody(inner(d, d))),
        path(docBody(inner(0, d * 2))),
      ];
    },
  },
```

Add `import { STACK_DEPTH } from './process';` to `documents.ts`.

- [ ] **Step 5: Add `cloud` to `annotations.ts`**

```ts
  {
    name: 'cloud',
    label: 'Cloud',
    group: 'annotations',
    aliases: ['cloud-shape'],
    size: (b) => ({ w: b.w + 46, h: b.h + 26 }),
    render: (g) => {
      // Five arcs around the box, each bulging out to the edge and no further.
      const rx = g.w / 6;
      const ry = g.h / 4;
      const y0 = g.top + ry;
      const y1 = g.bottom - ry;
      return [path(
        `M${g.left + rx},${y1}` +
        ` A${rx},${ry} 0 0 1 ${g.left + rx},${y0}` +
        ` A${rx},${ry} 0 0 1 ${g.cx},${g.top}` +
        ` A${rx},${ry} 0 0 1 ${g.right - rx},${y0}` +
        ` A${rx},${ry} 0 0 1 ${g.right - rx},${y1}` +
        ` A${rx},${ry} 0 0 1 ${g.cx},${g.bottom} Z`,
      )];
    },
  },
```

- [ ] **Step 6: Unskip the empty-group invariant**

In `src/core/shapes/registry.spec.ts`, remove the `.skip` from the `no group is empty` test and delete the `// unskip in Task 14` comment. Also update the count assertion in the first registry test from 14 to 48.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test:unit src/core/shapes/`
Expected: PASS — all 48 shapes through the parameterised suite, all invariants green.

- [ ] **Step 8: Run the full unit suite, type check and lint**

Run: `pnpm test:unit && pnpm check-types && pnpm lint`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/shapes/
git commit -m "feat(shapes): add the 3 stacked shapes, completing all 48"
```

---

### Task 15: Outline-based edge anchoring

Edges currently terminate on the bounding box for every shape (`edgePath.ts:6`). For a triangle or a cloud that leaves the arrowhead floating in whitespace.

**Files:**
- Create: `src/core/shapes/outline.ts`
- Modify: `src/webview/wysiwyg/edgePath.ts:6-15`, `flow.ts`, `data.ts`, `annotations.ts`
- Test: `src/core/shapes/outline.spec.ts`, `src/webview/wysiwyg/edgePath.spec.ts`

**Interfaces:**
- Consumes: `SHAPES` from Task 2; `geom` from Task 1.
- Produces: `rayPolygonHit(ox, oy, dx, dy, poly): {x, y} | null` in `outline.ts`; `outline` declared on 9 shape defs.

**Which shapes get an outline:** the nine whose filled region diverges sharply from their box — `tri`, `flip-tri`, `hourglass`, `bolt`, `flag`, `notch-pent`, `bang`, `curv-trap`, `cloud`. The three brace shapes are listed in the spec but are **open curves, not regions**; a closed outline for them would be meaningless, so they keep box anchoring. Everything else — including `diam` and `hex` — keeps box math, unchanged from what ships today.

**DRY:** for shapes whose render is already a polygon, `outline` becomes the source and `render` calls `polygon(outline(g))`. Do not write the point list twice.

- [ ] **Step 1: Write the failing test**

Create `src/core/shapes/outline.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rayPolygonHit } from './outline';

/** Unit square centred on the origin. */
const SQUARE: Array<[number, number]> = [[-10, -10], [10, -10], [10, 10], [-10, 10]];

describe('rayPolygonHit', () => {
  it('finds the crossing on a straight ray', () => {
    expect(rayPolygonHit(0, 0, 1, 0, SQUARE)).toEqual({ x: 10, y: 0 });
  });

  it('finds the crossing on a diagonal ray', () => {
    const hit = rayPolygonHit(0, 0, 1, 1, SQUARE)!;
    expect(hit.x).toBeCloseTo(10);
    expect(hit.y).toBeCloseTo(10);
  });

  it('respects direction, not just the line', () => {
    expect(rayPolygonHit(0, 0, -1, 0, SQUARE)).toEqual({ x: -10, y: 0 });
  });

  it('returns the far crossing for a triangle apex', () => {
    const tri: Array<[number, number]> = [[0, -10], [10, 10], [-10, 10]];
    const hit = rayPolygonHit(0, 0, 0, -1, tri)!;
    expect(hit.y).toBeCloseTo(-10);
  });

  it('returns null when the polygon is degenerate', () => {
    expect(rayPolygonHit(0, 0, 1, 0, [])).toBeNull();
    expect(rayPolygonHit(0, 0, 0, 0, SQUARE)).toBeNull();
  });
});
```

Append to `src/webview/wysiwyg/edgePath.spec.ts`:

```ts
import { SHAPES } from '../../core';

describe('nodeBorderPoint with an outline', () => {
  const model = (shape: string) => ({
    direction: 'TD', nodes: [{ id: 'A', label: 'x', shape, x: 0, y: 0, w: 100, h: 100 }],
    edges: [], groups: [], config: {}, classDefs: [], unknownLines: [],
  }) as never;

  it('anchors a triangle on its sloped edge, not its box corner', () => {
    const m = model('tri');
    const node = (m as { nodes: Array<Record<string, number>> }).nodes[0]!;
    const p = nodeBorderPoint(m, node as never, 100, -100);
    // The box corner is (50, -50); the triangle's edge is well inside it.
    expect(Math.abs(p.x)).toBeLessThan(50);
  });

  it('leaves box-anchored shapes exactly as before', () => {
    const m = model('rect');
    const node = (m as { nodes: Array<Record<string, number>> }).nodes[0]!;
    expect(nodeBorderPoint(m, node as never, 1000, 0)).toEqual({ x: 50, y: 0 });
  });

  it('declares outlines on exactly the nine divergent shapes', () => {
    const withOutline = Object.values(SHAPES).filter((d) => d.outline).map((d) => d.name).sort();
    expect(withOutline).toEqual(['bang', 'bolt', 'cloud', 'curv-trap', 'flag',
      'flip-tri', 'hourglass', 'notch-pent', 'tri']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit src/core/shapes/outline.spec.ts src/webview/wysiwyg/edgePath.spec.ts`
Expected: FAIL — `Failed to resolve import "./outline"`.

- [ ] **Step 3: Write `outline.ts`**

```ts
/*
 * Ray/outline intersection for edge anchoring. Shapes whose filled region
 * diverges sharply from their bounding box declare an outline so arrowheads
 * land on the drawn border rather than in whitespace beside it.
 */

import type { Pt } from './types';

/**
 * Where a ray from (ox, oy) in direction (dx, dy) leaves `poly`.
 *
 * Returns the farthest forward crossing, which is the border point for a
 * convex outline and the outer border for a concave one — the arrowhead should
 * stop at the shape's silhouette, not at an interior notch.
 * Returns null for a degenerate polygon or a zero-length direction.
 */
export function rayPolygonHit(
  ox: number, oy: number, dx: number, dy: number, poly: Pt[],
): { x: number; y: number } | null {
  if (poly.length < 3) { return null; }
  if (dx === 0 && dy === 0) { return null; }
  let best = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]!;
    const [bx, by] = poly[(i + 1) % poly.length]!;
    const ex = bx - ax;
    const ey = by - ay;
    // Solve origin + t*dir = a + u*edge for t >= 0 and u in [0, 1].
    const denom = dx * ey - dy * ex;
    if (denom === 0) { continue; }
    const t = ((ax - ox) * ey - (ay - oy) * ex) / denom;
    const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
    if (t >= 0 && u >= 0 && u <= 1 && t > best) { best = t; }
  }
  if (!Number.isFinite(best) || best < 0) { return null; }
  return { x: ox + dx * best, y: oy + dy * best };
}
```

- [ ] **Step 4: Declare outlines on the polygon shapes, rendering from them**

In `src/core/shapes/flow.ts`, restructure `tri`, `flip-tri`, `notch-pent`, `hourglass` and `bolt` so each point list is written once. Declare the outline as a module-local function above the array, then have both `outline` and `render` use it — a def cannot reference itself from inside its own literal:

```ts
const triOutline = (g: ShapeGeom): Pt[] =>
  [[g.cx, g.top], [g.right, g.bottom], [g.left, g.bottom]];

const flipTriOutline = (g: ShapeGeom): Pt[] =>
  [[g.left, g.top], [g.right, g.top], [g.cx, g.bottom]];

const notchPentOutline = (g: ShapeGeom): Pt[] => {
  const n = Math.min(g.w * 0.12, 16);
  return [
    [g.left + n, g.top], [g.right - n, g.top], [g.right, g.top + n],
    [g.right, g.bottom], [g.left, g.bottom], [g.left, g.top + n],
  ];
};

/** Both lobes as one closed outline, so a ray crossing either lobe hits it. */
const hourglassOutline = (g: ShapeGeom): Pt[] =>
  [[g.left, g.top], [g.right, g.top], [g.cx, g.cy],
   [g.right, g.bottom], [g.left, g.bottom], [g.cx, g.cy]];

const boltOutline = (g: ShapeGeom): Pt[] =>
  BOLT_OUTLINE.map(([u, v]) => [g.left + u * g.w, g.top + v * g.h]);
```

Then each def uses `outline: triOutline, render: (g) => [polygon(triOutline(g))]` and so on. `hourglass` keeps its two-polygon render (`render: (g) => [polygon([...top]), polygon([...bottom])]`) while declaring `outline: hourglassOutline` — the render is two triangles, the outline is their combined silhouette.

`Pt` and `ShapeGeom` must be added to the `./types` import in `flow.ts`, `data.ts` and `annotations.ts` wherever these helpers are declared.

- [ ] **Step 5: Declare outlines on the remaining four**

`bang` in `annotations.ts` — extract the starburst loop into `bangOutline(g)` and use it for both `outline` and `render`.

`cloud` in `annotations.ts` — the render is a path, so the outline is a separate polygon approximation:

```ts
    /** Twelve points around the lobes; anchoring needs no more precision. */
    outline: (g) => Array.from({ length: 12 }, (_, i) => {
      const angle = (i * 2 * Math.PI) / 12;
      return [g.cx + 0.5 * g.w * Math.cos(angle), g.cy + 0.5 * g.h * Math.sin(angle)] as Pt;
    }),
```

`curv-trap` in `data.ts`:

```ts
    outline: (g) => {
      const s = Math.min(g.hw * 0.3, 22);
      return [
        [g.left, g.cy], [g.left + s, g.top], [g.right - s, g.top],
        [g.right, g.cy], [g.right - s, g.bottom], [g.left + s, g.bottom],
      ];
    },
```

`flag` in `data.ts`:

```ts
    outline: (g) => {
      const amp = 8;
      return [
        [g.left, g.top + amp], [g.cx, g.top], [g.right, g.top + amp],
        [g.right, g.bottom - amp], [g.cx, g.bottom], [g.left, g.bottom - amp],
      ];
    },
```

- [ ] **Step 6: Use the outline in `edgePath.ts`**

Replace `nodeBorderPoint` (lines 6-15):

```ts
export function nodeBorderPoint(
  model: DiagramModel, node: DiagramNode, towardX: number, towardY: number,
): { x: number; y: number } {
  const { w, h } = nodeSize(model, node);
  const dx = towardX - node.x;
  const dy = towardY - node.y;
  if (dx === 0 && dy === 0) { return { x: node.x + w / 2, y: node.y }; }
  // Shapes whose filled region diverges sharply from their box declare an
  // outline; everything else keeps the box math this function has always used.
  const outline = SHAPES[node.shape]?.outline;
  if (outline) {
    const hit = rayPolygonHit(node.x, node.y, dx, dy, outline(geom(node.x, node.y, w, h)));
    if (hit) { return hit; }
  }
  const hw = w / 2;
  const hh = h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: node.x + dx * scale, y: node.y + dy * scale };
}
```

Add `import { SHAPES, geom, rayPolygonHit } from '../../core';` (add `export * from './shapes/outline';` to `src/core/shapes/index.ts` first).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test:unit`
Expected: PASS. The pre-existing `edgePath.spec.ts` cases must be untouched — box-anchored shapes have identical behaviour.

- [ ] **Step 8: Type check and lint**

Run: `pnpm check-types && pnpm lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/core/shapes/ src/webview/wysiwyg/edgePath.ts src/webview/wysiwyg/edgePath.spec.ts
git commit -m "feat(shapes): anchor edges to shape outlines where the box misleads"
```

---

### Task 16: Palette groups and grouped dropdown

**Files:**
- Modify: `src/webview/wysiwyg/paletteModel.ts:44-46`, `sidebar.ts`, `palette.ts`, `properties.ts:101-105`, `editor.ts:155`
- Modify: `media/webview.css`
- Test: `src/webview/wysiwyg/paletteModel.spec.ts`, `sidebar.spec.ts`

**Interfaces:**
- Consumes: `SHAPE_GROUPS` from Task 2.
- Produces: `PALETTE_GROUPS` with six entries; `ShapeSidebar(host, editor, api)`.

- [ ] **Step 1: Write the failing test**

Replace the `PALETTE_GROUPS` describe block in `src/webview/wysiwyg/paletteModel.spec.ts`:

```ts
describe('PALETTE_GROUPS', () => {
  it('mirrors the registry groups in palette order', () => {
    expect(PALETTE_GROUPS.map((g) => g.id))
      .toEqual(['basic', 'process', 'data', 'documents', 'flow', 'annotations']);
    expect(PALETTE_GROUPS.map((g) => g.title))
      .toEqual(['Basic', 'Process', 'Data & I/O', 'Documents', 'Flow Control', 'Annotations']);
  });

  it('covers every shape exactly once across all groups', () => {
    const items = PALETTE_GROUPS.flatMap((g) => g.items);
    expect(items).toHaveLength(NODE_SHAPES.length);
    expect(new Set(items.map((i) => i.id)).size).toBe(NODE_SHAPES.length);
  });
});
```

In `src/webview/wysiwyg/sidebar.spec.ts`, first update the existing `make()` helper, which constructs the sidebar with two arguments and will no longer compile:

```ts
function make() {
  const host = document.createElement('div');
  const addNodeAtFreeSpot = vi.fn();
  const editor = { addNodeAtFreeSpot } as unknown as WysiwygEditor;
  let state: unknown = undefined;
  const api = { postMessage() {}, getState: () => state, setState: (s: unknown) => { state = s; } };
  const sidebar = new ShapeSidebar(host, editor, api);
  return { host, sidebar, addNodeAtFreeSpot };
}
```

Any existing assertion in that file that counts palette items or assumes one group needs updating too — there are now six groups, and five of them start collapsed, so a test that queries visible buttons must account for that.

Then append:

```ts
describe('ShapeSidebar expansion state', () => {
  const fakeApi = () => {
    let state: unknown = undefined;
    return { postMessage() {}, getState: () => state, setState: (s: unknown) => { state = s; } };
  };

  it('opens Basic and collapses the rest by default', () => {
    const host = document.createElement('div');
    new ShapeSidebar(host, {} as never, fakeApi());
    const groups = Array.from(host.querySelectorAll('.ceasg-sidebar-group'));
    expect(groups).toHaveLength(6);
    expect(groups[0]!.classList.contains('is-collapsed')).toBe(false);
    for (const g of groups.slice(1)) {
      expect(g.classList.contains('is-collapsed')).toBe(true);
    }
  });

  it('persists a toggle through webview state', () => {
    const api = fakeApi();
    const first = document.createElement('div');
    new ShapeSidebar(first, {} as never, api);
    (first.querySelectorAll('.ceasg-sidebar-group-header')[2] as HTMLElement).click();

    const second = document.createElement('div');
    new ShapeSidebar(second, {} as never, api);
    const groups = Array.from(second.querySelectorAll('.ceasg-sidebar-group'));
    expect(groups[2]!.classList.contains('is-collapsed')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit src/webview/wysiwyg/`
Expected: FAIL — `PALETTE_GROUPS` has one entry and `ShapeSidebar` takes two arguments.

- [ ] **Step 3: Build `PALETTE_GROUPS` from the registry**

Replace `paletteModel.ts:44-46`:

```ts
/** Every palette group, in display order, mirroring the shape registry. Both
 *  the toolbar dropdown and the sidebar render from this. */
export const PALETTE_GROUPS: PaletteGroup[] = SHAPE_GROUPS.map((g) => ({
  id: g.id,
  title: g.title,
  items: g.shapes.map((s) => shapeItem(s.name)),
}));
```

Add `SHAPE_GROUPS` to the existing `../../core` import.

- [ ] **Step 4: Persist sidebar expansion state**

In `src/webview/wysiwyg/sidebar.ts`, add a third constructor parameter and default the collapsed set:

```ts
/** Groups collapsed on first open. Basic stays expanded; 48 shapes expanded at
 *  once is an unusable sidebar. */
const DEFAULT_COLLAPSED = ['process', 'data', 'documents', 'flow', 'annotations'];

interface SidebarState { collapsedGroups?: string[] }

export class ShapeSidebar {
  private open = true;
  private collapsed: Set<string>;

  constructor(
    private readonly host: HTMLElement,
    private readonly editor: WysiwygEditor,
    private readonly api: VsCodeApi,
  ) {
    const saved = (this.api.getState() as SidebarState | undefined)?.collapsedGroups;
    this.collapsed = new Set(saved ?? DEFAULT_COLLAPSED);
    this.host.classList.add('ceasg-sidebar');
    for (const group of PALETTE_GROUPS) {
      this.host.appendChild(this.buildGroup(group));
    }
  }

  private persist(): void {
    const state = (this.api.getState() as Record<string, unknown> | undefined) ?? {};
    this.api.setState({ ...state, collapsedGroups: Array.from(this.collapsed) });
  }
```

In `buildGroup`, apply the initial state and record toggles:

```ts
    const startCollapsed = this.collapsed.has(group.id);
    if (startCollapsed) { section.classList.add('is-collapsed'); }
    header.setAttribute('aria-expanded', startCollapsed ? 'false' : 'true');
    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (collapsed) { this.collapsed.add(group.id); } else { this.collapsed.delete(group.id); }
      this.persist();
    });
```

Move the `header.setAttribute('aria-expanded', 'true')` line that currently runs before the chevron is appended — the new call above replaces it.

- [ ] **Step 5: Pass the api from the editor**

In `src/webview/wysiwyg/editor.ts:155`:

```ts
      this.sidebar = new ShapeSidebar(sidebarHost, this, this.api);
```

- [ ] **Step 6: Add group headings to the toolbar dropdown**

Replace the item loop in `src/webview/wysiwyg/palette.ts:13-14`:

```ts
    for (const group of PALETTE_GROUPS) {
      const heading = document.createElement('div');
      heading.className = 'ceasg-palette-heading';
      heading.textContent = group.title;
      this.popover.appendChild(heading);
      for (const item of group.items) {
        this.popover.appendChild(createPaletteItemButton(item, (it) => {
```

Keep the existing callback body and close the extra loop. The popover now needs to scroll: add to `media/webview.css`:

```css
/* 48 shapes will not fit in a popover; cap it and let the list scroll. */
.ceasg-palette-popover { max-height: 60vh; overflow-y: auto; }
.ceasg-palette-heading {
  grid-column: 1 / -1;
  font-size: 11px;
  opacity: 0.7;
  padding: 6px 4px 2px;
}
```

- [ ] **Step 7: Group the properties dropdown**

Replace `properties.ts:101-105`:

```ts
    const shape = document.createElement('select');
    for (const group of SHAPE_GROUPS) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.title;
      for (const s of group.shapes) {
        const o = document.createElement('option');
        o.value = s.name;
        o.textContent = s.label;
        optgroup.appendChild(o);
      }
      shape.appendChild(optgroup);
    }
    shape.value = node().shape;
```

Add `SHAPE_GROUPS` to the existing `../../core` import; `NODE_SHAPES` and `SHAPE_LABELS` may become unused here — remove them from the import if so, and let `pnpm lint` confirm.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 9: Type check and lint**

Run: `pnpm check-types && pnpm lint`
Expected: no errors.

- [ ] **Step 10: Manual verification**

Run the extension (F5), open a flowchart in the visual editor. Confirm: the sidebar shows six groups with only Basic expanded; expanding Documents and reopening the panel keeps Documents expanded; the toolbar shapes dropdown shows headings and scrolls; the properties Shape dropdown shows six `optgroup` sections.

- [ ] **Step 11: Commit**

```bash
git add src/webview/wysiwyg/ media/webview.css
git commit -m "feat(shapes): group the palette, dropdown and sidebar by shape family"
```

---

### Task 17: Shape gallery

A generated document showing all 48 shapes, for the one visual pass automated tests cannot do.

**Files:**
- Create: `src/core/shapes/gallery.ts`, `scripts/generate-shape-gallery.ts`, `docs/shape-gallery.md` (generated)
- Modify: `package.json` (add a script), `README.md`, `CHANGELOG.md`
- Test: `src/core/shapes/gallery.spec.ts`

**Interfaces:**
- Consumes: `SHAPE_GROUPS`, `ALL_SHAPES` from Task 2.
- Produces: `buildGallery(): string` in `src/core/shapes/gallery.ts` — pure, so it is unit-testable without touching the filesystem.

**Why the builder lives in `src/`:** `vitest.config.ts` includes only `src/**/*.spec.ts`, so a spec under `scripts/` would silently never run. The pure builder goes in `src/core/shapes/`; `scripts/generate-shape-gallery.ts` is a three-line writer with nothing to test.

- [ ] **Step 1: Write the failing test**

Create `src/core/shapes/gallery.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGallery } from './gallery';
import { ALL_SHAPES, SHAPE_GROUPS } from './registry';

describe('buildGallery', () => {
  it('includes every registered shape', () => {
    const out = buildGallery();
    for (const def of ALL_SHAPES) {
      expect(out, def.name).toContain(`shape: ${def.name}`);
    }
  });

  it('emits one mermaid block per group, in palette order', () => {
    const out = buildGallery();
    const headings = (out.match(/^## .+$/gm) ?? []).map((h) => h.slice(3));
    expect(headings).toEqual(SHAPE_GROUPS.map((g) => g.title));
    expect((out.match(/```mermaid/g) ?? [])).toHaveLength(SHAPE_GROUPS.length);
  });

  it('labels each node with its canonical name so the render is self-describing', () => {
    expect(buildGallery()).toContain('label: "doc"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit src/core/shapes/gallery.spec.ts`
Expected: FAIL — `Failed to resolve import "./gallery"`.

- [ ] **Step 3: Write the builder**

Create `src/core/shapes/gallery.ts`:

```ts
/*
 * Builds docs/shape-gallery.md — every registered shape, grouped, so the whole
 * set can be eyeballed in one pass. Automated tests prove a shape draws inside
 * its box and round-trips; only a human can see that it looks right.
 *
 * Written to disk by scripts/generate-shape-gallery.ts (`pnpm gallery`).
 */

import { ALL_SHAPES, SHAPE_GROUPS } from './registry';

/** Node ids must be alphanumeric, but shape names contain hyphens. */
function idFor(name: string): string {
  return `n_${name.replace(/-/g, '_')}`;
}

export function buildGallery(): string {
  const lines: string[] = [
    '# Shape gallery',
    '',
    `Generated by \`pnpm gallery\`. ${ALL_SHAPES.length} shapes.`,
    '',
    'Open this file in the VS Code Markdown preview to see every shape rendered by',
    "ceasg's own positioned renderer. Each node is labelled with its canonical",
    'Mermaid name.',
    '',
  ];
  for (const group of SHAPE_GROUPS) {
    lines.push(`## ${group.title}`, '', '```mermaid', 'flowchart LR');
    for (const def of group.shapes) {
      lines.push(`  ${idFor(def.name)}@{ shape: ${def.name}, label: "${def.name}" }`);
    }
    lines.push('```', '');
  }
  return lines.join('\n');
}
```

Add `export * from './gallery';` to `src/core/shapes/index.ts`.

- [ ] **Step 4: Write the writer script**

Create `scripts/generate-shape-gallery.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { ALL_SHAPES, buildGallery } from '../src/core';

writeFileSync('docs/shape-gallery.md', buildGallery(), 'utf8');
console.log(`wrote docs/shape-gallery.md (${ALL_SHAPES.length} shapes)`);
```

- [ ] **Step 5: Add the script to `package.json`**

In `"scripts"`, after `"test:unit"`:

```json
    "gallery": "npx tsx scripts/generate-shape-gallery.ts"
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:unit scripts/generateShapeGallery.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Generate the gallery**

Run: `pnpm gallery`
Expected: `wrote docs/shape-gallery.md (48 shapes)`.

- [ ] **Step 8: Visual pass — the point of this task**

Open `docs/shape-gallery.md` in the VS Code Markdown preview with the extension running. Check every shape:

- Is it recognisable as the symbol its name claims? A `doc` should have a wavy bottom, a `tri` should be a triangle, a `cloud` should read as a cloud.
- Does the label sit inside the drawn border, not over the edge? `tri`, `flip-tri`, `bang`, `hourglass` and `diam` are the tight ones.
- Do stacked shapes (`st-rect`, `docs`) read as three copies?
- Are `sm-circ`, `f-circ` and `fork` markers, visibly smaller than labelled shapes?
- Does `text` show its label with no border?

Fix geometry for anything that fails, re-run `pnpm gallery`, and look again. Record any shape you deliberately left approximate in the commit body.

- [ ] **Step 9: Document the feature**

In `README.md`, under **Features**, replace the shape-palette bullet:

```markdown
- **Shape palette** — All 48 Mermaid shapes, including the v11.3.0 expanded set,
  in six collapsible groups in the left sidebar or the toolbar's shapes dropdown.
  Click to drop a shape on the canvas, or drag it exactly where you want it.
```

Under **Known Limitations (v1)**, add:

```markdown
- **Expanded shapes need Mermaid 11.3+** — Shapes outside the classic bracket
  syntax are written as `A@{ shape: doc }`, which older Mermaid renderers do not
  understand. Nodes you wrote in bracket syntax are left in bracket syntax.
```

- [ ] **Step 10: Update the changelog**

Add to `CHANGELOG.md` under a new `0.8.0` heading:

```markdown
## 0.8.0

- All 48 Mermaid v11.3.0 node shapes are now supported, up from 14.
- Shapes are grouped into six families in the palette, dropdown and sidebar.
- Node syntax is preserved: nodes written as `A[Label]` stay that way, and
  `@{…}` attributes ceasg does not model are round-tripped untouched.
- Shape names ceasg does not recognise are no longer flattened to rectangles.
- Degraded rendering is reported to a new **ceasg** output channel.
```

- [ ] **Step 11: Full verification**

Run: `pnpm test:unit && pnpm check-types && pnpm lint && pnpm compile`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add scripts/ docs/shape-gallery.md package.json README.md CHANGELOG.md
git commit -m "feat(shapes): add generated shape gallery and document the 48 shapes"
```

---

## Verification

After Task 17, the feature is complete when all of these hold:

- [ ] `pnpm test:unit` passes, including 48 shapes × 6 parameterised cases.
- [ ] `pnpm check-types && pnpm lint && pnpm compile` are clean.
- [ ] `docs/shape-gallery.md` renders all 48 shapes recognisably in the Markdown preview.
- [ ] Opening `A@{ shape: cloud, label: "x" }` in the visual editor, moving the node, and saving leaves `shape: cloud` in the file.
- [ ] Opening a diagram of bracket-syntax nodes and moving one produces a diff touching only the position comment — no node line is rewritten into `@{}` form.
- [ ] The **ceasg** output channel exists, and `A@{ shape: nonsense }` writes exactly one `[unknown-shape]` line no matter how many times the diagram re-renders.

