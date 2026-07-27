# Subgraph rendering & editing — design

Date: 2026-07-27
Status: Approved (design), pending implementation plan

## Goal

Render Mermaid flowchart `subgraph` containers in the custom WYSIWYG renderer and
make them fully editable: create a subgraph from selected nodes, drag a whole
subgraph, drag individual nodes into/out of a subgraph, rename, ungroup, resize,
and support nested subgraphs — all with lossless round-trip to Mermaid text.

## Current state (what already exists)

Subgraphs are already modelled and round-tripped in the data layers; only the
visual/interaction layers are missing.

- **Model** (`src/core/model.ts`): `DiagramGroup { id, title, nodeIds }` —
  membership only, no stored geometry. Helpers exist: `newGroupId`, `groupOf`,
  `assignNodeToGroup`, `removeGroup`; `removeNode` already scrubs membership.
- **Parser** (`src/core/parser.ts`): parses `subgraph … end` with a `groupStack`,
  assigns membership by first-mention. Nested subgraphs are currently **flattened**
  to sibling groups (no parent relationship recorded).
- **Serializer** (`src/core/serializer.ts`): emits subgraphs with member nodes
  inside; round-trips. Flat loop, no nesting.
- **Layout** (`src/core/layout.ts`): dagre already treats groups as compound
  clusters so members stay together (one level).
- **Render** (`src/webview/wysiwyg/render.ts`): draws **only** nodes + edges. No
  group boxes or titles.
- **Interaction** (`hitTest.ts`, `pointer.ts`): no concept of a group.

## Decisions (from brainstorming)

1. **Geometry model: explicit stored bounds, with derived fallback.** Groups
   store `x/y/w/h`. When a loaded diagram has no stored geometry for a group, the
   bounds are derived from member positions (box wrapping members + padding).
2. **Nesting: supported.** A subgraph may contain nodes and other subgraphs.
   Requires a parent/child relationship on the group and nesting-aware render,
   hit-test, drag, parser, serializer, and layout.
3. **Editing ops in scope:** create-from-selection, drag whole subgraph, drag
   nodes in/out, rename, ungroup, resize.
4. **Drag semantics:** a subgraph behaves like a node — select it and drag the
   box to move the whole group (box + descendant boxes + descendant member nodes).
   Dragging a node that sits inside a subgraph moves **only the node**, not the
   box. Node membership is recomputed **only when the drag finishes** (on pointer
   up), never continuously mid-drag.

## Data model

`DiagramGroup` gains a parent pointer and optional stored geometry:

```ts
export interface DiagramGroup {
  id: string;
  title: string;
  nodeIds: string[];      // DIRECT member nodes only (not members of nested children)
  parentId?: string;      // enclosing group; undefined = top-level
  x?: number; y?: number; w?: number; h?: number;  // explicit bounds; undefined → derive on load
}
```

Containment is a **tree**: a group's children are its direct member nodes
(`nodeIds`) plus any groups whose `parentId` points at it. A node belongs to
exactly one (innermost) group. `parentId` enables nesting; the bounds provide
explicit position. `parentId` is **not** persisted in a comment — it round-trips
structurally through nested `subgraph` blocks. Only `x/y/w/h` are persisted.

### Model helpers (`model.ts`)

- `groupChildren(model, id)` → child groups (filter by `parentId`).
- `groupBounds(model, group)` → box wrapping direct member nodes **and**
  child-group boxes, plus padding. Serves as both the derived fallback (bounds
  unset on load) and the auto-fit used by create-from-selection.
- `assignNodeToGroup(model, nodeId, groupId|null)` (exists) — reused for drag
  in/out; removes from all groups then adds to one.
- `assignGroupToParent(model, groupId, parentId|null)` — new; cycle-guarded so a
  group can never become a descendant of itself.
- `removeGroup(model, groupId)` (extend) → ungroup semantics: reparent child
  groups and member nodes to this group's `parentId` (or top-level), then drop
  the group.
- `translateGroup(model, id, dx, dy)` — move the box + all descendant group boxes
  + all descendant member nodes together. Used by group-drag.
- `cloneModel` — include the new fields.

## Parsing (`parser.ts`)

- `openGroup` sets `parentId = groupStack.top?.id` so nested `subgraph` blocks
  record their parent instead of flattening. The existing `groupedNodes` set
  already ensures a node joins only its innermost group.
- New group-geometry hint comment, parsed like the existing node `pos` comment:
  `%% mermaid-flow:gpos sub1=40,20,300,180 sub2=…` (`id=x,y,w,h`).
