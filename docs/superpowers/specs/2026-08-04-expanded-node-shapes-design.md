# Expanded node shapes (Mermaid v11.3.0+)

Date: 2026-08-04
Status: approved, ready for implementation planning

## Problem

ceasg supports 14 node shapes. Mermaid v11.3.0 defines 48, so 34 are unavailable in the visual
editor.

Worse, the missing 34 are not merely absent — they are destroyed. `parseNodeToken`
(`src/core/parser.ts:129`) resolves `@{shape: …}` names through `V11_SHAPE_MAP` and falls back to
`"rect"` for anything unrecognised:

```ts
result.shape = V11_SHAPE_MAP[shapeName.toLowerCase()] ?? "rect";
```

`nodeDeclaration` (`src/core/serializer.ts:57`) then writes that node back as `A[label]`. So opening
a diagram containing `A@{shape: cloud}` in the visual editor and touching anything at all silently
rewrites it to a plain rectangle. The original shape name is not recoverable.

A shape is currently defined across seven sites that must be edited in lockstep: the `NodeShape` union
(`model.ts:28`), `NODE_SHAPES` (`model.ts:44`), `SHAPE_LABELS` (`model.ts:61`), `V11_SHAPE_MAP`
(`parser.ts:148`), the `nodeDeclaration` switch (`serializer.ts:57`), the `createShapeElements`
switch (`shapes.ts:37`), and the sizing switch (`nodeGeometry.ts:56`). At 14 shapes this is
tolerable. At 48 it is seven parallel 48-branch edits per change.

## Goals

- All 48 Mermaid v11.3.0 node shapes render, and are reachable from the palette and the properties
  dropdown.
- A shape is defined in exactly one place.
- Round-tripping a diagram through the visual editor never changes a node's syntax form, and never
  loses a shape name — including names ceasg does not know.
- Degraded rendering always reports itself rather than failing silently. Where the runtime can reach
  the extension host — the host itself and the WYSIWYG webview — it reports to the `ceasg` output
  channel; in the Markdown preview it falls back to `console.warn`. Every degradation path emits
  through the same seam, so the report is unconditional even though its destination is not.
- Every shape is covered by automated structural tests; visual correctness is verifiable in one
  glance.

## Non-goals

- Mermaid's `icon` and `image` shapes. They are not in the v11.3.0 expanded-shapes table, require
  external asset resolution, and are deliberately out of scope.
- Outline-accurate hit-testing. Selection stays bounding-box based; clicking a triangle's empty
  corner should still select it.
- Any change to the `%% mermaid-flow:pos %%` or `%% ceasg:{...} %%` comment formats. Shape is
  derived from syntax on every open and is never persisted, which is what makes the identifier
  rename below safe.

## Decisions

Each was chosen explicitly during design; rejected alternatives are recorded so the reasoning is not
re-litigated later.

| Decision | Chosen | Rejected |
| --- | --- | --- |
| Scope | All 48 shapes, full parity | Curated subset; round-trip fix alone |
| Serialization | Preserve the author's input form per node | Mixed brackets/`@{}` by shape; all `@{}` |
| Shape definitions | One registry entry per shape, split by group | Extend the existing switches |
| Edge anchoring | Opt-in `outline`, box math otherwise | Outline for all 48; box for all 48 |
| Registry keys | Mermaid canonical short names | Keep ceasg names, invent 34 more |
| Palette | Six semantic groups | Basic + Expanded; groups + search; flat list |
| Verification | Registry-driven suite + generated gallery | Tests only; SVG snapshots |
| Diagnostics | Sink seam in core, output channel in the host | `console` only; `vscode` import in core |
| Delivery | One plan | Three phased plans |

Rationale for the three least obvious:

- **Preserve the author's input form.** ceasg edits files people also hand-write. Rewriting
  `A[Process]` into `A@{ shape: rect, label: "Process" }` because some *other* node in the diagram
  needed the attribute form produces a diff that touches every line and drops compatibility with
  Mermaid < 11.3 for a diagram that never asked for it.
- **Mermaid canonical short names as registry keys.** With 48 shapes, maintaining a second
  vocabulary means a permanent ceasg-name ↔ Mermaid-name mapping that must stay in sync. Using
  Mermaid's names makes `@{}` serialization a direct field read, and the historical ceasg names
  survive as aliases so parsing is unaffected. Shape is never persisted, so this rename has no file
  format impact.
- **Opt-in outline.** An outline for all 48 would force polygon approximations of curved shapes
  where anchoring is already correct, and would change today's diamond and hexagon behaviour as a
  side effect of an unrelated feature.

## Architecture

`src/core/shapes.ts` becomes `src/core/shapes/`:

