# Wheel/trackpad panning of the editor viewport

Date: 2026-08-03
Status: approved, ready for implementation planning

## Problem

The WYSIWYG canvas cannot be panned with the wheel or a trackpad. `PointerController.onWheel`
(`src/webview/wysiwyg/pointer.ts:306`) returns immediately unless ctrl/meta is held, and
`.ceasg-canvas` is `overflow: hidden`, so a two-finger swipe does nothing at all.

Panning exists, but only through two undiscoverable drag paths (`pointer.ts:78`): hold space and
drag with the left button, or drag with the middle button. Neither has any cursor feedback, and
neither is documented.

## Goals

- Two-finger swipe / wheel pans the canvas on both axes.
- Panning cannot lose the diagram off-screen.
- Existing pan and zoom paths keep working; the drag paths gain cursor feedback.
- The gesture and physics logic is unit-tested without a DOM.

## Decisions

Each of these was chosen explicitly during design; the rejected alternatives are recorded so the
reasoning is not re-litigated later.

| Decision | Chosen | Rejected |
| --- | --- | --- |
| Bare vertical wheel | Always pans | Zoom-by-default; a `ceasg.wheelBehavior` setting |
| ctrl/meta + wheel | Stays zoom (also gives macOS pinch-to-zoom for free) | — |
| Wheel during an active drag | Ignored until pointerup | Pan + re-anchor the drag |
| Wheel while a label editor is open | Ignored | Commit-and-close; reposition the textarea |
| Pan bounds | Soft clamp, rubber-banded | Unbounded; bare intersection |
| Clamp scope | Inside `Viewport.panBy`, so every pan path obeys it | Wheel path only; a separate opt-in method |
| Overshoot | Dampened, hard cap at 120px | Free 1:1 overshoot; fixed 0.3x resistance |

Rationale for the two least obvious ones:

- **Pan, not zoom.** The editor is embedded in a markdown document where the wheel means "scroll"
  everywhere else, and a two-finger swipe that zooms feels wrong on a trackpad. Ctrl/meta is
  reserved for zoom, which also means pinch gestures work without extra code.
- **Clamp inside `panBy`.** Wheel-pan, space-drag, and middle-drag all call the same method. Putting
  the clamp anywhere else yields two pan models, where a fling is caught but a slow drag still loses
  the diagram — which reads as a bug rather than a design.

## Architecture

Two new pure modules hold everything interesting; the DOM-bound classes stay thin.

```
wheel.ts        WheelEvent  ->  Gesture            (pure, no DOM)
panLimits.ts    range / damping / spring math      (pure, no DOM)
viewport.ts     owns vbX/vbY/zoom, applies physics, runs the rAF spring
pointer.ts      guards, dispatches, arms the settle timer, cursor classes
```

### `src/webview/wysiwyg/wheel.ts` (new)

```ts
export type Gesture =
  | { kind: 'zoom'; factor: number }
  | { kind: 'pan'; dx: number; dy: number };

export function wheelToGesture(e: WheelLike, hostHeight: number): Gesture;
```

`WheelLike` is a structural subset of `WheelEvent` (`deltaX`, `deltaY`, `deltaMode`, `ctrlKey`,
`metaKey`, `shiftKey`) so tests construct plain objects.

Behavior, in order:

1. **Normalize `deltaMode`.** `DOM_DELTA_LINE` (1) multiplies by 16; `DOM_DELTA_PAGE` (2) multiplies
   by `hostHeight`; `DOM_DELTA_PIXEL` (0) passes through. Firefox with a mouse reports LINE with
   deltas around 3, which is ~30x too slow unnormalized.
2. **ctrl or meta -> zoom**, with today's factor unchanged: `deltaY < 0 ? 1.1 : 1 / 1.1`.
3. **shift -> horizontal**, applied only as `if (shiftKey && dx === 0) { dx = dy; dy = 0 }`. Some
   platform/browser combinations already swap the axes under shift; an unconditional swap
   double-flips them.
