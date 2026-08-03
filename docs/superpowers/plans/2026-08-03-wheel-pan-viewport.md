# Wheel/Trackpad Viewport Panning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the WYSIWYG canvas pan on both axes with the wheel/trackpad, rubber-banding at a boundary that keeps the diagram from being scrolled off-screen.

**Architecture:** Two new pure modules hold all the interesting logic — `wheel.ts` translates a `WheelEvent` into a `Gesture`, and `panLimits.ts` holds the range/damping/spring arithmetic. Both are DOM-free and fully unit-tested. `Viewport` gains cached content bounds, damped panning, an rAF spring, and a `dispose()` lifecycle hook. `PointerController.onWheel` stays a thin guard-and-dispatch handler.

**Tech Stack:** TypeScript, vitest (jsdom environment), esbuild, VS Code webview. No new dependencies.

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-08-03-wheel-pan-viewport-design.md`. Every decision in its Decisions table is settled — do not re-litigate.
- **Every command must be prefixed with `fnm exec --`** (e.g. `fnm exec -- pnpm test:unit`). The repo pins Node 22 via `.node-version`; the system node is 18, and vitest 4 and eslint 10 both hard-fail on it. Interactive shells auto-switch via `fnm env --use-on-cd`, but non-interactive tool shells do not.
- Unit tests: `fnm exec -- pnpm test:unit` (runs `vitest run`). A single file: `fnm exec -- pnpm vitest run <path>`.
- Types: `fnm exec -- pnpm check-types`. Lint: `fnm exec -- pnpm lint`. Both must pass before every commit. `pnpm lint` reports ~158 pre-existing warnings repo-wide and exits 0; your own files must add none — check with `fnm exec -- pnpm exec eslint <your files>`, which must exit 0 with no output.
- ESLint enforces `curly` (always brace `if` bodies), `eqeqeq`, and `semi`. Match the surrounding one-line `if (x) { return; }` style used throughout `src/webview/wysiwyg/`.
- Test files live beside their source as `<name>.spec.ts` and are picked up by `src/**/*.spec.ts`.
- `VISIBLE_MARGIN = 80` and `OVERSHOOT_CAP = 120`, both in **screen pixels**. Any comparison against viewBox coordinates must divide by `zoom` first.
- Spring decay: `overshoot * Math.pow(0.001, dtMs / 200)`, snapping to exactly `0` below `0.5`.
- Zoom step stays exactly as today: `deltaY < 0 ? 1.1 : 1 / 1.1`. Proportional zoom is explicitly out of scope.
- Commit messages follow the repo's Conventional Commits style (`feat(scope):`, `fix(scope):`, `test:`, `docs:`).

## File Structure

| File | Responsibility |
| --- | --- |
| `src/webview/wysiwyg/panLimits.ts` (new) | Pure arithmetic: allowed pan range, damping curve, spring decay. No DOM, no state. |
| `src/webview/wysiwyg/panLimits.spec.ts` (new) | Tests for the above — this is where the "feel" of the feature is pinned down. |
| `src/webview/wysiwyg/wheel.ts` (new) | Pure `WheelEvent` -> `Gesture` translation: deltaMode normalization, modifier routing, sign convention. |
| `src/webview/wysiwyg/wheel.spec.ts` (new) | Tests for gesture translation. |
| `src/webview/wysiwyg/viewport.ts` (modify) | Owns `vbX/vbY/zoom`; applies the physics; runs the rAF spring; `dispose()` lifecycle. |
| `src/webview/wysiwyg/viewport.spec.ts` (modify) | Extend with clamp/cap/dispose coverage. |
| `src/webview/wysiwyg/editor.ts` (modify) | Wires real content bounds in, and disposes the old Viewport on repaint. |
| `src/webview/wysiwyg/labelEditor.ts` (modify) | Exports `isLabelEditorOpen()` so the wheel handler can stand down. |
| `src/webview/wysiwyg/pointer.ts` (modify) | `onWheel` guard + dispatch + settle timer; grab/grabbing cursor classes; blur fix. |
| `media/webview.css` (modify) | The two cursor classes. |
| `CHANGELOG.md`, `README.md` (modify) | User-facing documentation. |

---

### Task 1: Pan limit arithmetic

Pure functions with no DOM and no state. Everything about how the boundary *feels* is decided here, which is why it is tested first and in isolation.

**Files:**
- Create: `src/webview/wysiwyg/panLimits.ts`
- Test: `src/webview/wysiwyg/panLimits.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `VISIBLE_MARGIN: number` (80)
  - `OVERSHOOT_CAP: number` (120)
  - `allowedRange(contentMin: number, contentMax: number, viewSize: number, margin: number): { lo: number; hi: number }`
  - `overshootOf(value: number, lo: number, hi: number): number` — signed; `0` when inside
  - `dampenDelta(delta: number, overshoot: number, cap: number): number` — `overshoot` is non-negative
  - `springStep(overshoot: number, dtMs: number): number`

**Background the implementer needs.** The viewport is expressed as an SVG `viewBox` of `[vb, vb + viewSize]` on each axis, compared against content bounds `[contentMin, contentMax]`. Requiring at least `margin` of overlap between the two intervals gives the closed range `lo = contentMin + margin - viewSize`, `hi = contentMax - margin`. Pushing `vb` above `hi` scrolls the content off the left/top; below `lo` scrolls it off the right/bottom.

- [ ] **Step 1: Write the failing tests**