```
shapes/
  types.ts        ShapeName, ShapeGroupId, ShapeGeom, ShapeDef
  primitives.ts   el/polygon/path/rect/ellipse/vline + shared curve helpers
  basic.ts  process.ts  data.ts  documents.ts  flow.ts  annotations.ts
  registry.ts     SHAPES, ALL_SHAPES, SHAPE_GROUPS, ALIAS_INDEX
  index.ts        public surface
```

```ts
interface ShapeGeom { cx, cy, w, h, left, right, top, bottom, hw, hh }

interface ShapeDef {
  name: ShapeName;                    // Mermaid canonical short name; the registry key
  label: string;                      // palette and dropdown text
  group: ShapeGroupId;
  aliases: string[];                  // every Mermaid alias + ceasg's historical name
  bracket?: (id: string, label: string) => string;   // only the 14 with bracket syntax
  size?: (base: { w: number; h: number }, ctx: SizingCtx) => { w: number; h: number };
  // SizingCtx carries what estimateNodeSize already computes: the resolved NodeStyle,
  // the measured widest line width, the font size, and the line count.
  outline?: (g: ShapeGeom) => Array<[number, number]>;
  render: (g: ShapeGeom) => SVGElement[];
}
```

`ShapeName` is defined in `shapes/types.ts`; `model.ts` re-exports it as `NodeShape`. The registry
never imports from `model.ts`, so there is no import cycle.

All seven definition sites become derived:

| Today | Becomes |
| --- | --- |
| `model.ts:28` `NodeShape` union | `type NodeShape = ShapeName` |
| `model.ts:44` `NODE_SHAPES` | `ALL_SHAPES.map(d => d.name)` |
| `model.ts:61` `SHAPE_LABELS` | derived from `def.label` |
| `parser.ts:148` `V11_SHAPE_MAP` | `ALIAS_INDEX`, built from `def.aliases` |
| `serializer.ts:57` switch | `def.bracket?.(id, label) ?? attrForm(node)` |
| `shapes.ts:37` switch | `def.render(geom)` |
| `nodeGeometry.ts:56` switch | `def.size?.(base, ctx) ?? base` |

`shapes/index.ts` keeps exporting `createShapeElements(name, cx, cy, w, h)` with its current
signature, so `render.ts:22` and the Markdown preview path (`flowchartPreview.ts` → `renderDiagram`)
need no changes.

## Serialization

Two new optional fields on `DiagramNode`, plus one for unknown shapes:

```ts
syntax?: 'bracket' | 'attr';        // the form the author wrote
attrs?: Record<string, string>;     // @{} keys other than shape and label
rawShape?: string;                  // shape name ceasg does not recognise
```

The serializer rule in full:

```ts
const def = SHAPES[node.shape];
if (node.syntax !== 'attr' && def.bracket) { return def.bracket(id, label); }
return attrForm(node);   // `${id}@{ shape: ${node.rawShape ?? def.name}, label: "…", ...attrs }`
```

`attrForm` emits `shape` first, then `label`, then the remaining `attrs` keys in the order they were
parsed. Fixing the order keeps re-serialization stable, so an unedited node never produces a diff.

Three consequences, all deliberate:

- A node created in the editor has `syntax` undefined, so it serializes to bracket form whenever the
  shape has one. New diagrams stay maximally compatible with older Mermaid.
- Changing a bracket-form node to a shape with no bracket form promotes it to `@{}`.
- Changing it back does **not** demote it. Once a node carries an `attr` preference it keeps it;
  auto-demotion would rewrite lines the author chose to write that way.

`attrs` passthrough preserves `@{}` keys ceasg does not model (`pos`, `icon`, `form`, `constraint`).
`rawShape` closes the data-loss bug: an unrecognised name renders as a rect, exactly as today, but
serializes back verbatim instead of being flattened to `A[label]`.

## The 48 shapes

Six groups, in palette order. **Bold** = new.

| Group | Shapes |
| --- | --- |
| Basic (9) | rect, rounded, stadium, circle, dbl-circ, diam, hex, odd, **text** |
| Process (8) | fr-rect, trap-t, trap-b, **lin-rect**, **div-rect**, **st-rect**, **tag-rect**, **sl-rect** |
| Data & I/O (11) | cyl, lean-r, lean-l, **h-cyl**, **lin-cyl**, **datastore**, **win-pane**, **bow-rect**, **notch-rect**, **flag**, **curv-trap** |
| Documents (4) | **doc**, **lin-doc**, **docs**, **tag-doc** |
| Flow Control (11) | **tri**, **flip-tri**, **fork**, **f-circ**, **sm-circ**, **fr-circ**, **cross-circ**, **notch-pent**, **delay**, **hourglass**, **bolt** |
| Annotations (5) | **brace**, **brace-r**, **braces**, **cloud**, **bang** |

