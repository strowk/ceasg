import { describe, it, expect } from 'vitest';
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