Create `src/webview/wysiwyg/panLimits.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { allowedRange, overshootOf, dampenDelta, springStep, VISIBLE_MARGIN, OVERSHOOT_CAP } from './panLimits';

describe('allowedRange', () => {
  it('permits panning until only `margin` of content remains visible', () => {
    // content [0, 1000], viewport 400 wide, keep 80 visible
    const r = allowedRange(0, 1000, 400, 80);
    expect(r.lo).toBe(-320); // 0 + 80 - 400
    expect(r.hi).toBe(920);  // 1000 - 80
  });

  it('collapses to the midpoint when the viewport is too small to satisfy the margin', () => {
    // contentW + viewSize < 2 * margin -> no position satisfies the rule
    const r = allowedRange(0, 10, 20, 80);
    expect(r.lo).toBe(r.hi);
    expect(r.lo).toBe((80 - 20 + (10 - 80)) / 2);
  });
});

describe('overshootOf', () => {
  it('is zero inside the range, including at both edges', () => {
    expect(overshootOf(0, -10, 10)).toBe(0);
    expect(overshootOf(-10, -10, 10)).toBe(0);
    expect(overshootOf(10, -10, 10)).toBe(0);
  });

  it('is signed by which edge was crossed', () => {
    expect(overshootOf(15, -10, 10)).toBe(5);
    expect(overshootOf(-13, -10, 10)).toBe(-3);
  });
});

describe('dampenDelta', () => {
  it('applies the full delta with no overshoot', () => {
    expect(dampenDelta(10, 0, 120)).toBe(10);
  });

  it('scales the delta down as overshoot grows', () => {
    expect(dampenDelta(10, 60, 120)).toBeCloseTo(5);
    expect(dampenDelta(10, 90, 120)).toBeCloseTo(2.5);
  });

  it('reaches zero at the cap and never reverses past it', () => {
    expect(dampenDelta(10, 120, 120)).toBe(0);
    expect(dampenDelta(10, 200, 120)).toBe(0);
  });

  it('preserves the sign of the delta', () => {
    expect(dampenDelta(-10, 60, 120)).toBeCloseTo(-5);
  });
});

describe('springStep', () => {
  it('decays the overshoot toward zero', () => {
    const next = springStep(100, 16);
    expect(next).toBeLessThan(100);
    expect(next).toBeGreaterThan(0);
  });

  it('settles to exactly zero once the remainder is sub-pixel', () => {
    expect(springStep(0.4, 16)).toBe(0);
    expect(springStep(100, 10000)).toBe(0);
  });

  it('is frame-rate independent — one 32ms step matches two 16ms steps', () => {
    const oneBigStep = springStep(100, 32);
    const twoSmallSteps = springStep(springStep(100, 16), 16);
    expect(oneBigStep).toBeCloseTo(twoSmallSteps, 6);
  });
});

describe('constants', () => {
  it('are the values the design fixed', () => {
    expect(VISIBLE_MARGIN).toBe(80);
    expect(OVERSHOOT_CAP).toBe(120);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/webview/wysiwyg/panLimits.spec.ts`
Expected: FAIL — `Failed to resolve import "./panLimits"`.

- [ ] **Step 3: Write the implementation**

Create `src/webview/wysiwyg/panLimits.ts`:

```ts
/** Pure pan-boundary arithmetic. All distances that carry a unit are screen
 *  pixels; callers working in viewBox coordinates divide by zoom first. */

/** How much of the content bounds must stay on screen, in screen px. */
export const VISIBLE_MARGIN = 80;
/** How far past the boundary a gesture may push before motion stops, in screen px. */
export const OVERSHOOT_CAP = 120;

/** The closed range a viewBox origin may occupy on one axis while keeping at
 *  least `margin` of overlap with the content. When the viewport is so small
 *  that no position satisfies the rule, the range collapses to its midpoint
 *  rather than inverting. */
export function allowedRange(
  contentMin: number, contentMax: number, viewSize: number, margin: number,
): { lo: number; hi: number } {
  const lo = contentMin + margin - viewSize;
  const hi = contentMax - margin;
  if (lo > hi) {
    const mid = (lo + hi) / 2;
    return { lo: mid, hi: mid };
  }
  return { lo, hi };
}

/** Signed distance outside [lo, hi]; 0 when inside or exactly on an edge. */
export function overshootOf(value: number, lo: number, hi: number): number {
  if (value > hi) { return value - hi; }
  if (value < lo) { return value - lo; }
  return 0;
}

/** Scale an outward delta by how far the boundary has already been pushed, so
 *  motion asymptotically halts at `cap`. Sign is preserved; the factor floors
 *  at 0 so an over-cap overshoot can never be pushed further out. */
export function dampenDelta(delta: number, overshoot: number, cap: number): number {
  return delta * Math.max(0, 1 - overshoot / cap);
}

/** Exponential decay of an overshoot toward 0, parameterised by elapsed time
 *  rather than frame count so the settle takes the same ~200ms at any refresh
 *  rate. Snaps to 0 below half a pixel so the animation loop terminates. */
export function springStep(overshoot: number, dtMs: number): number {
  const next = overshoot * Math.pow(0.001, dtMs / 200);
  return Math.abs(next) < 0.5 ? 0 : next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/webview/wysiwyg/panLimits.spec.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Check types and lint**

Run: `pnpm check-types && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/webview/wysiwyg/panLimits.ts src/webview/wysiwyg/panLimits.spec.ts
git commit -m "feat(viewport): pan boundary arithmetic — range, damping, spring"
```

---

### Task 2: Wheel gesture translation

**Files:**
- Create: `src/webview/wysiwyg/wheel.ts`
- Test: `src/webview/wysiwyg/wheel.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Gesture = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number }`
  - `interface WheelLike { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }`
  - `wheelToGesture(e: WheelLike, hostHeight: number): Gesture`

**Background the implementer needs.**

- `deltaMode` is `0` (pixel), `1` (line), or `2` (page). Firefox with a physical mouse reports mode `1` with deltas around `3`; unnormalized that pans ~30x too slowly.
- **The returned pan deltas are already sign-flipped** to match `Viewport.panBy`, which is written in drag semantics (drag right -> content moves right -> `vbX` decreases). A downward two-finger swipe reports `deltaY > 0` and must *increase* `vbY`, so the gesture carries `dy: -deltaY`.
- The shift-to-horizontal rule is conditional on `deltaX === 0` because several platform/browser combinations already swap the axes for you; an unconditional swap double-flips them.
- `WheelLike` is a structural subset of `WheelEvent` so tests can pass plain object literals.

- [ ] **Step 1: Write the failing tests**

Create `src/webview/wysiwyg/wheel.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wheelToGesture } from './wheel';