The 14 existing shapes keep their exact current geometry; the rename to Mermaid ids changes no
pixels. ceasg's historical names map as: `subroutine`→`fr-rect`, `parallelogram`→`lean-r`,
`parallelogram-alt`→`lean-l`, `trapezoid`→`trap-b`, `trapezoid-alt`→`trap-t`,
`double-circle`→`dbl-circ`, `asymmetric`→`odd`, `cylinder`→`cyl`, `diamond`→`diam`,
`hexagon`→`hex`, `round`→`rounded`. Each historical name is retained as an alias.

The 34 new shapes fall into four implementation tiers; effort is unevenly distributed:

- **Tier 1 — rect plus lines or circles (11).** `lin-rect`, `div-rect`, `win-pane`, `lin-cyl`,
  `lin-doc`, `fork`, `sm-circ`, `f-circ`, `fr-circ`, `cross-circ`, `text`. All compose existing
  primitives; the current `subroutine` vline pattern covers most.
- **Tier 2 — single polygon (10).** `tri`, `flip-tri`, `notch-rect`, `notch-pent`, `sl-rect`,
  `bow-rect`, `flag`, `hourglass`, `bolt`, `bang`. One `polygon()` call each.
- **Tier 3 — curves (10).** `doc`, `tag-doc`, `tag-rect`, `delay`, `curv-trap`, `h-cyl`,
  `datastore`, `brace`, `brace-r`, `braces`. Require a new `path()` primitive with arcs and béziers,
  plus a shared `wavyBottom()` helper reused by `doc`, `lin-doc`, `docs`, and `tag-doc`.
- **Tier 4 — stacked copies (3).** `st-rect`, `docs`, `cloud`. Offset duplicates of a tier-1 or
  tier-3 body; `cloud` is the one genuinely bespoke path.

### Edge anchoring

`nodeBorderPoint` (`edgePath.ts:6`) uses bounding-box math for every shape. It gains an `outline`
branch: when the shape declares one, the border point is the ray/outline intersection instead.

`outline` is declared only where the filled area diverges sharply from the box (roughly under 70%
coverage): `tri`, `flip-tri`, `hourglass`, `bolt`, `flag`, `notch-pent`, `bang`, `curv-trap`,
`cloud`, `brace`, `brace-r`, `braces`. Curved shapes supply a coarse polygon approximation;
anchoring does not need sub-pixel accuracy. Everything else keeps box math, including `diam` and
`hex`, whose anchoring is unchanged from what ships today.

### Sizing

Most new shapes need a `size` rule so the label fits: documents need bottom room for the wave,
stacked shapes need offset room, `tri` and `flip-tri` need the rhombus-style growth `diam` already
uses (`nodeGeometry.ts:75`), and `sm-circ`, `f-circ`, and `fork` are fixed-size and ignore their
label entirely.

`text` renders no border — its `render` returns an empty element array. Its selection outline in the
editor derives from the box rather than from a drawn element.

## UI

`paletteModel.ts:44` currently hardcodes a single `Basic` group. It becomes `SHAPE_GROUPS.map(...)`,
yielding six collapsible groups. The sidebar renderer and `createPaletteItemButton` need no change;
the group machinery already exists.

`properties.ts:101`'s flat `<select>` gains one `<optgroup>` per group, in the same order.

Default expansion state is Basic expanded, the other five collapsed, persisted in webview state so
it survives reopening. Forty-eight items expanded at once is an unusable sidebar.

## Diagnostics

The renderer runs inside the Markdown preview, where an uncaught exception blanks the whole code
block. Every failure path degrades rather than throws, and reports itself.

There is no output channel in the codebase today; the only precedent is `console.error('[ceasg] …')`
at `layout.ts:32`. `createShapeElements` runs in three runtimes, only one of which can see the
`vscode` API:

| Runtime | Reaches the output channel |
| --- | --- |
| Extension host (parser/serializer via `documentSync`) | Directly |
| WYSIWYG webview | Via `postMessage` to the host |
| Markdown preview (`markdown.previewScripts`) | No supported path |

The design mirrors the existing `dom.ts` seam. `src/core/diagnostics.ts` exposes
`warn(code, message, detail?)` and `setDiagnosticSink(fn)`. The default sink is
`console.warn('[ceasg] …')`, which works in all three runtimes. `extension.ts` creates
`vscode.window.createOutputChannel('ceasg')` and installs a sink writing to it. The WYSIWYG webview
installs a sink posting a new `DiagnosticMessage` (`{ type: 'diagnostic', code, message, detail }`)
added to `WebviewToHost` in `src/shared/messages.ts`; `panelManager` forwards it to the same
channel.

