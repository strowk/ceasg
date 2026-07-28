# Render edge color / width / font on the canvas (FG#6)

**Date:** 2026-07-28
**Roadmap item:** #1

## Problem

`render.ts › renderEdge` sets the edge path but never reads `edge.style`. Edge
`strokeColor`, `strokeWidth`, `textColor`, `fontSize` (parsed into `EdgeStyle`)
and `stroke-dasharray` (kept verbatim in `style.extra`) are invisible on the
WYSIWYG canvas — they only appear in emitted Mermaid / external preview.

## Design

### 1. Model
Promote dash pattern to a first-class field so it renders cleanly and a picker
can bind to it instead of munging `style.extra`:

```ts
export interface EdgeStyle {
  strokeColor?: string;
  strokeWidth?: number;
  strokeDasharray?: string;   // NEW, e.g. "6 4"
  textColor?: string;
  fontSize?: number;
  extra?: string[];
}
```

- `parseEdgeStyleProps`: add `"stroke-dasharray"` → `strokeDasharray`.
- `serializer.linkStyleLine`: emit `stroke-dasharray:${s.strokeDasharray}`.
- `hasEdgeStyle`: include the new field.

Round-trip stays lossless.

### 2. Rendering (`renderEdge`)
Apply `edge.style` as **inline styles** (inline is required to beat the
`.ceasg-edge-line` stylesheet rule, same pattern `renderNode` uses):

- `strokeColor` → `line.style.stroke`
- `strokeWidth` → `line.style.strokeWidth`
- `strokeDasharray` → `line.style.strokeDasharray` (overrides kind-based dashes)
- label `textColor` → `label.style.fill`
- label `fontSize` → `label.style.fontSize`; size the label background box from
  the actual font size so it still fits.

### 3. Selection highlight
Inline stroke on the line would clobber the old `.ceasg-edge-selected` highlight
(which recolored the line via CSS) — and forcing it back with `!important` pins
the color/width so live edits aren't visible until deselect. Instead, show
selection as a translucent halo on the wide `.ceasg-edge-hit` path (which sits
under the line), leaving the real line's inline style visible and live:

```css
.ceasg-edge-selected .ceasg-edge-hit { stroke: var(--vscode-focusBorder); stroke-opacity: 0.4; }
```

### 4. UI pickers (edge panel, `properties.ts`)
Add below the existing "Line color":

- **Line width** — number input (px) → `strokeWidth`
- **Dash** — dropdown Default / Dashed (`6 4`) / Dotted (`2 4`) → `strokeDasharray`
- **Label size** — number input (px) → `fontSize`
- **Label color** — color input → `textColor`

Each writes through `editor.mutate(..., { commit: true })`.

### 5. Tests & packaging
- Extend `render.spec.ts`: styles land on the path/label.
- Round-trip test for `stroke-dasharray`.
- Add `ceasg-test/edge-styling.md` exercising colored/thick/dashed edges and
  styled labels via `linkStyle`.
- Build the vsix.
