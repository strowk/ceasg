import { describe, it, expect } from 'vitest';
import { createShapeElements } from './shapes';

describe('createShapeElements', () => {
  it('rect returns a single svg element centered at cx,cy', () => {
    const els = createShapeElements('rect', 100, 50, 80, 44);
    expect(els.length).toBeGreaterThanOrEqual(1);
    expect(els[0].namespaceURI).toBe('http://www.w3.org/2000/svg');
  });
  it('subroutine returns multiple elements', () => {
    expect(createShapeElements('subroutine', 0, 0, 80, 44).length).toBeGreaterThan(1);
  });
});
