import { describe, it, expect, vi } from 'vitest';
import { computeContentBounds, Viewport } from './viewport';
import { emptyModel, groupBounds } from '../../core';

describe('computeContentBounds', () => {
  it('covers all node boxes with padding', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, w: 80, h: 44 });
    m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 200, y: 100, w: 80, h: 44 });
    const b = computeContentBounds(m);
    expect(b.minX).toBeLessThanOrEqual(-40);
    expect(b.maxX).toBeGreaterThanOrEqual(240);
    expect(b.maxY).toBeGreaterThanOrEqual(122);
  });

  it('includes the subgraph box (its title band above the top node) with margin to spare', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 100, w: 80, h: 44 });
    m.groups.push({ id: 'g1', title: 'g1', nodeIds: ['A'] });
    const gb = groupBounds(m, m.groups[0]);
    const b = computeContentBounds(m);
    // Content top must sit ABOVE the group box top (box top is not clipped, and
    // there is real padding beyond it — the reported viewport spill).
    expect(b.minY).toBeLessThan(gb.y);
    expect(gb.y - b.minY).toBeGreaterThanOrEqual(40);
  });
});

describe('Viewport.resize', () => {
  it('recomputes the viewBox from the new host size, preserving pan and zoom', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    const host = { clientWidth: 800, clientHeight: 600 };
    const vp = new Viewport(svg, host as unknown as HTMLElement);

    vp.setTransform({ zoom: 2, vbX: 10, vbY: 20 });
    expect(svg.getAttribute('viewBox')).toBe('10 20 400 300');

    host.clientWidth = 1000;
    vp.resize();

    // Same pan origin and zoom; only the visible extent grew.
    expect(svg.getAttribute('viewBox')).toBe('10 20 500 300');
    expect(vp.scale).toBe(2);
  });
});

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
    // over = 60, delta = 100, factor = 1 - 60/120 = 0.5 -> applied = 50
    expect(vp.getTransform().vbX).toBeCloseTo(2030);
  });

  it('scales the damping overshoot term by zoom, not just the delta', () => {
    // A delta-only reading of dampenDelta's second argument would still land
    // inside the hard cap at zoom 1, hiding the bug; this starts well inside
    // the cap band at zoom 2, where the two readings diverge, to expose it.
    const vp = vpWith(BOUNDS);
    vp.setTransform({ zoom: 2, vbX: 1970, vbY: 0 }); // hi=1960; 10 vb units (20 screen px) over
    vp.panBy(-100, 0); // deltaVb = 50; screen-px overshoot = 20; factor = 1 - 20/120
    expect(vp.getTransform().vbX).toBeCloseTo(2011.667, 2);
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

describe('Viewport.panBy', () => {
  it('cancels an in-flight spring so it cannot later overwrite the gesture', () => {
    // requestAnimationFrame/cancelAnimationFrame are mocked rather than driven —
    // the point is to observe whether panBy resets springHandle, not to
    // execute the spring's animation loop (see the no-rAF-testing constraint).
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as number);
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    try {
      const vp = vpWith({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 });
      vp.setTransform({ zoom: 1, vbX: 1980, vbY: 0 }); // past hi of 1920, so settle() arms
      vp.settle();
      expect(raf).toHaveBeenCalledTimes(1);

      vp.panBy(-10, 0);
      expect(caf).toHaveBeenCalledTimes(1); // the stale spring got cancelled

      // If panBy had left springHandle set, this settle() would be a no-op
      // (settle() bails when a handle is already in flight) and rAF would not
      // be called again — so a second call proves the handle was cleared.
      vp.settle();
      expect(raf).toHaveBeenCalledTimes(2);
    } finally {
      raf.mockRestore();
      caf.mockRestore();
    }
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
