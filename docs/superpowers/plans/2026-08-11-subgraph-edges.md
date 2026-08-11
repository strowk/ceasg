# Edges To and From Subgraphs — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Run `pnpm test:unit` before finishing any task.

**Goal:** An edge may name a subgraph id at either end. Such diagrams parse, render, round-trip byte-for-byte, and can be drawn in the visual editor with the same gestures as node edges.

**Architecture:** `DiagramEdge.from`/`to` stay plain `string` ids; what changes is that an id may name a node *or* a group. One new core function, `endpointGeometry(model, id)`, becomes the single place that resolution happens, and the four sites that currently call `model.nodes.find(...)` on an edge endpoint go through it. `serializer.ts` needs no changes — Mermaid's syntax already makes no distinction.

**Tech Stack:** TypeScript, vitest (unit), esbuild, VS Code extension API, SVG DOM via the `getDocument()` shim.

**Spec:** `docs/superpowers/specs/2026-08-11-subgraph-edges-design.md`

## Global Constraints

- **Never import `vscode` from `src/core/` or `src/webview/`.** Core runs in three runtimes (extension host, WYSIWYG webview, Markdown preview); only the host has the API.
- **Never throw from a render path.** The Markdown preview blanks the entire code block on an uncaught exception. An unresolvable endpoint returns `undefined`/`null` and the caller skips that edge, exactly as dangling edges are skipped today.
- **`serializer.ts` is not modified.** If a task seems to need a serializer change, the model is wrong — stop and say so.
- **All existing tests must pass.** `pnpm test:unit` before finishing each task.
- **Preserve the Mermaid Flow attribution headers** on `model.ts`, `parser.ts`, `layout.ts`, `serializer.ts`.
- **Match surrounding style**: tabs in `src/core/`, two spaces in `src/webview/`. Comments explain *why*, not *what* — follow the density already in each file.

## Dependency order

```
Task 1 (model)  ─┐
Task 2 (parser) ─┼─→ Task 4 (geometry/render/hit test) ─→ Task 5 (editor UI)
Task 3 (layout) ─┘
Task 6 (example diagrams) — independent, any time
```

Tasks 1, 2, 3 touch disjoint files and may run in parallel. Task 4 needs Task 1's `endpointGeometry`. Task 5 needs Task 4's `edgePathD` signature.

---

## Task 1 — Core model: the endpoint union

**Files:** `src/core/model.ts`, `src/core/index.ts`, `src/core/model.spec.ts`

- [ ] Add `endpointGeometry(model, id)` returning `{ x, y, w, h } | undefined`, where `x`/`y` are the **centre** (matching `DiagramNode.x/y` convention, *not* `groupBounds`' top-left origin):
  - node id → centre and `nodeSize(model, node)`
  - group id → `groupBounds(model, group)` converted to centre: `x + w/2`, `y + h/2`
  - neither → `undefined`
  - A node id wins if both somehow exist, so behaviour stays defined even if the disjointness invariant is ever violated.
- [ ] Add `isGroupId(model, id): boolean`. (`editor.ts` has a private method of this name; core's is the shared one — do not delete the editor's in this task, Task 5 handles it.)
- [ ] Widen `nextNodeId(model)` to avoid group ids too, and `newGroupId(model)` to avoid node ids too. Node ids and group ids must be disjoint, because an edge endpoint id is now ambiguous.
- [ ] In `removeGroup(model, groupId)`, drop every edge touching the group: `model.edges = model.edges.filter(e => e.from !== groupId && e.to !== groupId)`. Member nodes and child groups still reparent exactly as today. Add a comment saying why edges are dropped rather than reattached: reattaching to the parent would invent a connection the user never drew.
- [ ] Export `endpointGeometry` and `isGroupId` from `src/core/index.ts` alongside the other model exports.
- [ ] Tests in `model.spec.ts`: `endpointGeometry` for a node, for a group with stored bounds, for a group with derived bounds, and for an unknown id; `removeGroup` drops attached edges but leaves unrelated ones; `nextNodeId` skips an id taken by a group and `newGroupId` skips an id taken by a node.

## Task 2 — Parser: post-parse reconciliation

**Files:** `src/core/parser.ts`, `src/core/parser.spec.ts`, `src/core/roundtrip.spec.ts`

Today `ensureNode` invents a placeholder node for a subgraph id used as an edge endpoint, and the serializer writes it back as a bogus `S1["S1"]` declaration. The line loop stays as-is — a forward reference (`S1 --> D` written *before* `subgraph S1`) means resolution cannot happen inline.

- [ ] Change the empty-group filter (currently `parser.ts:646`, "Drop groups with no members AND no child groups") to also keep a group that is referenced by an edge endpoint. Without this, `subgraph S1 \n end` plus `S1 --> D` drops the group and keeps the phantom.
- [ ] After that filter, add a reconciliation pass:
  - Build the set of surviving group ids.
  - Remove from `model.nodes` every node whose id is in that set. Edges keep pointing at the id — they now resolve to the group.
  - Strip those ids from every group's `nodeIds` (a subgraph id can be mentioned inside another subgraph's body).
  - Do not apply a `mermaid-flow:pos` hint to a removed node. Simplest ordering: run reconciliation *before* the "apply saved position hints" loop, so the phantom is already gone.
  - `click <id> "..."` targeting a group id no longer finds a node, so it falls through to `model.extras` and round-trips verbatim. That is the desired behaviour — no extra code, but confirm it with a test.