function ev(over: Partial<Parameters<typeof wheelToGesture>[0]> = {}) {
  return { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...over };
}

describe('wheelToGesture — zoom routing', () => {
  it('routes ctrl+wheel to zoom in when scrolling up', () => {
    expect(wheelToGesture(ev({ deltaY: -100, ctrlKey: true }), 600)).toEqual({ kind: 'zoom', factor: 1.1 });
  });

  it('routes meta+wheel to zoom out when scrolling down', () => {
    const g = wheelToGesture(ev({ deltaY: 100, metaKey: true }), 600);
    expect(g.kind).toBe('zoom');
    expect((g as { factor: number }).factor).toBeCloseTo(1 / 1.1);
  });
});

describe('wheelToGesture — pan direction', () => {
  it('inverts deltaY so a downward swipe moves the viewport down', () => {
    expect(wheelToGesture(ev({ deltaY: 100 }), 600)).toEqual({ kind: 'pan', dx: 0, dy: -100 });
  });

  it('inverts deltaX so a rightward swipe moves the viewport right', () => {
    expect(wheelToGesture(ev({ deltaX: 40 }), 600)).toEqual({ kind: 'pan', dx: -40, dy: 0 });
  });

  it('passes both axes through together for a diagonal swipe', () => {
    expect(wheelToGesture(ev({ deltaX: 30, deltaY: 50 }), 600)).toEqual({ kind: 'pan', dx: -30, dy: -50 });
  });
});

describe('wheelToGesture — deltaMode normalization', () => {
  it('scales line mode by 16px', () => {
    expect(wheelToGesture(ev({ deltaY: 3, deltaMode: 1 }), 600)).toEqual({ kind: 'pan', dx: 0, dy: -48 });
  });

  it('scales page mode by the host height', () => {
    expect(wheelToGesture(ev({ deltaY: 1, deltaMode: 2 }), 600)).toEqual({ kind: 'pan', dx: 0, dy: -600 });
  });

  it('leaves pixel mode untouched', () => {
    expect(wheelToGesture(ev({ deltaY: 7, deltaMode: 0 }), 600)).toEqual({ kind: 'pan', dx: 0, dy: -7 });
  });
});

