# Change Log

All notable changes to the "ceasg" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.7.0] - Unreleased

### Added
- **Edges to and from subgraphs.** A diagram can connect a whole subgraph to a node, a node to a subgraph, or one subgraph to another — `S1 --> D` where `S1` is a subgraph id, in either direction and in both positions. Diagrams written by hand now render instead of being mangled, and edges can be drawn in the visual editor: select a subgraph and drag from one of the four hollow connect anchors at its box edges. Releasing over a member node targets that node; releasing over a subgraph's empty interior, border or title targets the subgraph. Connect mode (`↳`) accepts a subgraph at either end too.
- Subgraph handles now read at a glance: hollow circles at the box edge midpoints create edges, solid circles at the corners resize.
- All 48 Mermaid v11.3.0 node shapes are now supported, up from 14.
- Shapes are grouped into six families in the palette, dropdown and sidebar.
- Node syntax is preserved: nodes written as `A[Label]` stay that way, and `@{…}` attributes ceasg does not model are round-tripped untouched.
- Degraded rendering is reported to a new **ceasg** output channel.
- **Wheel and trackpad panning** on the visual editor canvas. Scroll or swipe with two fingers to pan in any direction; hold `Shift` to pan horizontally with a mouse wheel. `Ctrl`/`Cmd` + wheel still zooms, and trackpad pinch-to-zoom now works too.
- The canvas shows a **grab cursor** while space-drag panning is armed, and a grabbing cursor once panning is active (including middle-button drag, which has no separate armed phase).

### Changed
- Fixed-size marker shapes — fork/join, start, junction, collate and communication link — no longer draw their label across the shape. These size themselves without reference to the label, so the text had nowhere to go; Mermaid drops it for the same shapes. The label is still stored, still editable in the properties panel, and still written back to the diagram.
- Panning now stops at the edge of the diagram instead of scrolling it off-screen. Push past the edge and the canvas resists, then springs back, always leaving part of the diagram in view. Applies to every pan gesture, including the existing space-drag and middle-button drag.

### Fixed
- A subgraph named as an edge endpoint is no longer turned into a stray box. `S1 --> D`, where `S1` is a subgraph, used to invent a rectangle node sharing the subgraph's id, draw it over the diagram, and write an `S1["S1"]` declaration back into the Markdown file that the source never had. The edge now attaches to the subgraph itself, and the diagram round-trips unchanged. This works whether the edge is written before or after the `subgraph` block.
- `style` and `class` lines targeting a subgraph id are preserved instead of being dropped on save.
- Auto layout no longer ignores edges attached to a subgraph, so a connected subgraph is placed near its neighbours rather than as if it had no connections.
- Shape palette icons draw their stroke-only detail again. They were styled by a class no stylesheet defined, so they fell back to a black fill and no stroke: every comment shape was invisible, as were the divider lines inside the framed, lined and windowed shapes and the inner ring of a double circle. Icons now use the same styling as the canvas, so a preview matches the node it inserts.
- Shape names ceasg does not recognise no longer lose their original shape name. They still draw as a rectangle, but the name is kept and written back unchanged instead of being replaced with `rect`.
- Holding space and switching away from the editor no longer leaves the canvas stuck in pan mode.

## [0.6.0] - 2026-07-29

### Added
- A collapsible **shape palette sidebar** on the left of the visual editor, showing shapes in expandable groups (one group, **Basic**, for now). Click a shape to add it, or drag it onto the canvas. Toggle the whole sidebar with the `◧` toolbar button. The toolbar's shapes dropdown is unchanged and still available.

### Changed
- A newly added node is now selected automatically, so the properties panel targets it right away. Applies whether the node came from the sidebar, the dropdown, or a drag-and-drop.
- Clicking a shape in the toolbar dropdown now places it at the canvas centre and cascades down-right if that spot is taken, so repeated clicks no longer stack nodes on one point.

### Fixed
- The canvas no longer distorts when the editor pane is resized. The `viewBox` was derived from the pane's size but never recomputed, so after a resize the diagram letterboxed and clicks landed on the wrong nodes until the next zoom or pan.

## [0.5.0] - 2026-07-28

