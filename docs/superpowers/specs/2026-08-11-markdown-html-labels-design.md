# Markdown and HTML labels — design

Closes gap **§5 "Markdown-formatted and HTML labels"** in
`docs/flowchart_diff_gap.md`.

## Problem

Mermaid labels support two kinds of markup and ceasg renders neither:

- **Markdown strings** — a backtick-wrapped quoted string,
  ``A["`**Bold** and _italic_`"]`` — giving bold, italic and automatic word
  wrapping at `flowchart.wrappingWidth` (default 200px).
- **HTML markup** — because Mermaid defaults to `htmlLabels: true`, an ordinary
  quoted string renders `<b>`, `<i>`, `<br/>` and HTML entities,
  `B["Line 1<br/><b>Line 2</b>"]`.

Today ceasg stores and paints both as literal characters: the user sees the
backticks and asterisks. The label editor is single-style plain text.

## Scope

Everywhere Mermaid supports label markup:

- node labels (`A["…"]`, and the v11 attribute form `A@{ label: "…" }`)
- edge labels (`A -->|"…"| B` and the inline `A -- … --> B` form)
- subgraph titles (`subgraph S["…"]`)

Out of scope: a rich-text editing toolbar, arbitrary HTML (`<span style>`,
`<a>`, tables), `<u>`/`<s>`/`<code>`, and images or icons in labels (§15).

## Architecture

### 1. Markup stays as source text in the model

`node.label` continues to hold the raw markup exactly as authored —
`**Bold** and _italic_`, `Line 1<br/><b>Line 2</b>`, `Tom &amp; Jerry` — with
the existing `<br/>` ↔ `\n` convention unchanged. Nothing is decoded into the
model.

Three new optional fields record which flavour of string the author wrote:

```ts
type LabelFormat = "markdown";

interface DiagramNode  { …; labelFormat?: LabelFormat }
interface DiagramEdge  { …; labelFormat?: LabelFormat }
interface DiagramGroup { …; titleFormat?: LabelFormat }
```

Absent means a plain string (HTML markup still renders, matching Mermaid's
`htmlLabels: true` default). The field is set on parse when the quoted string is
backtick-wrapped, and re-emitted as backticks on save.

**Rejected alternative — a structured rich-text model** (label as an array of
styled runs). It would touch every consumer of `label`, and it cannot round-trip
markup it does not model, which is the opposite of this codebase's contract that
unedited Mermaid re-serializes byte-identical.

**Accepted consequence:** the properties-panel text field and the double-click
inline editor show markup *source* (`**bold**`, `&amp;`) while the canvas shows
it rendered — the way Obsidian's source mode works. This is what buys the
lossless round-trip: an untouched node produces no diff.

### 2. New shared module `src/core/labelMarkup.ts`

Node sizing and label painting must agree — that invariant already exists
between `estimateNodeSize` and `render.ts`. So markup parsing lives in `core`
and both call it.

```ts
export interface LabelRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface LabelLayout {
  /** Wrapped, tokenized lines. Never empty; a blank label is [[]]. */
  lines: LabelRun[][];
  /** Widest laid-out line, in px, measured in the runs' own fonts. */
  width: number;
  /** lines.length * fontSize. */
  height: number;
}

export function layoutLabel(
  text: string,
  opts: {
    markdown?: boolean;
    fontSize?: number;      // default BASE_FONT_SIZE
    fontFamily?: string;    // default BASE_FONT_FAMILY
    wrapWidth?: number;     // default Infinity (no wrap)
  },
): LabelLayout;
```

#### Recognized in both modes

- Tags `<b>`, `<strong>`, `<i>`, `<em>` (case-insensitive, with or without
  attributes-free closing forms) and `<br>` / `<br/>` / `<br />`.
- HTML entities, decoded in text runs only, after tag tokenization:
  - named: `amp lt gt quot apos nbsp copy reg trade hellip mdash ndash
    laquo raquo times divide deg plusmn middot bull larr rarr uarr darr harr`
  - numeric decimal `&#169;` and hex `&#x1F600;` (any valid code point)
- **Any other tag is left literal.** Mermaid would interpret it as HTML, but
  silently swallowing text the user typed is worse than showing it; `A <B> C`
  keeps its `<B>`.

#### Recognized in markdown mode only

`**bold**`, `__bold__`, `*italic*`, `_italic_`, `***bolditalic***`,
`___bolditalic___`, nesting (`**bold with _italic_**`), and backslash escapes
`\*` / `\_` / `\\` yielding the literal character.

An unterminated delimiter is literal text: `2 * 3 * 4` stays `2 * 3 * 4`, and a
trailing `**oops` renders as typed.

#### Wrapping

Greedy word wrap on space boundaries, preserving each word's run styling across
the break. A single word wider than `wrapWidth` is not hard-broken — it
overflows, as Mermaid does. Wrapping is applied **only in markdown mode**; a
plain string breaks only on `\n` / `<br/>`, exactly as today.

Callers choose `wrapWidth`:

