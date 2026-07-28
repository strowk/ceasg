# Render node font / stroke style on the canvas (FG#7)

**Date:** 2026-07-28
**Gap doc:** `flowchart_diff_gap.md` §7 — "Node font size / family and advanced
style props not drawn"

## Problem

`render.ts › renderNode` applies only `fill`, `stroke` and text `color`. The
label uses the fixed `.ceasg-label` CSS font and a hard-coded 16px line height.

- `fontSize` / `fontFamily` are modelled and round-trip, but are **invisible on
  the canvas** and have **no picker**.
- `stroke-width` / `stroke-dasharray` are not modelled at all — they land in
  `style.extra`, round-trip verbatim, and have no picker and no rendering.

## Design

### 1. Model

Promote the two stroke props to first-class `NodeStyle` fields, mirroring
`EdgeStyle` exactly:

```ts
export interface NodeStyle {
  fillColor?: string;
  strokeColor?: string;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  strokeWidth?: number;      // NEW
  strokeDasharray?: string;  // NEW, e.g. "5 5"
  extra?: string[];
}
```

- `hasStyle()` includes both new fields.
- `resolveNodeStyle()` merges both through the `classDef default` → node classes
  → explicit `style` layer chain, so `classDef` inheritance works.
- `parseStyleProps`: `"stroke-width"` (via `parsePx`) and `"stroke-dasharray"`.
- `applyStyleProps`: merge both from the parsed result.
- `serializer.styleProps`: emit `stroke-width:${n}px` and
  `stroke-dasharray:${s}`.

The values stop landing in `style.extra`. Round-trip stays lossless.

### 2. Font-aware node sizing

A node whose label is drawn at 24px must get a bigger box, or the text spills
outside the shape — the exact WYS-not-WYG problem this gap describes. So
`estimateNodeSize` becomes style-aware:

```ts
export function estimateNodeSize(node: DiagramNode, style?: NodeStyle)
```

Effective font size = `style?.fontSize ?? BASE_FONT_SIZE` (16), family =
`style?.fontFamily ?? BASE_FONT_FAMILY` (the Mermaid trebuchet stack); the
label is measured with `${fs}px ${family}`.

Formulas are chosen so that **at 16px they reproduce today's numbers exactly**,
i.e. every existing diagram keeps its current geometry:

| | today | new | at fs=16 |
|---|---|---|---|
| height | `NODE_H + (lines-1)*16` | `fs*lines + 28` | 44 / 60 / 76 ✔ |
| width | `max(80, widest+32)` | unchanged (`widest` measured at `fs`) | ✔ |
| diamond height | `72` | `max(72, h+28)` | 72 ✔ |

Other shape adjustments (circle diameter floor, hexagon/trapezoid width bumps,
cylinder height bump) are additive constants and need no change.

**Baseline note.** `textMetrics.LABEL_FONT` measures at 16px (Mermaid's default
node font) while `media/diagram.css .ceasg-label` draws at
`14px var(--vscode-font-family)`. This split is deliberate and is **kept**:
16px stays the sizing baseline, the CSS stays the unstyled draw default. Only
nodes that actually declare `font-size` / `font-family` change appearance, so
there is no visual regression on existing diagrams.

### 3. One size helper

Six modules each carry a private copy of

```ts
function sizeOf(n) { return { w: n.w ?? estimateNodeSize(n).w, ... }; }
```

which cannot resolve `classDef` layers because it has no model. Replace them
with one core export:

```ts
export function nodeSize(model: DiagramModel, node: DiagramNode): { w, h }
```

It resolves the style layers, calls `estimateNodeSize(node, style)`, and applies
the manual `n.w` / `n.h` overrides. Callers updated: `render.ts`, `hitTest.ts`,
`viewport.ts`, `edgePath.ts`, `editor.ts`, `alignTools.ts`, plus the raw
`estimateNodeSize` calls in `layout.ts` and `model.ts`.

`edgePath.ts`'s `nodeBorderPoint` / `edgePathD` / `selfLoopPathD` gain a `model`
parameter so edge endpoints land on the real (font-scaled) box border. All three
call sites — `render.ts`, `hitTest.ts`, `editor.ts` — already have the model in
scope.

`nodeSize` lives in `model.ts`, not `nodeGeometry.ts`: it needs
`resolveNodeStyle`, and `model.ts` already imports `estimateNodeSize`, so this
direction avoids an import cycle.

Threading `model` also reaches `hitTest.ts`'s `nodeAnchorPoints` /
`anchorForNode` (connection handles must sit on the real box edge) and their
`pointer.ts` callers.

### 3a. Font-blind fallback in `measureTextWidth`

`measureTextWidth`'s no-canvas fallback (`units × FALLBACK_CHAR_W`) ignores its
`font` argument, so it returns the same width at every size — which would make
box *widths* font-blind wherever a real canvas is unavailable. Scale the
fallback by the `px` size parsed out of the font string, relative to
`BASE_FONT_SIZE`. The canvas path is unaffected.

### 4. Rendering (`renderNode`)

Apply the resolved style as **inline** styles (inline is required to beat the
`.ceasg-shape` / `.ceasg-label` stylesheet rules — a presentation attribute
would lose; same pattern `renderEdge` uses):

- `strokeWidth` → `shapeEl.style.strokeWidth`
- `strokeDasharray` → `shapeEl.style.strokeDasharray`
- `fontSize` → `text.style.fontSize`
- `fontFamily` → `text.style.fontFamily`

The hard-coded `lineH = 16` becomes the effective font size, so multi-line
labels stay correctly spaced at any size and agree with the height formula in
§2.

### 5. Pickers

**Node panel** (`properties.ts › nodePanel`) gains four controls after the
existing colour rows:

| Row | Control |
|---|---|
| Font size | `<input type=number min=1 step=1>`, blank = unset |
| Font | preset `<select>`: Default / Sans-serif / Serif / Monospace / Cursive |
| Border width | `<input type=number min=0 step=0.5>`, blank = unset |
| Border dash | preset `<select>`: Solid / Dashed / Dotted |

Both selects use one shared helper, `presetSelect(presets, current, onPick)`.
When the node's current value is not one of the presets (hand-written Mermaid
such as `font-family:Georgia` or `stroke-dasharray:5 5`), the helper appends it
as an extra option and selects it, so opening the panel never silently
overwrites an author's value.

The dash presets match the edge panel's (`Solid: ''`, `Dashed: '6 4'`,
`Dotted: '2 4'`) for consistency.

**Multi-select panel** (`multiPanel`) mirrors all four controls, applying the
change to every selected node — matching how its existing Fill/Border/Text rows
behave.

### Out of scope

Generic rendering of arbitrary `style.extra` CSS props. They continue to
round-trip verbatim but are not drawn.

## Testing

Unit (vitest):

- `parser.spec` — `stroke-width` / `stroke-dasharray` parse into typed fields
  and no longer appear in `extra`.
- `roundtrip.spec` — a node style carrying all four props survives
  parse → serialize unchanged.
- `model.spec` — `resolveNodeStyle` merges the new fields through `classDef`.
- `nodeGeometry.spec` — unstyled sizes are byte-identical to today; a 24px
  font-size yields a taller/wider box; diamond floor holds.
- `render.spec` — the shape element carries inline `stroke-width` /
  `stroke-dasharray`, and the label carries inline `font-size` / `font-family`.

Manual: `ceasg-test/node-font-style.md`, one diagram per behaviour (inline
`style` props, `classDef`-inherited font, multi-line label at a large size,
panel editing round-trip).