4. **Return pan deltas already sign-flipped**: `{ dx: -normX, dy: -normY }`. `panBy` is written in
   drag semantics (drag right -> content right -> `vbX` decreases), so a downward swipe must
   increase `vbY`. Keeping the flip here means `panBy` needs no wheel-specific special case.

### `src/webview/wysiwyg/panLimits.ts` (new)

Constants in screen pixels: `VISIBLE_MARGIN = 80`, `OVERSHOOT_CAP = 120`.

```ts
export function allowedRange(contentMin: number, contentMax: number,
                             viewSize: number, margin: number): { lo: number; hi: number };
export function dampenDelta(delta: number, overshoot: number, cap: number): number;
export function springStep(overshoot: number, dtMs: number): number;
```

- **`allowedRange`** is applied per axis, independently. For a viewport spanning
  `[vb, vb + viewSize]` against content `[contentMin, contentMax]`, requiring at least `margin` of
  overlap gives `lo = contentMin + margin - viewSize` and `hi = contentMax - margin`. When the
  content is small enough that `lo > hi`, the range collapses to the midpoint `(lo + hi) / 2` rather
  than returning an inverted range.
- **`dampenDelta`** returns `delta * (1 - overshoot / cap)`, floored at 0, so motion asymptotically
  halts at the cap and never crosses it. `overshoot` is the current distance beyond the allowed
  range on that axis, in screen pixels, and is always non-negative; `delta` is the incoming screen-px
  movement for that axis. Motion *back toward* the allowed range is never damped — the caller applies
  it 1:1, so escaping the boundary feels immediate.
- **`springStep`** decays the overshoot toward 0 as a function of elapsed milliseconds, not per
  frame, so the animation lasts the same wall-clock time at 60Hz and 144Hz. Concretely
  `overshoot * Math.pow(0.001, dtMs / 200)`, i.e. a ~200ms settle to within 0.1% of zero. Below
  0.5px it returns exactly 0 so the loop terminates.

Margins are in screen pixels and must be divided by `zoom` before comparing against viewBox
coordinates.

### `src/webview/wysiwyg/viewport.ts` (modified)

New surface:

- `setContentBounds(b)` — caches the bounds the clamp is measured against. Called from `repaint()`
  and from `fit()`. **If bounds have never been set, the clamp is skipped entirely**, degrading to
  today's unbounded behavior rather than throwing.
- `panBy` — applies `dampenDelta` per axis against the cached range before moving.
- `settle()` — starts the rAF spring that returns any overshoot to 0, driven by `springStep` with
  the timestamp rAF supplies.
- `dispose()` — cancels any in-flight animation frame **and snaps to the clamped position**.
- `zoomBy` — gains a **hard** clamp (no rubber band) at the end. Zoom-at-cursor translates the
  viewBox, so at high zoom near an edge it can otherwise walk out of bounds.

### `src/webview/wysiwyg/pointer.ts` (modified)

`onWheel` becomes:

1. `preventDefault()` unconditionally, even when the event is ignored, so an unconsumed wheel cannot
   reach VS Code's webview zoom or scroll an ancestor.
2. Bail if a gesture is active (`dragging || resize || marqueeStart || connectFrom`) or
   `isLabelEditorOpen()`.
3. `wheelToGesture(...)`, then dispatch to `zoomBy` or `panBy`.
4. Arm a **150ms idle timer** that calls `viewport.settle()`. The wheel has no release event, and
   macOS momentum scrolling keeps delivering events after the fingers lift; springing back on the
   first event past the limit would bounce mid-fling.

Cursor feedback, on the two drag paths only (a wheel gesture has no mode to signal):

- `spaceDown` toggles a class giving the canvas host `cursor: grab`; `panning` gives it
  `cursor: grabbing`. Both cleared on keyup and pointerup.
