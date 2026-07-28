# Shape Palette Sidebar — Design

Date: 2026-07-28
Status: approved

## Problem

New nodes can only be added from a toolbar dropdown (`ShapePalette`, a fixed-position
popover anchored under the `⬡` toolbar button). It works — click an item to add at
viewport centre, or drag an item onto the canvas — but it is transient: the popover
closes after every add, and there is no persistent surface for the shape vocabulary to
grow into. Future work wants extra groups ("Image Shapes" with preloaded image
collections, icon packs), which a dropdown cannot host comfortably.

## Goal

Add a persistent left sidebar "palette" showing shapes in expandable groups, as an
**alternative** to the existing dropdown. The dropdown stays exactly as it is today.
Only one group is in scope: **Basic**, holding the 14 shapes in `NODE_SHAPES`.

## Non-goals

- Image shapes, icon packs, or any second group. The structure must accommodate them;
  the feature must not ship them.
- Search/filter over palette items. 14 items do not need it.
- Resizable sidebar width, or an activity-bar-style icon rail when collapsed.
- Replacing or deprecating the toolbar dropdown.

## Decisions

| Question | Decision |
|---|---|
| Default state | Open, collapsible. State persists for the webview session only. |
| Item layout | Icon grid, 3 columns, name in the tooltip. ~140px fixed width. |
| Click on an item | Add at viewport centre; if occupied, cascade down-right until free. |
| Collapsed appearance | Fully hidden; canvas takes the full width. Toolbar button toggles. |
| Code structure | Shared group registry consumed by both the sidebar and the dropdown. |

## Architecture

### New modules

**`src/webview/wysiwyg/paletteModel.ts`** — the registry both UIs read.

```ts
export interface PaletteItem {
  id: string;                                    // 'shape:rect'
  title: string;                                 // 'Rectangle'
  createIcon(): SVGElement;                      // createShapeIcon(shape)
  dragType: string;                              // 'text/ceasg-shape'
  dragData: string;                              // 'rect'
  add(editor: WysiwygEditor, at?: { clientX: number; clientY: number }): void;
}

export interface PaletteGroup {
  id: string;
  title: string;
  items: PaletteItem[];
}

export const PALETTE_GROUPS: PaletteGroup[];     // one entry today: 'basic' / 'Basic'
export function createPaletteItemButton(
  item: PaletteItem,
  onActivate: (item: PaletteItem) => void,
): HTMLButtonElement;
```

`add()` is a method on the item rather than a `switch` on shape at the call site. A
future image-shape item needs a different model mutation; with `add()` on the item, the
sidebar and the dropdown call `item.add(...)` and neither has to change.

`createPaletteItemButton` produces the `<button class="ceasg-palette-item">` with the
icon appended, `title` set, `draggable = true`, a `dragstart` handler writing
`item.dragData` under `item.dragType`, and a `click` handler calling `onActivate(item)`.
Both UIs use it, so items are pixel-identical and the drag payload has one definition.

**`src/webview/wysiwyg/sidebar.ts`** — `ShapeSidebar`.

Constructor `(host: HTMLElement, editor: WysiwygEditor)`. Renders one section per
`PALETTE_GROUPS` entry: a header `<button class="ceasg-sidebar-group-header">` carrying
the group title and a chevron, and a body `<div class="ceasg-sidebar-group-body">`
holding the item grid. Header click toggles `.is-collapsed` on the section and flips
`aria-expanded`. Public `toggle(force?: boolean): boolean` shows/hides the whole sidebar
and returns the new open state. Open/collapsed state lives on the instance — webview
session only, no persistence to VS Code state.

**`src/core/placement.ts`** —
`findFreeSpot(model: DiagramModel, x: number, y: number, shape: NodeShape): { x: number; y: number }`.

Pure, no DOM. Starting at `(x, y)`, sizes the candidate with `nodeSize` for `shape` and
tests its box against every existing node's box inflated by a small gap. On overlap,
steps `+24, +24` in svg units and retries. Caps at 40 steps and returns the last
candidate rather than looping forever. Exported from `src/core/index.ts`.

### Changed modules

**`palette.ts`** — the dropdown stops constructing items itself. It renders
`PALETTE_GROUPS.flatMap(g => g.items)` through `createPaletteItemButton`, ignoring group
structure so it looks and behaves exactly as it does today (flat 4-column grid, closes
after a click).

**`editor.ts`** —

- Body markup gains a sidebar host as the first flex child:
  `<div class="ceasg-body"><div id="sidebar"></div><div class="ceasg-canvas" id="canvas"></div><div id="panel"></div></div>`
- `ShapeSidebar` is built once behind a `sidebarBuilt` guard, matching the existing
  `toolbarBuilt` / `panelBuilt` pattern (so `applyExternal → init` does not re-create it).
