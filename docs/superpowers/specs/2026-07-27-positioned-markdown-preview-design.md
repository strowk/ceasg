# Positioned Mermaid in VS Code's built-in Markdown preview — design

**Date:** 2026-07-27

## Goal

Make VS Code's built-in Markdown preview render ceasg flowcharts using the manual
layout stored in `%% mermaid-flow:pos %%` comments — so a positioned flowchart looks
**identical** in the Markdown preview and in the ceasg visual editor. All other Mermaid
diagram types render normally.

## Direction (decisions)

ceasg becomes the **sole** Mermaid renderer for VS Code's built-in Markdown preview. The
user removes the stock Mermaid preview extension; ceasg takes over every ` ```mermaid `
block.

- **Full replacement**, not delegation. The earlier feasibility notes proposed chaining
  to a coexisting Mermaid extension via `prevFence`. That is unreliable: VS Code calls
  each extension's `extendMarkdownIt(md)` on a shared `md` instance in an
  uncontrollable order, and the stock Mermaid plugin *overwrites* the fence rule rather
  than chaining — so if it runs after ceasg, ceasg never gets a turn. Owning every
  diagram type removes the ordering race entirely.
- **Routing by diagram type:**
  - **Flowcharts** (positioned *and* unpositioned) → ceasg renderer. Unpositioned
    flowcharts get `autoLayout` (dagre) — the same engine the editor's "Auto layout"
    uses — so the ceasg look is consistent everywhere.
  - **All non-flowchart types** (sequence, class, gantt, pie, …) → bundled `mermaid.js`,
    rendered as they normally would be.
- **Scope:** VS Code's built-in Markdown preview only. No effect on GitHub, mermaid.live,
  or other renderers.

## Architecture

Two official Markdown-preview contribution points:

| Contribution | Runs in | Has DOM? | Role |
|---|---|---|---|
| `markdown.markdownItPlugins` (`extendMarkdownIt`) | Node extension host | No | Override the `mermaid` fence rule; emit a placeholder carrying the raw source |
| `markdown.previewScripts` + `markdown.previewStyles` | Preview webview | Yes | Decode placeholders, route by type, render, style |

**Flow:**

1. `extendMarkdownIt(md)` overrides `md.renderer.rules.fence`. For `lang === 'mermaid'`,
   it base64-encodes the block source and emits
   `<div class="ceasg-diagram" data-src="…"></div>`. Other languages fall through to the
   default renderer. No type detection here — the preview script decides.
2. `dist/preview.js` runs in the webview on load and on every content change (VS Code
   re-runs preview scripts). `renderAll()` walks `.ceasg-diagram:not([data-done])`:
   - decode `data-src`;
   - `detectDiagramType(src)`;
   - **flowchart** → `mermaidToModel` → if no saved `pos`, `autoLayout` → `renderDiagram`
     → size the SVG via `computeContentBounds` → inject;
   - **else** → `mermaid.render()` → inject;
   - mark the element `data-done`.

## Components

**A. markdown-it plugin** — new, `src/preview/markdownItMermaid.ts` (Node, no DOM).
Returned from `activate()`. Overrides the fence rule as above. Trivial and
dependency-free (no parser import on the Node side).

**B. Preview host** — new, `src/preview/preview-inject.ts` → bundled to `dist/preview.js`
(browser). Entry point with `renderAll()`. Routes flowchart vs. non-flowchart, handles
per-diagram errors, idempotent via `data-done`.

**C. SVG sizer** — new, small helper (or inline in the host). `renderDiagram` returns an
SVG styled `width/height:100%` for the editor's pan/zoom viewport. For static preview,
use `computeContentBounds(model)` to set a `viewBox` plus intrinsic `width`/`height`
(with padding) so each diagram is a correctly sized, auto-height inline image.

**D. Reused unchanged** — `mermaidToModel`, `autoLayout`, `renderDiagram`,
`computeContentBounds`, `detectDiagramType`.

**Build** — add a third esbuild entry (browser/IIFE → `dist/preview.js`) alongside
`extension.js` and `webview.js`; copy `media/preview.css` to `dist/`.

## Styling & theming

The ceasg renderer relies on `.ceasg-*` classes (shapes, labels, edges, arrowhead) that
today live in `webview.css` using VS Code theme variables. The preview webview exposes
the same variables, so positioned flowcharts match the visual editor and follow the
preview's light/dark theme automatically. Factor the diagram-only rules into a shared CSS
partial so the editor and preview cannot drift.

For mermaid.js-rendered diagrams, initialize mermaid with a theme chosen from the
preview's dark/light state (e.g. `body.vscode-dark`) so those match too.

## Error handling

Per-diagram: a parse or render failure renders the error message into that one
placeholder and marks it done. One bad block never blocks the rest of the document.

## Settings

`ceasg.previewRendering` — enum `on` / `off`, default **on**. On-by-default is what makes
preview render at all once the stock extension is removed. When `off`, the markdown-it
plugin passes mermaid blocks straight through (plain code fence, or a coexisting
extension may handle them).

## Testing

- **Unit (vitest):** routing (`detectDiagramType` → correct branch), placeholder
  emit/escape, base64 round-trip, SVG sizing from `computeContentBounds`.
- **Integration:** a markdown file with a positioned flowchart, an unpositioned
  flowchart, and a couple of non-flowchart types (reuse the `ceasg-test` fixture)
  rendered in the preview webview.
- **Manual acceptance:** a positioned flowchart looks identical in preview and in the
  visual editor.

## Out of scope

- Interactivity in the preview (editing, drag) — preview is a static image.
- Non-flowchart layout customization.
- Any renderer other than VS Code's built-in Markdown preview.

## Risks / open notes

- **Bundle size:** `previewScripts` load on every Markdown preview and mermaid.js is
  large (~1 MB). Start by bundling it in (matches the stock extension). If size matters
  later, lazy-load mermaid only when a non-flowchart block is present.
- Dependence on preview-webview internals (re-render cadence, theme classes) — standard
  for this contribution point.
