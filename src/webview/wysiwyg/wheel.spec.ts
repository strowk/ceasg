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
