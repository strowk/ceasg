# Per-subgraph direction — design

Closes §4 of `docs/flowchart_diff_gap.md`: a `direction` line inside a
`subgraph` should actually lay out that subgraph's members, and should be
settable from the visual editor.

## Problem

Three separate defects sit behind that one gap.

1. **No model.** `DiagramGroup` has no direction field. `parser.ts`
   classifies `direction …` as structural (`isStructuralLine`) and pushes the
   raw line into `model.extras`.
2. **Round-trip corruption.** `modelToMermaid` emits `extras` at the end of
   the diagram, outside every `subgraph` block. So saving a diagram whose
   subgraph contained `direction LR` **relocates that line to the top level**,
   where Mermaid reads it as the *diagram* direction and flips the whole
   chart. This is a live data-loss bug, not just a missing feature.
3. **No layout support.** `dagreLayout` builds one dagre graph with
   `compound: true` and a single global `rankdir`. dagre has no per-cluster
   rankdir, so the feature cannot be expressed in that shape at all.

## What Mermaid actually does

Taken from Mermaid's own source rather than inferred:
`packages/mermaid/src/rendering-util/layout-algorithms/dagre/mermaid-graphlib.js`
(the `extractor` function, lines 340–460) and
`packages/mermaid/src/diagrams/flowchart/flowDb.ts` (`addSubGraph`, lines
700–755).

Mermaid does **not** always lay clusters out recursively. Per subgraph with
children, it picks one of three branches:

| # | Condition | Handling |
|---|---|---|
| 1 | `explicitDir` — the author wrote a `direction` line | Own dagre sub-graph, `rankdir` = that direction. Always, **even when edges cross the boundary**. |
| 2 | No explicit direction **and** no edges cross the boundary | Own dagre sub-graph, `rankdir` = **perpendicular to the parent** (`TB → LR`, anything else `→ TB`). |
| 3 | Otherwise | Left flat in the parent dagre graph as a compound cluster, sharing the parent's `rankdir`. |

`externalConnections` is set for a cluster when some edge has exactly one
endpoint among its descendants (`d1 ^ d2`, line 251), and additionally when an
edge names the cluster id itself — Mermaid rewrites such an endpoint to an
anchor node inside the cluster and marks the parent external (lines 306–320).

**There is no inheritance.** A subgraph with no `direction` line keeps
`dir === undefined`; the branch decides its layout. The one exception is the
`flowchart.inheritDir` config flag: when on, an unset subgraph takes the
**diagram** direction (never the enclosing subgraph's), which also suppresses
the Branch 2 flip.

ceasg today implements Branch 3 for every subgraph. Branch 1 is the requested
feature. Branch 2 is why a self-contained `subgraph S; A-->B; end` inside a
`flowchart TB` renders left-to-right in Mermaid Live but top-to-bottom in
ceasg — the quirk that makes people write `direction TB` inside subgraphs to
"fix" it.

**Decision: implement all three branches.** Parity with Mermaid Live is the
goal. Branch 2 costs almost nothing once the recursive engine exists.

## Model

```ts
interface DiagramGroup {
  /** `direction X` written inside this subgraph. Undefined = not set — the
   *  layout branch decides, exactly as in Mermaid. TD normalizes to TB.
   *  Mirrors Mermaid's `hasExplicitDir`. */
  direction?: Direction;
}

interface DiagramConfig {
  /** Mermaid `flowchart.inheritDir`: unset subgraphs take the diagram
   *  direction instead of flipping perpendicular. */
  inheritDir?: boolean;
}
```

`cloneModel` spreads group fields deliberately (`model.ts:709`), so undo/redo
carries `direction` with no change. `hasConfig` gains an `inheritDir` clause
so the `%%{init}%%` directive is emitted when only that flag is set.

### Explicit vs computed — the invariant

`group.direction` is set in exactly two situations:

1. The source contained a `direction X` line inside that subgraph.
2. The user picked a concrete direction in the properties panel.

`emitGroup` writes the line only when the field is set. A subgraph that had no
`direction` line round-trips byte-identically; choosing **Not set** in the
panel clears the field and removes the line.

**The Branch 2 flip is never persisted.** The perpendicular direction is a
layout-time computation that never touches the model. Writing it back would
bake an author-looking `direction LR` into every self-contained subgraph on
the first Auto layout, and it would be sticky — on reload that subgraph would
be Branch 1 rather than Branch 2, locking in a direction that should have kept
tracking its parent.

## Parser

Match `/^direction\s+(TB|TD|BT|LR|RL)$/i` in the main line loop, **before** the
`isStructuralLine` fallback:

- `groupStack` non-empty → set on the innermost open group, normalizing
  `TD → TB`.
- top level → set `model.direction` (what Mermaid does with a bare
  `direction` statement).

`direction ` stays listed in `isStructuralLine`, so a malformed value
(`direction sideways`) still falls through to `extras` verbatim instead of
being parsed as a node declaration.

`applyInitConfig` reads `flowchart.inheritDir` as a boolean.

### Known round-trip change

A bare top-level `direction LR` currently survives in `extras` as a standalone
line. It will now fold into the header and come back as `flowchart LR`.
Semantically identical, textually different.

## Serializer

- `emitGroup` writes `direction X` as the first line inside the block when
  `group.direction` is set — before nested child groups and member
  declarations.
- `configDirective` emits `flowchart.inheritDir` alongside `nodeSpacing` /
  `rankSpacing`.

This alone fixes defect 2: the line stops escaping to the top level.

## Layout

New module `src/core/clusterLayout.ts`. `layout.ts` keeps the public API
(`autoLayout`, `resolveOverlaps`, `layoutMissing`) and delegates graph
construction and recursion to the new module, which has one job.

### Branch classification

For each group, in one pass up front:

```
descendants(g) = member node ids + all nested group ids, transitively
inside(g, id)  = id === g.id || descendants(g).has(id)
external(g)    = some edge e where inside(g, e.from) !== inside(g, e.to)
```

`inside` counting the group's own id is what reproduces Mermaid's
anchor-rewrite marking, in one predicate instead of two passes.

```
branch(g) =
  g.direction            ? COLLAPSE(g.direction)
: !external(g)           ? COLLAPSE(config.inheritDir ? model.direction
                                                      : flip(parentRankdir))
:                          FLAT
flip(d) = d === 'TB' ? 'LR' : 'TB'
```

`parentRankdir` is the resolved rankdir of the enclosing container — the
nearest COLLAPSE ancestor's direction, or `model.direction` at the root.

### Recursion

Lay out containers bottom-up. A container is the diagram root or a COLLAPSE
group. Its dagre graph holds:

- direct member nodes, at their measured `nodeSize`;
- FLAT descendant groups, expanded into this same graph as compound clusters
  via `setParent` — exactly what `dagreLayout` does today;
- COLLAPSE child groups, as a single node whose width/height come from that
  group's already-computed box (content bbox + `GROUP_PAD` and
  `GROUP_TITLE_H`, so the drawn box fits).

