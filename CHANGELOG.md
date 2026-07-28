# Change Log

All notable changes to the "ceasg" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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