**Known limitation:** warnings raised in the Markdown preview runtime reach only that preview's
devtools console. Contributed preview scripts have no supported channel back to the extension host.

### Deduplication

Parsing and rendering both re-run on every keystroke. An un-deduped unknown-shape warning would
therefore emit once per keystroke and flood the channel within seconds, so `warn` takes an explicit
dedupe key and the sink suppresses repeats:

```ts
warn(code: DiagnosticCode, key: string, message: string, detail?: string): void
```

- **Dedupe identity** is `code` + `key` + document identity. `key` is supplied by the caller and
  names the specific occurrence — the unrecognised shape name for an unknown shape, the missing
  registry name for a lookup miss, the alias string for a collision. Two different unknown shape
  names in one document produce two warnings; the same name across fifty keystrokes produces one.
- **Document identity** is part of the key because the sink in the extension host is shared across
  every open document. Without it, the first document to warn about `clod` would silence the same
  warning in every other file for the rest of the session.
- **Lifetime** is the document's editing session. The suppress-set is cleared when the document is
  closed and when its WYSIWYG panel is disposed, so reopening a file reports its problems afresh.
- **Bound** is 200 entries per document, dropping oldest-first. The realistic count is one or two;
  the cap exists so a pathological generated file cannot grow the set without limit.

**Accepted limitation:** a problem that is fixed and then reintroduced within the same editing
session is not re-reported. Suppressing on first sight rather than diffing the active problem set
each pass is the simpler mechanism, and it costs little here — after full parity, unknown shape
names are rare (a typo, or a shape from a future Mermaid release), and the other two warned events
signal internal bugs that are worth reporting once rather than continuously. If this proves annoying
in practice, the fix is to have each parse pass publish its full set of active keys and diff against
the previous pass, which restores absent-to-present reporting at the cost of pass plumbing through
`mermaidToModel` and `renderDiagram`.

Warned events:

| Event | Reported | Behaviour |
| --- | --- | --- |
| Unknown shape name in `@{}` | Yes, names the shape | Preserved in `rawShape`, drawn as rect, serialized verbatim |
| Registry lookup miss at render | Yes | Defensive rect fallback |
| Alias collision at runtime | Yes, once | First registration wins |
| Malformed `@{}` body | No | Unchanged: no shape recorded, falls through to bare-identifier handling |
| Degenerate geometry clamped | No | `w`/`h` clamped to a floor before `render`/`outline`, so no polygon emits `NaN` |

The existing dagre failure at `layout.ts:32` is routed through the same seam.

## Testing

A parameterised suite over `ALL_SHAPES` asserts, for every shape: it renders within its box, its
sizing is finite and at or above minimums, every alias parses back to it, and label plus shape
survive parser → serializer → parser. The "renders within its box" assertion must accept an empty
element array, which is correct for `text`.

Three areas the parameterised suite does not cover:

- **Registry invariants.** Names unique, aliases unique across all defs, every shape in exactly one
  group, no empty groups, and all 14 legacy shapes still carry a `bracket` — a missing one would
  silently rewrite existing diagrams into `@{}`.
- **Serialization fidelity.** Bracket stays bracket; attr stays attr; promotion occurs on a shape
  change to a bracketless shape; demotion does not occur; `attrs` and `rawShape` pass through.
- **Diagnostics.** The sink is called once for each warned event; a repeat with the same
  `code`+`key`+document is suppressed; the same `key` under a different document is not suppressed;
  the set clears on document close; and the 200-entry cap drops oldest-first.

`docs/shape-gallery.md` is generated, contains all 48 shapes, and is opened in the preview pane for
a visual pass.

Existing specs need a mechanical update for the renamed ids: `shapes.spec.ts`,
`nodeGeometry.spec.ts`, `paletteModel.spec.ts`, and any parser, serializer, or roundtrip spec
referencing the historical names.

## Delivery

One plan, not phased. The work is ordered within it so that each group of steps leaves the tree
green:

1. Registry refactor — 14 shapes, Mermaid ids, all seven definition sites derived. Behaviour-neutral.
2. Diagnostics seam, output channel, and the `diagnostic` message.
3. Serialization fidelity — `syntax`, `attrs`, `rawShape`.
4. Tier 1 and 2 shapes (21), palette groups, `<optgroup>` dropdown.
5. Tier 3 and 4 shapes (13), including the `path()` primitive.
6. Gallery generation and the visual pass.

Steps 1–3 are independent of each other and of the new shapes.