- A `window` `blur` handler clears `spaceDown`. Alt-tabbing away while holding space currently loses
  the keyup and strands the editor in pan mode — a live bug today, fixed here because the cursor
  makes it visible.

### `src/webview/wysiwyg/labelEditor.ts` (modified)

Export `isLabelEditorOpen()` backed by a module-level open count, incremented on open and
decremented in `finish()`. Preferred over sniffing `document.querySelector('.ceasg-label-editor')`
because it cannot be broken by a class rename.

### `src/webview/wysiwyg/editor.ts` (modified)

`repaint()` calls `this.viewport?.dispose()` before replacing the instance, and calls
`setContentBounds(computeContentBounds(this.model))` on the new one. `repaint()` already discards
and rebuilds the Viewport on every paint (`editor.ts:211-218`), carrying over only
`{ zoom, vbX, vbY }`; without `dispose()` an in-flight spring would keep ticking against a detached
SVG. The `ResizeObserver` comment at `editor.ts:115` already establishes this discipline.

### `media/webview.css` (modified)

Two classes for the grab/grabbing cursors on `.ceasg-canvas`.

## Data flow

```
wheel event
  -> onWheel: preventDefault
  -> guard: active gesture or open label editor?  -> drop
  -> wheelToGesture(e, hostHeight)
       -> { kind: 'zoom' }  -> viewport.zoomBy(factor, x, y)   [hard clamp]
       -> { kind: 'pan' }   -> viewport.panBy(dx, dy)          [dampened]
  -> arm 150ms idle timer -> viewport.settle() -> rAF spring -> overshoot 0
```

## Error handling and edge cases

- **Bounds never set** — clamp skipped, behavior falls back to unbounded. No throw.
- **Empty diagram** — `computeContentBounds` already returns a 400x300 default for an empty model,
  so the clamp has a sane range.
- **Content smaller than the margins** — `allowedRange` collapses to a midpoint instead of an
  inverted range.
- **Repaint mid-spring** — `dispose()` cancels the frame and snaps in-bounds, so the replacement
  Viewport never inherits an overshoot.
- **Space held while focus leaves the webview** — `blur` clears `spaceDown`.
- **Momentum scrolling** — the 150ms idle timer prevents a spring-back mid-fling.

## Testing

| File | Covers |
| --- | --- |
| `wheel.spec.ts` (new) | deltaMode normalization for all three modes; ctrl and meta both route to zoom; shift swaps only when `dx === 0`; sign conventions on both axes |
| `panLimits.spec.ts` (new) | range math including the degenerate collapse; damping reaches 0 at the cap; return motion undamped; spring converges and is dt-independent |
| `viewport.spec.ts` (extend) | `panBy` halts at the 80px limit; overshoot capped at 120px; `dispose()` snaps in-bounds; the existing resize test still passes |

`pointer.ts` has no spec file and does not gain one. That is the reason the physics lives in the two
pure modules: the handler stays thin enough to verify by reading.

## Out of scope

Deferred deliberately, not overlooked:

- Continuous/proportional zoom (`Math.exp(-deltaY * k)`) to replace the fixed 1.1 step. Would make
  trackpad pinch smoother, but widens the diff.
- rAF coalescing of wheel events. `panBy` only sets a `viewBox` attribute, so per-event application
  is cheap enough.
- Repositioning the label editor as the viewport moves. Superseded by ignoring the wheel while it is
  open; the underlying desync also affects toolbar zoom and deserves its own change.
- A `ceasg.wheelBehavior` setting. Rejected outright — pan is the correct default and a setting is
  surface area without demand.

## Files touched

New: `src/webview/wysiwyg/wheel.ts`, `src/webview/wysiwyg/panLimits.ts`, plus their spec files.

Modified: `src/webview/wysiwyg/viewport.ts`, `pointer.ts`, `editor.ts`, `labelEditor.ts`,
`viewport.spec.ts`, `media/webview.css`.