| Label            | wrapWidth                                          |
| ---------------- | -------------------------------------------------- |
| node, auto-sized | `DEFAULT_WRAP_WIDTH` = 200 (Mermaid's default)     |
| node, manual `w` | `node.w - PAD_W` — resizing reflows the text       |
| edge label       | `DEFAULT_WRAP_WIDTH` = 200                         |
| subgraph title   | `Infinity` — the box is sized from members, not it |

### 3. Rendering — one SVG text chunk per line

`render.ts` emits one `<tspan>` per run. Only the **first** run of a line
carries `x` and `dy`; the remaining runs carry neither, so the whole line stays
a single SVG text chunk and the browser centres it under the inherited
`text-anchor: middle`. Centring is therefore exact and needs no measurement —
measurement is only used for box sizing and wrapping.

Each run's tspan gets `font-weight: bold` / `font-style: italic` as needed.

`xml:space="preserve"` is set on the `<text>` element **only when some line has
more than one run**, so the space in `**Bold** and _italic_` survives the
tspan boundary. Single-run labels keep today's markup and today's whitespace
handling exactly.

Subgraph titles use the same run loop with the group title's own anchor
(default `start` at `x = box.x + 10`); the first-run-carries-`x` rule works
unchanged.

### 4. Sizing

`nodeGeometry.ts` gains two exported helpers that resolve the wrap width and
delegate to `layoutLabel`:

```ts
export function nodeLabelLayout(node: DiagramNode, style?: NodeStyle): LabelLayout;
export function edgeLabelLayout(edge: DiagramEdge): LabelLayout;
```

`estimateNodeSize` and `edgeLabelSize` are re-expressed in terms of them, and
`render.ts` calls the same two helpers. One layout therefore feeds dagre, the
node box, the edge-label background rect and the painted glyphs — they cannot
drift apart.

Formulas are unchanged: `w = max(MIN_W, ceil(layout.width) + PAD_W)`,
`h = fontSize * lines.length + PAD_H`. At one plain line with no markup, every
number is identical to today's, so existing diagrams keep their geometry.

Bold runs are measured with a bold font (`bold 16px …` via the canvas
`measureText` path already in `textMetrics.ts`, which accepts the CSS font
shorthand), so a box actually fits its bold text.

### 5. UI

One new control per panel in `wysiwyg/properties.ts`:

- node panel: **Label format** — `<select>` of `Plain` / `Markdown`
- edge panel: **Label format** — same
- group panel: **Title format** — same

Selecting `Markdown` sets `labelFormat = 'markdown'`; `Plain` clears it. No
rich-text toolbar, no per-run editing.

### 6. Serialization

`quoteLabel(label, markdown)` wraps the escaped body in backticks when
`markdown` is set:

```
"`**Bold** and _italic_`"
```

`\n` is still encoded as `<br/>` in both modes, because ceasg emits one line per
statement. Mermaid passes inline HTML through `marked`, so `<br/>` inside a
markdown string renders as a break — this is the one behaviour that must be
confirmed against a real Mermaid preview, and the test fixture exercises it.

`duplicateNode` copies `labelFormat` along with the label.

## Data flow

```
Mermaid text
  → parser.stripQuotes → { text, markdown }   (backticks detected here)
  → model: node.label (raw markup) + node.labelFormat
  → nodeLabelLayout / edgeLabelLayout → layoutLabel → LabelLayout
      ├→ estimateNodeSize / edgeLabelSize → dagre + node boxes
      └→ render.ts → <tspan> runs
  → serializer.quoteLabel(label, markdown) → Mermaid text
```

The same `render.ts` serves both the WYSIWYG canvas and the Markdown preview
(`src/preview/flowchartPreview.ts` imports it), so one change covers both
surfaces.

## Error handling

Markup parsing never throws and never rejects input — every malformed construct
degrades to literal text:

- unterminated `**` or `<b>` → literal characters
- unknown entity `&foo;` → left as `&foo;`
- unknown tag → left literal
- `layoutLabel("")` → `{ lines: [[]], width: 0, height: fontSize }`

This matters because `renderFlowchartToSvg` runs inside the Markdown preview,
where a thrown exception blanks the whole fenced block (see the existing comment
in `renderEdge`).

## Testing

- `core/labelMarkup.spec.ts` — tokenizer table: plain passthrough, each markdown
  delimiter, nesting, escapes, unterminated delimiters, each recognized tag,
  unknown tag left literal, named + decimal + hex entities, unknown entity,
  `<br/>` and `\n` line splitting, greedy wrap with styling preserved across the
  break, overlong single word, empty string.
- `core/nodeGeometry.spec.ts` — a bold label sizes wider than the same plain
  text; a markdown label longer than 200px wraps to more than one line and its
  box grows in height, not width; a node with manual `w` wraps to that width;
  **regression: an unmarked single-line label produces byte-identical `w`/`h` to
  before.**
- `core/roundtrip.spec.ts` — a markdown node, an HTML node
  (`B["Line 1<br/><b>Line 2</b>"]`) and a markdown subgraph title survive
  parse → serialize unchanged; toggling format off then on returns the original.
- `webview/wysiwyg/render.spec.ts` — a markdown node label yields three tspans
  with the expected `font-weight`/`font-style`; only the first carries `x`;
  `xml:space` is present for multi-run and absent for single-run.
- `ceasg-test/markdown-labels.md` — hand-check fixture with markdown nodes,
  HTML nodes, entity nodes, a wrapping node, a markdown edge label and a
  markdown subgraph title.

## Out of scope / follow-ups

- `flowchart.wrappingWidth` read from a `%%{init}%%` directive (constant 200 for
  now).
- Rich-text editing UI (WYSIWYG bold/italic buttons in the label editor).
- `<u>`, `<s>`, `<code>`, links and arbitrary inline HTML.