describe('wheelToGesture — shift for horizontal', () => {
  it('redirects a vertical delta to the horizontal axis', () => {
    expect(wheelToGesture(ev({ deltaY: 100, shiftKey: true }), 600)).toEqual({ kind: 'pan', dx: -100, dy: 0 });
  });

  it('does not swap when the platform already reported a horizontal delta', () => {
    expect(wheelToGesture(ev({ deltaX: 100, deltaY: 0, shiftKey: true }), 600)).toEqual({ kind: 'pan', dx: -100, dy: 0 });
  });

  it('normalizes before swapping', () => {
    expect(wheelToGesture(ev({ deltaY: 3, deltaMode: 1, shiftKey: true }), 600)).toEqual({ kind: 'pan', dx: -48, dy: 0 });
  });

  it('still zooms when ctrl and shift are held together', () => {
    expect(wheelToGesture(ev({ deltaY: -100, ctrlKey: true, shiftKey: true }), 600).kind).toBe('zoom');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/webview/wysiwyg/wheel.spec.ts`
Expected: FAIL — `Failed to resolve import "./wheel"`.

- [ ] **Step 3: Write the implementation**

Create `src/webview/wysiwyg/wheel.ts`:

```ts
/** Pure translation of a wheel event into a viewport gesture. No DOM access, so
 *  the whole routing table is unit-testable from plain object literals. */

export type Gesture =
  | { kind: 'zoom'; factor: number }
  /** Screen-px deltas in Viewport.panBy's drag convention — already sign-flipped. */
  | { kind: 'pan'; dx: number; dy: number };

/** Structural subset of WheelEvent, so tests need not construct real events. */
export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

const LINE_HEIGHT = 16;
const ZOOM_STEP = 1.1;

export function wheelToGesture(e: WheelLike, hostHeight: number): Gesture {
  // ctrl/meta is zoom on every platform, and is also what a macOS trackpad
  // pinch synthesizes — so pinch-to-zoom works without a gesture listener.
  if (e.ctrlKey || e.metaKey) {
    return { kind: 'zoom', factor: e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP };
  }

  // Firefox with a mouse reports lines, not pixels; without this the pan is
  // roughly 30x too slow there.
  const scale = e.deltaMode === 1 ? LINE_HEIGHT : e.deltaMode === 2 ? hostHeight : 1;
  let dx = e.deltaX * scale;
  let dy = e.deltaY * scale;

  // Shift means horizontal — but only for input that had no horizontal
  // component to begin with. Some platforms pre-swap the axes under shift, and
  // swapping unconditionally would undo that.
  if (e.shiftKey && dx === 0) {
    dx = dy;
    dy = 0;
  }

  return { kind: 'pan', dx: -dx, dy: -dy };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/webview/wysiwyg/wheel.spec.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Check types and lint**

Run: `pnpm check-types && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/webview/wysiwyg/wheel.ts src/webview/wysiwyg/wheel.spec.ts
git commit -m "feat(viewport): translate wheel events into pan/zoom gestures"
```

---

### Task 3: Viewport clamping, rubber band, and lifecycle

**Files:**
- Modify: `src/webview/wysiwyg/viewport.ts` (whole `Viewport` class, lines 27-78)
- Test: `src/webview/wysiwyg/viewport.spec.ts` (append; leave the existing `computeContentBounds` and `Viewport.resize` blocks untouched)

**Interfaces:**
- Consumes: `allowedRange`, `overshootOf`, `dampenDelta`, `springStep`, `VISIBLE_MARGIN`, `OVERSHOOT_CAP` from Task 1.
- Produces, on `Viewport`:
  - `setContentBounds(b: { minX: number; minY: number; maxX: number; maxY: number }): void`
  - `settle(): void`
  - `dispose(): void`
  - `get hostHeight(): number`
  - `panBy` and `zoomBy` keep their existing signatures.

**Background the implementer needs.**

- `panBy(dxScreen, dyScreen)` currently does `vbX -= dxScreen / zoom`. The damping wraps that per-axis movement; it does not change the sign convention.
- **The clamp must be skipped entirely when bounds were never set.** `viewport.spec.ts`'s existing `Viewport.resize` test constructs a `Viewport` with a stub host and never sets bounds — it must keep passing unchanged. Unbounded is the safe fallback, not an error.
- `dispose()` both cancels an in-flight animation frame and hard-snaps into bounds, so the replacement `Viewport` built by `repaint()` never inherits an overshoot.
- Do **not** test `settle()`'s animation. Its decay is already covered by `springStep` in Task 1, and driving rAF in jsdom would add flake for no coverage gain.

- [ ] **Step 1: Write the failing tests**

Append to `src/webview/wysiwyg/viewport.spec.ts`:

```ts
function vpWith(bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  // zoomBy routes through screenToSvg, which needs a rect — the pre-existing
  // resize test's stub has no getBoundingClientRect because panBy never calls it.
  const host = {
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const vp = new Viewport(svg, host as unknown as HTMLElement);
  vp.setContentBounds(bounds);
  return vp;
}

describe('Viewport pan bounds', () => {
  const BOUNDS = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };

  it('pans freely well inside the allowed range', () => {
    const vp = vpWith(BOUNDS);
    vp.setTransform({ zoom: 1, vbX: 500, vbY: 500 });
    vp.panBy(-100, -50); // panBy subtracts, so this moves vb positively
    expect(vp.getTransform().vbX).toBeCloseTo(600);
    expect(vp.getTransform().vbY).toBeCloseTo(550);
  });

  it('does not clamp at all when content bounds were never set', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    const host = { clientWidth: 800, clientHeight: 600 };
    const vp = new Viewport(svg, host as unknown as HTMLElement);
    vp.setTransform({ zoom: 1, vbX: 0, vbY: 0 });
    vp.panBy(-100000, -100000);
    expect(vp.getTransform().vbX).toBeCloseTo(100000);
  });

  it('never lets a single huge delta push further than the overshoot cap', () => {
    const vp = vpWith(BOUNDS);
    vp.setTransform({ zoom: 1, vbX: 0, vbY: 0 });
    vp.panBy(-100000, 0);
    // hi = maxX - VISIBLE_MARGIN = 1920; cap adds 120 at zoom 1
    expect(vp.getTransform().vbX).toBeCloseTo(2040);
  });

  it('applies the cap in screen pixels, so it shrinks in viewBox units as zoom rises', () => {
    const vp = vpWith(BOUNDS);
    vp.setTransform({ zoom: 2, vbX: 0, vbY: 0 });
    vp.panBy(-100000, 0);
    // margin 80px and cap 120px are both halved in viewBox units at zoom 2
    expect(vp.getTransform().vbX).toBeCloseTo(2000 - 40 + 60);
  });

  it('resists further outward motion once past the boundary', () => {
    const vp = vpWith(BOUNDS);
    vp.setTransform({ zoom: 1, vbX: 1980, vbY: 0 }); // 60px past hi of 1920
    vp.panBy(-100, 0);
    const moved = vp.getTransform().vbX - 1980;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(100); // dampened, not 1:1
  });

  it('lets motion back toward the content apply at full strength', () => {
    const vp = vpWith(BOUNDS);
    vp.setTransform({ zoom: 1, vbX: 1980, vbY: 0 });
    vp.panBy(100, 0); // inward
    expect(vp.getTransform().vbX).toBeCloseTo(1880);
  });

  it('clamps both axes independently', () => {
    const vp = vpWith(BOUNDS);
    vp.setTransform({ zoom: 1, vbX: 500, vbY: 0 });
    vp.panBy(0, 100000); // far negative on y only
    expect(vp.getTransform().vbX).toBeCloseTo(500);
    // lo = minY + 80 - 600 = -520; cap 120 below that
    expect(vp.getTransform().vbY).toBeCloseTo(-640);
  });
});

describe('Viewport.dispose', () => {
  it('snaps an overshoot back inside the allowed range', () => {
    const vp = vpWith({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 });
    vp.setTransform({ zoom: 1, vbX: 1, vbY: 0 });
    vp.panBy(-100000, 0);
    expect(vp.getTransform().vbX).toBeCloseTo(2040); // past the boundary
    vp.dispose();
    expect(vp.getTransform().vbX).toBeCloseTo(1920); // exactly hi
  });

  it('is safe to call when nothing is in flight and nothing is out of bounds', () => {
    const vp = vpWith({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 });
    vp.setTransform({ zoom: 1, vbX: 500, vbY: 500 });
    vp.dispose();
    expect(vp.getTransform().vbX).toBeCloseTo(500);
  });
});

describe('Viewport.zoomBy', () => {
  it('hard-clamps into bounds, since zoom-at-cursor translates the viewBox', () => {
    const vp = vpWith({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 });
    vp.setTransform({ zoom: 1, vbX: 1900, vbY: 0 });
    vp.zoomBy(4, 790, 590);
    const t = vp.getTransform();
    const hi = 2000 - 80 / t.zoom;
    expect(t.vbX).toBeLessThanOrEqual(hi + 0.001);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/webview/wysiwyg/viewport.spec.ts`
Expected: FAIL — `vp.setContentBounds is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/webview/wysiwyg/viewport.ts`, add the import below the existing one:

```ts
import { allowedRange, overshootOf, dampenDelta, springStep, VISIBLE_MARGIN, OVERSHOOT_CAP } from './panLimits';
```

Add these fields alongside `zoom`/`vbX`/`vbY`:

```ts
  private contentBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  private springHandle: number | null = null;
  private lastSpringTs = 0;
```

Replace `panBy` and `zoomBy`, and add the new members:

```ts
  /** Bounds the pan clamp is measured against. Until this is set the viewport
   *  pans unbounded — an unclamped fallback beats throwing on a stub host. */
  setContentBounds(b: { minX: number; minY: number; maxX: number; maxY: number }): void {
    this.contentBounds = b;
  }

  get hostHeight(): number { return this.host.clientHeight; }

  /** Allowed viewBox-origin range on one axis, or null when unbounded. */
  private rangeFor(axis: 'x' | 'y'): { lo: number; hi: number } | null {
    const b = this.contentBounds;
    if (!b) { return null; }
    const margin = VISIBLE_MARGIN / this.zoom;
    return axis === 'x'
      ? allowedRange(b.minX, b.maxX, this.host.clientWidth / this.zoom, margin)
      : allowedRange(b.minY, b.maxY, this.host.clientHeight / this.zoom, margin);
  }

  /** Move one axis by a viewBox-space delta, damping motion that pushes further
   *  out of bounds and hard-stopping at the overshoot cap. Inward motion is
   *  never damped, so escaping the boundary feels immediate. */
  private axisPan(v: number, deltaVb: number, axis: 'x' | 'y'): number {
    const r = this.rangeFor(axis);
    if (!r) { return v + deltaVb; }
    const over = overshootOf(v, r.lo, r.hi);
    const outward = (over > 0 && deltaVb > 0) || (over < 0 && deltaVb < 0);
    const applied = outward
      ? dampenDelta(deltaVb, Math.abs(over) * this.zoom, OVERSHOOT_CAP)
      : deltaVb;
    // A single very large delta could clear the asymptote in one step, so the
    // cap is also enforced as a hard stop.
    const cap = OVERSHOOT_CAP / this.zoom;
    return Math.min(r.hi + cap, Math.max(r.lo - cap, v + applied));
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.vbX = this.axisPan(this.vbX, -dxScreen / this.zoom, 'x');
    this.vbY = this.axisPan(this.vbY, -dyScreen / this.zoom, 'y');
    this.apply();
  }

  /** Animate any overshoot back to the boundary. Callers arm this once the
   *  gesture has gone idle — the wheel has no release event. */
  settle(): void {
    if (this.springHandle !== null) { return; }
    if (typeof requestAnimationFrame === 'undefined') { this.snapIntoBounds(); return; }
    const step = (ts: number): void => {
      const dt = this.lastSpringTs === 0 ? 16 : ts - this.lastSpringTs;
      this.lastSpringTs = ts;
      let moving = false;
      const rx = this.rangeFor('x');
      if (rx) {
        const over = overshootOf(this.vbX, rx.lo, rx.hi);
        if (over !== 0) {
          const next = springStep(Math.abs(over) * this.zoom, dt) / this.zoom;
          this.vbX = (over > 0 ? rx.hi : rx.lo) + (over > 0 ? next : -next);
          moving = moving || next !== 0;
        }
      }
      const ry = this.rangeFor('y');
      if (ry) {
        const over = overshootOf(this.vbY, ry.lo, ry.hi);
        if (over !== 0) {
          const next = springStep(Math.abs(over) * this.zoom, dt) / this.zoom;
          this.vbY = (over > 0 ? ry.hi : ry.lo) + (over > 0 ? next : -next);
          moving = moving || next !== 0;
        }
      }
      this.apply();
      if (moving) {
        this.springHandle = requestAnimationFrame(step);
      } else {
        this.springHandle = null;
        this.lastSpringTs = 0;
      }
    };
    this.springHandle = requestAnimationFrame(step);
  }

  /** Stop any animation and hard-snap into bounds. repaint() throws this
   *  Viewport away and builds a new one from getTransform(), so an in-flight
   *  spring would otherwise tick against a detached svg and the replacement
   *  would inherit an out-of-bounds origin. */
  dispose(): void {
    if (this.springHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.springHandle);
    }
    this.springHandle = null;
    this.lastSpringTs = 0;
    this.snapIntoBounds();
  }

  private snapIntoBounds(): void {
    const rx = this.rangeFor('x');
    if (rx) { this.vbX = Math.min(rx.hi, Math.max(rx.lo, this.vbX)); }
    const ry = this.rangeFor('y');
    if (ry) { this.vbY = Math.min(ry.hi, Math.max(ry.lo, this.vbY)); }
    this.apply();
  }
```

Then change the last line of `zoomBy` from `this.apply();` to `this.snapIntoBounds();` — zoom-at-cursor translates the viewBox, so at high zoom near an edge it can otherwise walk out of bounds. Leave the rest of `zoomBy` alone.

Finally, in `fit`, add `this.setContentBounds(b);` immediately after `const b = computeContentBounds(model);` so a fitted viewport is bounded even before the first repaint wires bounds in.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/webview/wysiwyg/viewport.spec.ts`
Expected: PASS — all new tests plus the two pre-existing blocks.

- [ ] **Step 5: Run the whole unit suite**

Run: `pnpm test:unit`
Expected: PASS. Nothing outside `viewport.spec.ts` should change behavior.

- [ ] **Step 6: Check types and lint**

Run: `pnpm check-types && pnpm lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/webview/wysiwyg/viewport.ts src/webview/wysiwyg/viewport.spec.ts
git commit -m "feat(viewport): clamp panning to content bounds with rubber-band overshoot"
```

---

### Task 4: Wire real content bounds and dispose on repaint

**Files:**
- Modify: `src/webview/wysiwyg/editor.ts:211-218` (the `repaint` method)

**Interfaces:**
- Consumes: `setContentBounds`, `dispose` from Task 3; `computeContentBounds` (already exported from `./viewport`).
- Produces: nothing new.

**Background the implementer needs.** `repaint()` discards the `Viewport` and builds a fresh one on every paint, carrying over only `{ zoom, vbX, vbY }`. Two things matter here:

1. **`dispose()` must be called before `getTransform()`**, not after. `dispose()` snaps an overshoot back into bounds, and the whole point is for the replacement to pick up the *snapped* origin. Reading the transform first would carry the overshoot across.
2. `computeContentBounds` is already imported in `editor.ts` — check the import line before adding it again.

- [ ] **Step 1: Verify the current import**

Run: `grep -n "from './viewport'" src/webview/wysiwyg/editor.ts`
If `computeContentBounds` is not in the import list, add it.

- [ ] **Step 2: Rewrite the top of `repaint`**

Replace lines 212-218 of `src/webview/wysiwyg/editor.ts`:

```ts
    // Dispose BEFORE reading the transform: dispose() cancels any in-flight
    // rubber-band frame and snaps an overshoot back in bounds, and the
    // replacement Viewport must inherit the snapped origin, not the overshoot.
    this.viewport?.dispose();
    const prevTransform = this.viewport ? this.viewport.getTransform() : null;
    const { svg, refs } = renderDiagram(this.model);
    this.refs = refs;
    this.canvasHost.innerHTML = '';
    this.canvasHost.appendChild(svg);
    this.viewport = new Viewport(svg, this.canvasHost);
    this.viewport.setContentBounds(computeContentBounds(this.model));
    if (prevTransform) { this.viewport.setTransform(prevTransform); }
```

- [ ] **Step 3: Run the whole unit suite**

Run: `pnpm test:unit`
Expected: PASS, unchanged from Task 3.

- [ ] **Step 4: Check types and lint**

Run: `pnpm check-types && pnpm lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/webview/wysiwyg/editor.ts
git commit -m "feat(viewport): feed live content bounds to the viewport, dispose on repaint"
```

---

### Task 5: Label editor open-state probe

**Files:**
- Modify: `src/webview/wysiwyg/labelEditor.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isLabelEditorOpen(): boolean`

**Background the implementer needs.** While a label is being edited, an in-place `position: fixed` textarea sits over the canvas, positioned once from the viewport transform and never updated. Panning would strand it over the wrong node, so the wheel handler stands down while it is open. A module-level counter is used rather than `document.querySelector('.ceasg-label-editor')` because a class rename would silently break the query. `finish()` is already idempotent via its `done` flag, so decrementing there cannot double-count.

- [ ] **Step 1: Add the counter and the probe**

At the top of `src/webview/wysiwyg/labelEditor.ts`, below the import:

```ts
/** Number of in-place label editors currently open. The wheel handler stands
 *  down while one is up: the textarea is positioned from the viewport once and
 *  never repositioned, so panning would strand it over the wrong node. */
let openCount = 0;

export function isLabelEditorOpen(): boolean { return openCount > 0; }
```

- [ ] **Step 2: Increment on open**

Immediately after `document.body.appendChild(ta);`:

```ts
  openCount += 1;
```

- [ ] **Step 3: Decrement on close**

Inside `finish`, after the `done = true;` line (before the `onCommit` call, so an exception in the callback cannot leak the count):

```ts
    openCount -= 1;
```

- [ ] **Step 4: Check types and lint**

Run: `pnpm check-types && pnpm lint`
Expected: both clean.

- [ ] **Step 5: Run the unit suite**

Run: `pnpm test:unit`
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/webview/wysiwyg/labelEditor.ts
git commit -m "feat(editor): expose whether an in-place label editor is open"
```

---

### Task 6: Wheel handler — guard, dispatch, settle

**Files:**
- Modify: `src/webview/wysiwyg/pointer.ts` (imports, new fields, `attach`, `onWheel` at lines 306-310)

**Interfaces:**
- Consumes: `wheelToGesture` (Task 2); `panBy`, `zoomBy`, `settle`, `hostHeight` (Task 3); `isLabelEditorOpen` (Task 5).
- Produces: nothing new.

**Background the implementer needs.**

- The listener is already registered `{ passive: false }` at `pointer.ts:55`, so `preventDefault()` is available. Call it **unconditionally**, even when the event is ignored — an unconsumed wheel in a VS Code webview can otherwise reach webview-level zoom.
- The wheel is ignored during any active gesture. `onMove` computes deltas in SVG coordinates and re-anchors `this.down` on every move, so shifting the viewBox mid-drag would make the dragged node teleport by the pan amount.
- The wheel has no release event, and macOS momentum scrolling keeps delivering events after the fingers lift. The settle timer is therefore re-armed on every event and only fires once the stream has been quiet for 150ms.
- `attach()` runs on **every repaint**, so the timer must survive it — it is instance state on the controller, which persists (the controller is built once in `init`).

- [ ] **Step 1: Add the imports**

At the top of `src/webview/wysiwyg/pointer.ts`:

```ts
import { wheelToGesture } from './wheel';
import { isLabelEditorOpen } from './labelEditor';
```

- [ ] **Step 2: Add the idle-timer field**

Alongside the other private fields (near `private panning = false;`):

```ts
  /** Fires viewport.settle() once the wheel stream has gone quiet. The wheel has
   *  no release event, and macOS momentum keeps delivering events after the
   *  fingers lift — springing back on the first event past the boundary would
   *  bounce mid-fling. */
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
```

- [ ] **Step 3: Replace `onWheel`**

Replace lines 306-310 of `src/webview/wysiwyg/pointer.ts`:

```ts
  private onWheel(e: WheelEvent): void {
    // Always consume it: an unhandled wheel in a VS Code webview can reach
    // webview-level zoom or scroll an ancestor pane.
    e.preventDefault();
    // A viewport shift mid-gesture would teleport whatever is being dragged,
    // and would strand the in-place label editor over the wrong node.
    if (this.dragging || this.resize || this.marqueeStart || this.connectFrom) { return; }
    if (isLabelEditorOpen()) { return; }

    const vp = this.editor.viewport;
    if (!vp) { return; }
    const g = wheelToGesture(e, vp.hostHeight);
    if (g.kind === 'zoom') {
      vp.zoomBy(g.factor, e.clientX, e.clientY);
      return;
    }
    vp.panBy(g.dx, g.dy);
    if (this.settleTimer !== null) { clearTimeout(this.settleTimer); }
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.editor.viewport?.settle();
    }, 150);
  }
```

- [ ] **Step 4: Check types and lint**

Run: `pnpm check-types && pnpm lint`
Expected: both clean.

- [ ] **Step 5: Run the unit suite**

Run: `pnpm test:unit`
Expected: PASS, unchanged.

- [ ] **Step 6: Verify in the running extension**

Run: `pnpm compile`, then launch the extension host (F5 in VS Code) and open `sample.md`. Click the CodeLens on a flowchart block, then check by hand:

1. Two-finger swipe up/down/left/right pans the canvas; direction follows the fingers.
2. Swiping hard past the edge slows to a stop and springs back — it does not snap instantly, and the diagram never fully leaves the screen.
3. Ctrl/Cmd + wheel still zooms toward the cursor; trackpad pinch also zooms.
4. Shift + wheel pans horizontally.
5. Wheeling while dragging a node does nothing, and the node does not jump.
6. Double-click a node to rename, then wheel — the canvas stays put and the textarea stays on the node.

- [ ] **Step 7: Commit**

```bash
git add src/webview/wysiwyg/pointer.ts
git commit -m "feat(canvas): pan the viewport with the wheel and trackpad"
```

---

### Task 7: Grab cursor for the drag-pan paths

**Files:**
- Modify: `src/webview/wysiwyg/pointer.ts` (key handlers at lines 42-43, `attach` at 51-63, `onDown` at 78, `onUp` at 257-258)
- Modify: `media/webview.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing new.

**Background the implementer needs.** Two pan gestures already exist and neither gives any feedback: hold space and drag with the left button, or drag with the middle button (`pointer.ts:78`). The wheel gesture deliberately gets **no** cursor — it has no mode to signal.

There is also a live bug being fixed here: `spaceDown` is set from a `window` keydown and cleared from a `window` keyup, so alt-tabbing away while holding space loses the keyup and strands the editor in pan mode. Invisible today; obvious once there is a grab cursor. A `blur` handler clears it.

The controller does not have a reference to the canvas host, so the classes go on the `<svg>` element, which `attach` already receives. Store it — `attach` runs on every repaint with a fresh svg, so the stored reference must be refreshed there too.

- [ ] **Step 1: Add the svg reference and the blur handler**

Add the field alongside the others:

```ts
  /** Refreshed on every attach(); repaint() builds a new svg each time. */
  private svg: SVGSVGElement | null = null;
```

Replace the two bound key handlers at `pointer.ts:42-43`:

```ts
  private boundKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space') { this.spaceDown = true; this.syncCursor(); }
  };
  private boundKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') { this.spaceDown = false; this.syncCursor(); }
  };
  /** Leaving the webview with space held loses the keyup, which would strand
   *  the editor in pan mode. */
  private boundBlur = (): void => { this.spaceDown = false; this.syncCursor(); };

  private syncCursor(): void {
    if (!this.svg) { return; }
    this.svg.classList.toggle('ceasg-pan-armed', this.spaceDown && !this.panning);
    this.svg.classList.toggle('ceasg-pan-active', this.panning);
  }
```

- [ ] **Step 2: Register blur and store the svg in `attach`**

In `attach`, store the element and mirror the existing remove-then-add pattern for the new listener:

```ts
    this.svg = svg;
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('blur', this.boundBlur);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundBlur);
    this.syncCursor();
```

- [ ] **Step 3: Sync the cursor when panning starts and stops**

At `pointer.ts:78`, after `this.panning = true;` and before the `return`, add `this.syncCursor();`. In `onUp`, after `this.panning = false; this.down = null;`, add `this.syncCursor();`.

- [ ] **Step 4: Add the CSS**

Append to `media/webview.css`:

```css
.ceasg-canvas svg.ceasg-pan-armed { cursor: grab; }
.ceasg-canvas svg.ceasg-pan-active { cursor: grabbing; }
```

- [ ] **Step 5: Check types and lint**

Run: `pnpm check-types && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Verify in the running extension**

Run: `pnpm compile`, launch the extension host, open a flowchart block, and check:

1. Holding space shows a grab cursor; pressing and dragging shows grabbing; releasing returns to the default.
2. Middle-button drag shows grabbing while held.
3. Hold space, alt-tab away and back — the cursor is back to default and clicking selects a node instead of panning.
4. The wheel gesture changes no cursor.

- [ ] **Step 7: Commit**

```bash
git add src/webview/wysiwyg/pointer.ts media/webview.css
git commit -m "feat(canvas): grab cursor while drag-panning, clear space on blur"
```

---

### Task 8: Documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md:26`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

**Background the implementer needs.** The changelog follows Keep a Changelog with `## [x.y.z] - YYYY-MM-DD` headings and `### Added` / `### Changed` / `### Fixed` subsections. The current release is `0.6.0`. This adds a user-facing feature, so it goes under a new `0.7.0` heading. Do **not** bump `version` in `package.json` — releases are cut separately, and commit `1ce3ba0` shows changelog entries being dated on release day.

- [ ] **Step 1: Add the changelog entry**

Insert directly above the `## [0.6.0] - 2026-07-29` heading:

```markdown
## [0.7.0] - Unreleased

### Added
- **Wheel and trackpad panning** on the visual editor canvas. Scroll or swipe with two fingers to pan in any direction; hold `Shift` to pan horizontally with a mouse wheel. `Ctrl`/`Cmd` + wheel still zooms, and trackpad pinch-to-zoom now works too.
- The canvas shows a **grab cursor** while space-drag or middle-button panning is armed, so the existing drag-to-pan gestures are discoverable.

### Changed
- Panning now stops at the edge of the diagram instead of scrolling it off-screen. Push past the edge and the canvas resists, then springs back, always leaving part of the diagram in view. Applies to every pan gesture, including the existing space-drag and middle-button drag.

### Fixed
- Holding space and switching away from the editor no longer leaves the canvas stuck in pan mode.
```

- [ ] **Step 2: Update the README usage line**

In `README.md`, extend the numbered usage item at line 26 so it ends with:

```markdown
Pan with the wheel or a two-finger swipe (hold `Shift` for horizontal), zoom with `Ctrl`/`Cmd` + wheel or pinch, or drag with the middle button.
```

- [ ] **Step 3: Full verification before the final commit**

Run: `pnpm test:unit && pnpm check-types && pnpm lint`
Expected: all three clean. Paste the actual output rather than asserting success from memory.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: document wheel/trackpad panning and pan bounds"
```

---

## Self-Review Notes

Checked against the spec:

- Every row of the spec's Decisions table maps to a task: pan-not-zoom and ctrl/meta zoom (Task 2), ignore-during-drag and ignore-while-label-editing (Tasks 5-6), soft clamp with rubber band and the `panBy` clamp scope (Tasks 1, 3), dampened-and-capped overshoot (Task 1).
- Every spec edge case has coverage: bounds never set (Task 3, explicit test), empty diagram (handled by `computeContentBounds`'s existing default), degenerate collapse (Task 1 test), repaint mid-spring (Task 4 ordering), space-held-on-blur (Task 7), momentum (Task 6's 150ms timer).
- Both spec-listed ride-along fixes are present: `zoomBy` hard clamp (Task 3) and the blur fix (Task 7).
- Names are consistent across tasks: `setContentBounds`, `dispose`, `settle`, `hostHeight`, `wheelToGesture`, `isLabelEditorOpen`, `allowedRange`, `overshootOf`, `dampenDelta`, `springStep`.
- Everything the spec put out of scope stays out: no proportional zoom, no rAF coalescing, no label-editor repositioning, no `ceasg.wheelBehavior` setting.

Known coverage limit, accepted during design: `pointer.ts` has no spec file and does not gain one, so the `onWheel` guards and the settle timer are verified by the manual checklist in Task 6 Step 6 rather than automated tests. `Viewport.settle()`'s animation loop is likewise unverified by tests — its decay function is covered in Task 1, and driving rAF in jsdom would add flake without adding real coverage.