Edges map each endpoint to its representative in the current graph: the node
itself when it sits directly in this graph, otherwise the COLLAPSE ancestor it
was folded into. An edge whose endpoints map to the same representative is
internal to a collapsed child and is skipped. The existing `rankProxy` handling
for edges naming a FLAT group's id is preserved, as is the `edgeLabelSize`
reservation.

After the parent layout resolves a collapsed node's centre, the child's
recorded relative member positions are translated to absolute.

### Why no feature gate is needed

When every group classifies FLAT, the engine builds exactly one dagre graph
containing every node with every group as a compound cluster — the same graph
`dagreLayout` builds today. Branch-3-only diagrams are therefore unchanged by
construction, with no second code path to maintain. `autoLayout`'s existing
try/catch → `gridFallback` still guards a dagre throw, and
`materializeGroupBounds(model, true)` still re-fits every box afterwards.

### In-place relayout

`layoutGroupInPlace(model, groupId)` re-runs the engine for one group's subtree
only, then translates the result so the group box's **top-left stays where it
was**, clears stored bounds for that group and its descendants, and re-fits
them. Nothing outside the subgraph moves. This is what makes the properties
panel control show its effect immediately without discarding the user's manual
arrangement of the rest of the diagram.

## UI

`groupPanel` in `src/webview/wysiwyg/properties.ts` gains a **Direction** row:
a select with `Not set` / `TB` / `BT` / `LR` / `RL`. On change, within a single
`mutate({ commit: true })`: set or clear `group.direction`, then call
`layoutGroupInPlace`.

Below it, a hint line reporting what the current setting resolves to — e.g.
`Not set → LR (perpendicular to TB)` or `Not set → TB (shared with parent)`.
Branch 2 is surprising enough that naming it in the panel is worth one line.

No canvas badge: the arrangement of the members already shows the direction,
and a badge would need styling in both the canvas and the preview renderer for
little gain.

## Testing

- `parser.spec` — direction inside a subgraph lands on the group; `TD → TB`;
  nested subgraphs each get their own; top-level sets `model.direction`;
  malformed value falls to `extras`; `inheritDir` parses.
- `roundtrip.spec` — §4's example round-trips with the line still **inside**
  the block (regression for the relocation bug); a subgraph with no direction
  emits none.
- `layout.spec` — one test per branch: explicit direction orients members
  against the parent (Branch 1); a self-contained subgraph flips
  perpendicular (Branch 2); a subgraph with a crossing edge stays flat and
  shares the parent rankdir (Branch 3); nesting; `inheritDir` suppressing the
  flip; and an all-FLAT diagram producing today's positions.
- `properties.spec` — the Direction row exists, reflects the current value,
  and writing it sets/clears the field.

## Docs and sample

- `docs/flowchart_diff_gap.md` §4 rewritten as supported, with any remaining
  limits; quick-reference matrix row updated.
- `CHANGELOG.md` under `## [Unreleased]`: **Added** (feature + UI), **Fixed**
  (the relocation bug), **Changed** (Branch 2 parity — Auto layout will
  reorient existing self-contained subgraphs).
- `ceasg-test/subgraph-direction.md` with a diagram per branch plus a nested
  case, for manual validation in VS Code.
