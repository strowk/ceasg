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

  return { kind: 'pan', dx: dx === 0 ? 0 : -dx, dy: dy === 0 ? 0 : -dy };
}