### Added
- Node styling now renders on the visual canvas: `font-size`, `font-family`, `stroke-width` and `stroke-dasharray` (from a `style` line, a `classDef`, or the properties panel) are drawn on the node and its label.
- Node boxes resize to fit their font, so a large label stays inside its shape — including non-rectangular shapes and multi-line labels, whose line spacing now follows the font size.
- Properties panel gains **Font size**, **Font**, **Border width** and **Border dash** controls for the selected node, and mirrors all four in the multi-select panel alongside the existing color pickers.
- Node `stroke-width` and `stroke-dasharray` are now first-class style properties and round-trip losslessly instead of being preserved as opaque extras.

### Changed
- Unstyled node labels draw at 16px Trebuchet — the font node boxes have always been measured in, and Mermaid's own flowchart default — instead of 14px in the VS Code UI font. Boxes are unaffected; the canvas now matches the rendered diagram more closely.

### Fixed
- Numeric properties-panel fields (node **Font size** / **Border width**, edge **Line width** / **Label size**) seed from the value the canvas actually renders, shown dimmed until edited, so stepping an unset field starts from the effective default instead of jumping to the minimum.
- Diamond nodes size to keep their label inside the rhombus. Because a diamond narrows toward its points, fixed padding left long or multi-line labels overflowing the sloped edges even at the default font size.
- Node font properties inherited from a `classDef` are honored everywhere geometry is computed — hit testing, connection handles, edge endpoints, auto layout and fit-to-view — so a class-styled node's box and its interactions agree.

## [0.4.0] - 2026-07-28

### Added
- Edge styling now renders on the visual canvas: per-edge line color, line width, and dash pattern (from `linkStyle` or the properties panel) are drawn on the edge, and edge labels honor their font size and color.
- Properties panel gains **Line width**, **Dash** (Solid/Dashed/Dotted), **Label size**, and **Label color** controls for the selected edge.
- Edge dash pattern (`stroke-dasharray`) is now a first-class style property and round-trips losslessly.

### Fixed
- A selected edge always shows the selection highlight, even when it has a custom line color.

## [0.3.0] - 2026-07-28

### Added
- Subgraph support in the visual flowchart editor: subgraph containers now render as boxes with titles behind their member nodes, including nested subgraphs.
- Create a subgraph from the current node selection, ungroup it (keeping its contents), and rename it by double-clicking the title.
- Drag a whole subgraph to move it with all its members and nested subgraphs; drag individual nodes in or out of a subgraph to change membership (applied when the drag ends); resize a subgraph with its corner handles.
- Subgraph geometry persists via a `%% mermaid-flow:gpos %%` comment and round-trips losslessly, including nesting.

## [0.2.0] - 2026-07-27

### Added
- Positioned rendering in VS Code's built-in Markdown preview: flowcharts render with their manual `%% mermaid-flow:pos %%` layout — the same image as the visual editor — while all other diagram types render normally via Mermaid. ceasg acts as the sole Mermaid renderer for the preview (remove/disable any other Mermaid preview extension).
- Flowcharts without saved positions are auto-laid-out (dagre) in the preview, matching the editor's "Auto layout".
- Setting `ceasg.previewRendering` (default `on`) to toggle preview rendering.
- Diagrams re-render live as the Markdown document is edited, and each diagram's errors are isolated so one bad block can't blank the preview.

## [0.1.1] - 2026-07-26

### Changed
- Added an animated demo to the README and Marketplace listing.

## [0.1.0] - 2026-07-26

### Added
- Initial release of visual Mermaid editor.
- CodeLens integration on every `mermaid` code block in Markdown files.
- Dual-mode editing: WYSIWYG flowchart canvas with drag/drop, select, connect, shape/color controls, and auto-layout; live preview for all other diagram types.
- Two-way sync: editor→Markdown write-back and Markdown→editor pull on save.
- Layout persistence via hidden `%% mermaid-flow:pos %%` comments (cross-compatible with Obsidian mermaid-flow plugin).
- Block identity tracking with hidden `%% ceasg:{"id":...} %%` markers.
- Full WYSIWYG feature set: multi-select, marquee, drag, connect, delete, undo/redo, nudge, select-all, inline labels, shape selection, edge kind controls (solid/dashed), color/style inline editing, direction + auto-layout, zoom/fit viewport, properties panel.