- After parse: any group with no `gpos` hint gets its bounds derived via
  `groupBounds` (the "loaded diagram with no positioning info → derive around
  members" case).

## Serialization (`serializer.ts`)

- Replace the flat group loop with a **recursive tree walk**: emit each top-level
  `subgraph`, recurse into child groups, then emit its direct member node
  declarations, then `end`. Each node is declared exactly once, inside its
  innermost block. Edges, styles, classes, click bindings emitted afterward as
  today.
- Emit a `%% mermaid-flow:gpos …` line (guarded by `includePositions`) carrying
  each group's `x,y,w,h`.

## Rendering (`render.ts`)

- New **group layer** inserted behind edges and nodes. Draw order:
  `groupLayer → edgeLayer → nodeLayer`, so nodes stay clickable/visible and edges
  draw over the box.
- Groups render in **tree pre-order (outermost first)** so a child box paints on
  top of its parent's background.
- Each group draws `<rect class="ceasg-group">` from its bounds + a
  `<text class="ceasg-group-title">` at the top-left. `RenderRefs` gains
  `groupEls: Map<string, SVGGElement>`.
- CSS (`media/diagram.css`): subtle fill + rounded border for `.ceasg-group`,
  title styling, a `.ceasg-group-selected` state, resize-handle circles. Nested
  groups get a slightly stronger tint so depth reads.

## Hit-testing (`hitTest.ts`)

- `groupAtPoint(model, x, y)` → the **innermost** group whose box contains the
  point (deepest in the tree wins).
- Pointer priority: **node → group box → edge → background (marquee).** Nodes are
  checked first and render on top, so dragging a node inside a subgraph moves the
  node, not the box.

## Interaction (`pointer.ts`, `editor.ts`)

- **Selection**: groups have distinct string ids; extend `drawSelection` to
  outline a selected group's box and draw resize handles when a single group is
  selected.
- **Group drag**: grabbing a group box (not a node) selects + arms a group-drag
  that calls `translateGroup`. No membership change while dragging a group.
- **Node drag in/out**: only the node moves during the drag; the box stays put.
  On **pointer-up**, recompute membership via `groupAtPoint(node.center)` →
  `assignNodeToGroup` to the innermost box, or ungroup if dropped on empty canvas.
- **Group reparent on drop**: on group-drag end, if the box center lands inside
  another group (excluding itself/descendants), `assignGroupToParent`; else
  promote to top-level. Cycle-guarded.
- **Resize**: dragging a group handle updates its stored `x/y/w/h` directly.

## Creation & editing UX (`toolbar.ts`, `properties.ts`)

- Toolbar **"Group"**: enabled with ≥1 node selected → wraps them in a new
  subgraph, bounds = bbox + padding. If the selected nodes share a common parent
  group, the new group nests under it; otherwise top-level.
- Toolbar **"Ungroup"**: enabled when a group is selected → `removeGroup`.
- **Rename**: double-click the group title opens the existing inline
  `labelEditor` bound to `group.title`.
- **Delete key** on a selected group → ungroup (keep contents).
- Properties panel: when a group is selected, show title field + member count +
  Ungroup button.

## Layout (`layout.ts`)

- Set dagre `parent` for nested groups (group→parentGroup) as well as
  nodes→innermost group (dagre compound graphs support nesting). After
  `dagre.layout`, recompute each group's bounds from members so auto-layout
  refreshes boxes.

## Data flow

source text → `mermaidToModel` (build group tree, derive missing bounds) → editor
mutates model (membership + bounds) → `modelToMermaid` (nested blocks + gpos
comment) → debounced sync to the document. Lossless: structure carries nesting,
the gpos comment carries geometry.

## Testing

- **Parser specs**: nested `subgraph` → correct `parentId`; `gpos` parsed;
  missing-bounds derivation.
- **Serializer / round-trip specs** (extend `roundtrip.spec.ts`): nested blocks
  preserved, gpos emitted, node declared once in innermost block.
- **Model specs**: `groupBounds`, `assignGroupToParent` cycle guard,
  `translateGroup`, `removeGroup` reparenting.
- **hitTest spec**: `groupAtPoint` innermost-wins.
- **render spec**: group rects emitted behind nodes, pre-order nesting.
- Interaction (membership-on-drop, group drag) covered at the model/hit-test seam
  since pointer wiring isn't unit-tested today.

## Scope boundaries (YAGNI)

**In:** create-from-selection, drag group, drag node in/out, rename, ungroup,
resize, nesting, lossless round-trip.

**Out of v1:** per-subgraph `direction`, subgraph styling / classDef, delete
subgraph-with-contents, drawing an empty container box before adding nodes
(creation is selection-based).
