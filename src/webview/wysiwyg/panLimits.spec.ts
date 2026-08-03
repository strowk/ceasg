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
