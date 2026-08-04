import { describe, it, expect } from 'vitest';
import { fitGrow } from './sizing';

const ctx = (widest: number, lineCount = 1, fontSize = 16) =>
  ({ widest, lineCount, fontSize });

describe('fitGrow', () => {
  it('leaves a box alone when the label already fits', () => {
    expect(fitGrow({ w: 200, h: 120 }, ctx(20), 0.7)).toEqual({ w: 200, h: 120 });
  });

  it('grows both axes uniformly when the label is too wide', () => {
    const out = fitGrow({ w: 100, h: 72 }, ctx(90), 0.7);
    expect(out.w).toBeGreaterThan(100);
    expect(out.h).toBeGreaterThan(72);
    // Aspect is preserved, so the shape does not distort as it grows.
    expect(out.w / out.h).toBeCloseTo(100 / 72, 1);
  });

  it('grows for multi-line labels too', () => {
    expect(fitGrow({ w: 100, h: 72 }, ctx(20, 4), 0.7).h).toBeGreaterThan(72);
  });
});