- New `toggleSidebar(force?: boolean): boolean` delegating to the sidebar.
- New `addNodeAtFreeSpot(shape: NodeShape): void` (see Behavior).
- A single `ResizeObserver` on `canvasHost`, created in the constructor (see Viewport).

**`toolbar.ts`** — a `◧` button titled "Toggle shape palette", using the same
`is-active` class pattern as the connect-mode button, reflecting sidebar open state.

**`viewport.ts`** — new `resize(): void` that re-runs `apply()`.

**`media/webview.css`** — `.ceasg-sidebar`, `.ceasg-sidebar-group`,
`.ceasg-sidebar-group-header`, `.ceasg-sidebar-group-body`.

## Layout and styling

`.ceasg-sidebar` is a fixed 140px flex child placed before the canvas inside
`.ceasg-body`, mirroring `.ceasg-panel` on the right: `border-right: 1px solid
var(--vscode-panel-border)`, `background: var(--vscode-sideBar-background)`,
`overflow-y: auto`, `box-sizing: border-box`.

The group body is `display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px`,
reusing the existing `.ceasg-palette-item` rules so sidebar and dropdown items render
identically. `.is-collapsed .ceasg-sidebar-group-body { display: none; }`.

Hiding the sidebar sets `display: none` on `.ceasg-sidebar`; the canvas flex child
reclaims the width.

## Behavior

### Drag to canvas

Unchanged. Sidebar items set `text/ceasg-shape` on `dragstart`, and the existing
`drop` handler on `canvasHost` in `editor.ts` calls
`addNodeOfShape(shape, e.clientX, e.clientY)` — the node lands exactly where it is
dropped.

### Click to add

`addNodeAtFreeSpot(shape)`:

1. Take the canvas host's centre in client coords, convert with `viewport.screenToSvg`.
2. Run `findFreeSpot(model, x, y, shape)`.
3. Mutate: push the node at that point, `{ commit: true }`.

Applies to both the sidebar and the dropdown, so repeated clicks never stack nodes.

### Selection of new nodes

The shared add path selects the newly created node, so the properties panel targets it
immediately. This applies to the dropdown and drop paths too, not only the sidebar — an
intentional, approved change to current behavior.

## Viewport resize fix

`Viewport.apply()` computes the `viewBox` from `host.clientWidth/clientHeight`, but
nothing recomputes it when the host resizes — there is no `ResizeObserver` or `resize`
listener anywhere in `src/webview/`. Today this bites when the VS Code pane is resized:
the diagram letterboxes and `screenToSvg` returns wrong coordinates until the next
zoom/pan. Toggling the sidebar changes the canvas width the same way, so the feature
would hit it on every toggle.

Fix: `Viewport.resize()` re-runs `apply()`, which reads the current host size and leaves
`vbX`, `vbY` and `zoom` untouched — the visible top-left stays anchored while the visible
area grows or shrinks. It is driven by one `ResizeObserver` on `canvasHost` created in the
`WysiwygEditor` **constructor**, not in `repaint()` (which recreates the `Viewport` on
every paint and would leak observers); the callback calls `this.viewport?.resize()`.

Guards: skip when the host measures zero (hidden pane), and skip constructing the
observer when `typeof ResizeObserver === 'undefined'` (jsdom under vitest).

## Testing

Vitest, matching the existing `*.spec.ts` layout beside each module.

- **`src/core/placement.spec.ts`** — returns the requested point in an empty model;
  offsets off an occupied spot; the returned point overlaps no existing node; respects
  the iteration cap instead of looping.
- **`src/webview/wysiwyg/paletteModel.spec.ts`** — exactly one group, id `basic`, with 14
  items; every `dragData` is a member of `NODE_SHAPES`; `createPaletteItemButton` sets
  title, `draggable`, the `dragstart` payload, and fires `onActivate` on click.
- **`src/webview/wysiwyg/sidebar.spec.ts`** — renders a group header plus 14 item
  buttons; header click toggles the collapsed class and `aria-expanded`; item click calls
  `addNodeAtFreeSpot` with that shape; `toggle()` shows and hides the sidebar.
- **`src/webview/wysiwyg/viewport.spec.ts`** — new case: `resize()` recomputes the
  viewBox from the new host size while preserving pan and zoom.

## Manual validation

New `ceasg-test/shape-palette.md` with three flowchart blocks:

1. A near-empty diagram — add nodes by click and by drag.
2. A dense diagram — repeated clicks must cascade, not stack.
3. A wide diagram — toggle the sidebar and drag the VS Code pane divider; the diagram
   must not distort and clicks must still hit the right nodes.

## Docs

- README: a feature bullet for the palette sidebar.
- CHANGELOG: 0.6.0 entry — Added (sidebar), Changed (new nodes are selected on add),
  Fixed (canvas no longer distorts on pane resize).
- `package.json` version bump to 0.6.0.