- [ ] Tests in `parser.spec.ts`:
  - `subgraph S1 … end` + `S1 --> D`: no node with id `S1`; one edge `S1 → D`; the group survives with its members.
  - Forward reference: `S1 --> D` written *before* the `subgraph S1` block gives the identical model.
  - `subgraph -> subgraph` between two groups.
  - `node -> subgraph` direction.
  - An empty subgraph referenced by an edge survives the empty-group filter.
  - A subgraph id used as an edge endpoint that is *also* listed inside another subgraph body does not linger in that group's `nodeIds`.
  - `click S1 "https://x"` on a group id lands in `extras`.
- [ ] Test in `roundtrip.spec.ts`: a diagram with a subgraph edge parses and re-serializes to the same text, and **the output contains no `S1["S1"]` line**. This is the regression that motivated the work — make the assertion explicit about it.

## Task 3 — Auto layout: proxy group endpoints

**Files:** `src/core/layout.ts`, `src/core/layout.spec.ts`

`dagreLayout` currently skips any edge whose endpoints are not both nodes (`layout.ts:86`), so a subgraph edge does not influence ranking at all and the subgraph lands as if unconnected. dagre cannot accept an edge incident to a cluster node, so the fix is a proxy, not a direct edge.

- [ ] Add a local resolver: an id that is a node maps to itself; an id that is a group maps to the first entry of `groupDescendantNodeIds(model, id)` (already exported from `model.ts`); anything else maps to `undefined`.
- [ ] In the edge loop, map both endpoints through it and `g.setEdge` the results. Skip when either side resolves to `undefined` (a group with no descendant nodes), or when both resolve to the same node.
- [ ] Comment why this is a proxy: it exists so a connected subgraph ranks near its neighbours after Auto layout; it is an approximation, not exact cluster routing.
- [ ] Tests in `layout.spec.ts`: a `subgraph -> node` edge influences the layout (the subgraph's members and the target are not placed as unrelated components); a group with no descendant nodes does not throw.

## Task 4 — Geometry, render, hit test

**Files:** `src/webview/wysiwyg/edgePath.ts`, `render.ts`, `hitTest.ts`, `editor.ts` (one call site only), plus `edgePath.spec.ts`, `render.spec.ts`, `hitTest.spec.ts`

**Depends on Task 1.**

- [ ] In `edgePath.ts`, extract the box-math tail of `nodeBorderPoint` (the `hw`/`hh`/`scale` block) into a small shared helper taking centre + size. `nodeBorderPoint(model, node, tx, ty)` **keeps its current node-based signature and behaviour**, including the shape-outline ray cast — `edgePath.spec.ts` has a dozen tests against it and they must keep passing unchanged.
- [ ] Add `endpointBorderPoint(model, id, towardX, towardY): { x, y } | undefined` — delegates to `nodeBorderPoint` for a node id; for a group id uses `endpointGeometry` plus the extracted box helper (a group box is a plain rect, so no outline logic).
- [ ] Change `edgePathD(model, fromId, toId, dir, offset?)` and `selfLoopPathD(model, id, dir)` to take **ids** instead of `DiagramNode`, returning `string | null` (`null` when either endpoint is unresolvable). Update the one `edgePathD` test in `edgePath.spec.ts` to pass ids.
- [ ] Update the three consumers to pass ids and skip on `null`:
  - `render.ts:70` `renderEdge` — resolve via `endpointGeometry`, return `null` if either side is missing (it already returns `null` for dangling edges).
  - `hitTest.ts:37` `edgeAtPoint` — same, `continue` on unresolvable.
  - `editor.ts:262` (double-click-to-edit-edge-label) — same, `return` on unresolvable. **Touch only this call site**; leave `drawSelection` alone, it is Task 5's.
- [ ] Confirm no change is needed to z-order (`renderDiagram` already paints group layer → edge layer → node layer, so an edge to a subgraph draws over the box fill and under member nodes) or to `computeContentBounds` (already unions nodes and group boxes). State in the task notes that you verified both rather than assuming.
- [ ] Tests: `render.spec.ts` — an edge to a group produces a path whose endpoint lies on the group's box border; an edge with an unknown endpoint is skipped without throwing. `hitTest.spec.ts` — a point on an edge-to-group path returns that edge id.

## Task 5 — Editor UI: anchors and gestures

**Files:** `src/webview/wysiwyg/overlay.ts`, `editor.ts`, `pointer.ts`, `properties.ts`, `hitTest.ts`, `media/webview.css`, plus `hitTest.spec.ts`

**Depends on Task 4.**

- [ ] `hitTest.ts`: add `groupAnchorPoints(model, groupId)` returning the four **edge-midpoint** points of the group box (N/S/E/W), mirroring `nodeAnchorPoints`. Corner resize handles and edge midpoints never coincide, so no priority rule is needed between them.
- [ ] `overlay.ts`: give `handle(cx, cy, r)` an optional kind — `'connect'` (default) keeps class `ceasg-handle`, `'resize'` adds `ceasg-handle-resize`.
- [ ] `media/webview.css`: `.ceasg-handle` is currently hollow (background fill, focus-border stroke). Add `.ceasg-handle-resize { fill: var(--vscode-focusBorder); }` so **solid = resize, hollow = connect**. Without this a selected subgraph shows eight indistinguishable dots.
- [ ] `editor.ts` `drawSelection` (currently lines 299–311): pass `'resize'` for the existing group corner handles, and add the four group connect anchors from `groupAnchorPoints`. Node anchors stay `'connect'`.
- [ ] `pointer.ts`:
  - `onDown`: when `selection.single` is a group, check the resize corners first (existing behaviour, unchanged), then the connect anchors; a hit on an anchor starts a connect with the **group id** as `connectFrom` and the anchor point as `connectFromPt`.
  - Drop-target resolution — introduce one helper used by **both** the anchor-drag release path (`pointer.ts:318`) and connect mode (`pointer.ts:137`): `nodeAtPoint(...) ?? groupAtPoint(...)`. Node wins; otherwise the innermost enclosing subgraph; otherwise cancel.
  - Connect mode's first click uses the same helper, so a subgraph can be the source there too.
  - Keep refusing self-edges (`target !== connectFrom`), which also covers subgraph self-loops — a non-goal.
- [ ] `properties.ts` `edgePanel` (line 156): the header prints raw `from → to` ids. Resolve each through node label / group title so it reads `Pipeline → Report` rather than `S1 → D`. Fall back to the raw id if neither resolves.
- [ ] `editor.ts`: its private `isGroupId` now duplicates core's — use the core one and delete the private method.
- [ ] Tests in `hitTest.spec.ts`: `groupAnchorPoints` returns the four box edge midpoints for stored and derived bounds.

## Task 6 — Example diagrams

**Files:** `examples/subgraph-edges.md`

Independent of the code tasks.

- [ ] Follow the exact format of `examples/subgraphs.md`: an intro paragraph pointing at F5 + the `◇ Open visual editor` CodeLens, then `## N. Title` sections each with a one-line **Test:** sentence and a ```mermaid block.
- [ ] Do **not** add `%% ceasg:{"id":...}` markers or `pos`/`gpos` comments to the new blocks — those are written by the editor on save. Sections that specifically test saved geometry may include them; a fresh diagram should not.
- [ ] Cover: `subgraph -> node`; `node -> subgraph`; `subgraph -> subgraph`; a forward reference (edge line written before the `subgraph` block); nested subgraphs with an edge to the inner one; a labelled subgraph edge (`S1 -->|deploys| D`); an edge drawn *in the editor* from a subgraph anchor; and a save-and-inspect section whose Test line says to confirm no `S1["S1"]` declaration appears in the written-back Mermaid.

---

## Verification

- [ ] `pnpm run check-types`
- [ ] `pnpm run lint`
- [ ] `pnpm test:unit`
- [ ] `pnpm run package` and build the `.vsix`
