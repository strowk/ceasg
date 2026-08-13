# ceasg Roadmap

A single prioritized worklist that merges the two analysis docs into
ready-to-paste prompts. Each section below is **one shippable item**. Pick the
topmost item you have appetite for, copy its prompt block, and paste it to
Claude to brainstorm + implement as usual.

**Source docs**
- `flowchart_diff_gap.md` — gaps in the existing flowchart visual editor (FG#n)
- `diagram_types_visual_editing.md` — making *other* diagram types visually editable (DT#n)

**How this list is ordered.** Quick, high-impact fixes that make the current
flowchart editor honestly WYSIWYG come first (they're cheap and remove
"lies on the canvas"). Then the subgraph cluster (used constantly), then edge
semantics and the shape library, then the first new diagram type (state — highest
reuse), then richer new types and the niche/decorative tail. Reorder freely to
match what you feel like building on a given day.

**Done so far.** #4 Subgraph create/edit/delete UI and #5 Nested subgraphs both
shipped in **v0.3.0**. Next open item is #1 (edge style rendering); the remaining
subgraph work is #6 (edges to/from a subgraph + styling) and #7 (per-subgraph
direction). Preview positioned rendering also shipped (v0.2.0) but isn't tracked
as an FG#/DT# item here.

---

## 1. Render edge color / width / font on the canvas  (FG#6) ✅ DONE

Highest bang-for-buck: parsing and a color picker already exist — only the
renderer ignores `edge.style`. Likely a small, satisfying win.

```
Read section 6 of `flowchart_diff_gap.md` ("Edge line color / width / font not drawn on the canvas"). The style is already parsed and there's a Line color picker — the gap is that render.ts › renderEdge never applies edge.style. Brainstorm the approach with me, then implement it (stroke color, stroke-width, dasharray, label font-size/color). Add a test diagram under ceasg-test and build the vsix when done.
```

---

## 2. Render node font size / family / stroke-width / dash  (FG#7) ✅ DONE

Same class of fix as #1 but for nodes: model already round-trips these, the
renderer only applies fill/stroke/color. Add rendering + pickers.

```
Read section 7 of `flowchart_diff_gap.md` ("Node font size / family and advanced style props not drawn"). Brainstorm then implement: make the canvas renderer honor font-size, font-family, stroke-width and stroke-dasharray, and add UI pickers for the ones that lack them. Add a ceasg-test diagram and build the vsix.
```

---

## Better picker for adding new nodes (i.e dragging shape from palette) ✅ DONE

...not 

## Icon shape nodes

```
3. Portability caveat. A diagram using mdi:server renders as a blue ? anywhere the pack isn't registered — GitHub, most viewers, mermaid.live. Inside ceasg it'll be perfect. Worth a README note; not a blocker.
```

## Image shape nodes

Not very clear how to give right url there..

---

## 3. Markdown / HTML formatted labels  (FG#5) ✅ DONE

Everyday authoring pain — bold/italic/line-wrap show as literal backticks and
asterisks today.

```
Read section 5 of `flowchart_diff_gap.md` ("Markdown-formatted and HTML labels"). Brainstorm then implement rendering of markdown string labels (`**bold**`, `_italic_`, wrapping) and basic HTML markup (<b>, <i>, entities) in node/edge labels, plus a label editor that supports them. Add a ceasg-test diagram and build the vsix.
```

---

## 4. Subgraph create / edit / delete UI  (FG#2)  ✅ DONE (v0.3.0)

Subgraphs round-trip but you can't create or restructure them from the canvas.
Foundational for everything subgraph-related below.

**Shipped in v0.3.0:** create a subgraph from the current selection, ungroup it
(keeping contents), rename by double-clicking the title, add/remove members by
dragging nodes in/out, drag the whole container to move it, and resize with corner
handles. Subgraph geometry persists via `%% mermaid-flow:gpos %%` and round-trips
losslessly.

```
Read section 2 of `flowchart_diff_gap.md` ("No subgraph creation / editing UI"). Brainstorm then implement UI to create a subgraph, rename it, add/remove members, and delete it. Add a ceasg-test diagram and build the vsix.
```

---

## 5. Nested subgraphs  (FG#1)  ✅ DONE (v0.3.0)

Model change: `DiagramGroup` is a flat list with no parent/child, so nesting is
flattened and lost. Do after #4 since they share the subgraph model.

**Shipped in v0.3.0:** nested subgraphs render as nested containers, drag a parent
subgraph to move its nested children with it, and nesting round-trips losslessly
(including the `%% mermaid-flow:gpos %%` geometry).

```
Read section 1 of `flowchart_diff_gap.md` ("Nested subgraphs"). This needs the group model to gain parent/child relationships so nesting parses, renders as nested containers, and round-trips. Brainstorm the model + rendering approach with me first, then implement. Add a ceasg-test diagram and build the vsix.
```

---

## 6. Edges to/from a subgraph + subgraph styling  (FG#3) ✅ DONE

Using a subgraph id as an edge endpoint or style target currently fabricates a
phantom node. Depends on the subgraph work above.

```
Read section 3 of `flowchart_diff_gap.md` ("Edges to/from a subgraph, and subgraph styling"). Brainstorm then implement: let a subgraph id be a real link endpoint (no phantom node) and let style/class target the container with visible fill/stroke. Add a ceasg-test diagram and build the vsix.
```

---

## 7. Per-subgraph direction  (FG#4)

`direction LR` inside a subgraph is preserved as text but ignored by layout.

```
Read section 4 of `flowchart_diff_gap.md` ("Per-subgraph direction"). Brainstorm then implement per-subgraph direction so a `direction` line inside a subgraph actually lays out its members, with UI to set it. Add a ceasg-test diagram and build the vsix.
```

---

## 8. Circle and cross arrowheads (`--o`, `--x`)  (FG#9)

These currently fail to parse as edges at all — the connection just disappears.

```
Read section 9 of `flowchart_diff_gap.md` ("Circle and cross arrowheads"). Brainstorm then implement parsing, rendering, and a UI selector for circle (--o) and cross (--x) endpoints in one- and two-directional forms. Add a ceasg-test diagram and build the vsix.
```

---

## 9. Bidirectional thick / dotted links (`<==>`, `<-.->`)  (FG#10)

Separate the "kind" and "line-style" dimensions so any combination is authorable.

```
Read section 10 of `flowchart_diff_gap.md` ("Bidirectional thick / dotted links"). Brainstorm then implement: parse/render <==> and <-.->, and split the single edge-kind dropdown into direction + line-style so thick/dotted/bidirectional combine freely. Add a ceasg-test diagram and build the vsix.
```

---

## 10. Link length / rank hints (`--->`, `====>`)  (FG#11)

Model the extra-dash rank-span so layout distance survives.

```
Read section 11 of `flowchart_diff_gap.md` ("Link length / rank hints"). Brainstorm then implement modeling of link length (extra dashes/equals) affecting layout rank, with UI to set it. Add a ceasg-test diagram and build the vsix.
```

---

## 11. Mermaid v11 shape library (`@{ shape: … }`)  (FG#8) ✅ DONE

The ~30 new shapes silently degrade to rect and are lost on save. Big scope —
brainstorm which shapes to prioritize.

```
Read section 8 of `flowchart_diff_gap.md` ("Node shapes — the entire Mermaid v11 shape library"). Brainstorm with me which of the ~30 v11 shapes to add first and how to model them so they render, are selectable from the palette, and round-trip losslessly. Then implement the first batch. Add a ceasg-test diagram and build the vsix.
```

---

## 12. Visual editing for state diagrams (`stateDiagram-v2`)  (DT#1)

First new diagram type — highest engine reuse ("flowchart with a different node
vocabulary"). Biggest single expansion of scope.

```
Read section 1 of `diagram_types_visual_editing.md` ("State diagram"). Brainstorm with me how to reuse the flowchart canvas for stateDiagram-v2 — start/end pseudo-states ([*]), transitions, composite states, fork/join — then implement a first version. Add a ceasg-test file with state diagrams and build the vsix.
```

---

## 13. `linkStyle default` + curve / global flowchart config  (FG#12)

```
Read section 12 of `flowchart_diff_gap.md` ("linkStyle default and curve/global flowchart config"). Brainstorm then implement support for `linkStyle default`, plus modeling/rendering of flowchart config like curve style — with UI where it makes sense. Add a ceasg-test diagram and build the vsix.
```

---

## 14. Native edge IDs + standard animation (`e1@{ … }`)  (FG#13)

Replace the non-standard animation marker with Mermaid's native edge IDs.

```
Read section 13 of `flowchart_diff_gap.md` ("Explicit edge IDs and edge metadata"). Brainstorm then implement parsing/round-trip of native edge IDs (A e1@--> B) and @{ } edge metadata, and migrate the Animated checkbox to emit standard-Mermaid animation. Add a ceasg-test diagram and build the vsix.
```

---

## 15. Visual editing for class diagrams (`classDiagram`)  (DT#2)

Reuses the canvas but needs a net-new node-internals editor (members,
visibility, relationship endpoints/cardinality).

```
Read section 2 of `diagram_types_visual_editing.md` ("Class diagram / UML"). Brainstorm with me the class-box internals editor (fields/methods/visibility) and the richer relationship endpoints (inheritance/composition/aggregation), then implement a first version. Add a ceasg-test file and build the vsix.
```

---

## 16. Visual editing for ER diagrams (`erDiagram`)  (DT#3)

Shares the "box with attribute list" editor from #15; the big win is a
crow's-foot cardinality picker.

```
Read section 3 of `diagram_types_visual_editing.md` ("Entity–Relationship diagram"). Reuse the attribute-list editor from the class-diagram work if present. Brainstorm then implement entities with attribute lists and a visual crow's-foot cardinality picker (one/many/optional). Add a ceasg-test file and build the vsix.
```

---

## 17. Click callbacks, tooltips, and link target windows  (FG#14)

```
Read section 14 of `flowchart_diff_gap.md` ("Interaction: click callbacks, tooltips, and link target windows"). Brainstorm then implement UI + rendering for tooltips, _blank/target-window links, and (at least round-tripping) callback bindings. Add a ceasg-test diagram and build the vsix.
```

---

## 18. Node icons and images (`@{ icon: … }`, `@{ img: … }`)  (FG#15)

```
Read section 15 of `flowchart_diff_gap.md` ("Node icons and images"). Brainstorm then implement icon nodes and image nodes (parse, round-trip, render), plus fa:/fab: icon tokens in labels. Add a ceasg-test diagram and build the vsix.
```

---

## 19. Accessibility metadata (`accTitle`, `accDescr`)  (FG#16)

Small, self-contained — surface and edit the accessible title/description.

```
Read section 16 of `flowchart_diff_gap.md` ("Accessibility metadata"). Brainstorm then implement parsing, a small editor field, and round-trip for accTitle and accDescr. Add a ceasg-test diagram and build the vsix.
```

---

## 20. Later-wave new diagram types  (DT#4–#10)

Reassess after state/class/ER land. In priority order per
`diagram_types_visual_editing.md`: Block (`block-beta`, DT#4) → C4 (DT#5) →
Requirement (DT#6) → Architecture (`architecture-beta`, DT#7) → Mindmap (DT#8)
→ Kanban (DT#9) → Gantt (DT#10). Sequence, git graph, journey, pie and the
data-driven charts stay text + live preview.

```
Read `diagram_types_visual_editing.md` section <N> for <diagram type>. Brainstorm with me whether it's worth doing now given current demand and how much of the existing canvas it reuses, then plan a first version if we proceed.
```
