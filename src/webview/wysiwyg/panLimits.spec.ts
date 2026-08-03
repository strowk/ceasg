import { describe, it, expect } from 'vitest';
import { allowedRange, overshootOf, dampenDelta, springStep, VISIBLE_MARGIN, OVERSHOOT_CAP } from './panLimits';

describe('allowedRange', () => {
  it('permits panning until only `margin` of content remains visible', () => {
    // content [0, 1000], viewport 400 wide, keep 80 visible
    const r = allowedRange(0, 1000, 400, 80);
    expect(r.lo).toBe(-320); // 0 + 80 - 400
    expect(r.hi).toBe(920);  // 1000 - 80
  });

  it('caps the margin at the content extent when the content is narrower than the margin', () => {
    // content extent is only 40, less than the requested 80px margin -> effective margin = 40
    const r = allowedRange(100, 140, 500, 80);
    expect(r.lo).toBe(-360); // 100 + 40 - 500
    expect(r.hi).toBe(100);  // 140 - 40
  });

  it('no longer collapses once the margin is capped at the content extent, if the viewport can still hold it', () => {
    // Content extent is 10, so effective margin = min(80, 10) = 10 (not 80).
    // With the pre-fix, uncapped margin this scenario collapsed to a midpoint;
    // with the capped margin, viewSize (20) exceeds the content extent (10),
    // so a real, non-degenerate range exists.
    const r = allowedRange(0, 10, 20, 80);
    expect(r.lo).toBe(-10); // 0 + 10 - 20
    expect(r.hi).toBe(0);   // 10 - 10
  });

  it('still collapses to the midpoint when the viewport is too small to satisfy even the capped margin', () => {
    // content extent 10 -> effective margin = min(80, 10) = 10; a 4-unit
    // viewport is smaller than the content itself, so no position satisfies
    // even the capped rule and the range must collapse rather than invert.
    const r = allowedRange(0, 10, 4, 80);
    expect(r.lo).toBe(r.hi);
    expect(r.lo).toBe((0 + 10 - 4 + (10 - 10)) / 2);
    expect(r.lo).toBe(3);
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
