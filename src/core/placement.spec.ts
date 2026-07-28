import { describe, it, expect } from 'vitest';
import { emptyModel, nodeSize } from './model';
import { findFreeSpot } from './placement';

describe('findFreeSpot', () => {
	it('returns the requested point when nothing is there', () => {
		const m = emptyModel();
		expect(findFreeSpot(m, 100, 50, 'rect')).toEqual({ x: 100, y: 50 });
	});

	it('offsets down-right when the requested point is occupied', () => {
		const m = emptyModel();
		m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 50, w: 80, h: 44 });
		const p = findFreeSpot(m, 100, 50, 'rect');
		expect(p.x).toBeGreaterThan(100);
		expect(p.y).toBeGreaterThan(50);
	});

	it('returns a point whose box overlaps no existing node', () => {
		const m = emptyModel();
		// A staircase of nodes along the cascade direction, so a single step is not enough.
		for (let i = 0; i < 5; i++) {
			m.nodes.push({ id: `N${i}`, label: `N${i}`, shape: 'rect', x: 100 + i * 24, y: 50 + i * 24, w: 80, h: 44 });
		}
		const p = findFreeSpot(m, 100, 50, 'rect');
		const probe = { id: '', label: '', shape: 'rect' as const, x: p.x, y: p.y };
		const s = nodeSize(m, probe);
		for (const n of m.nodes) {
			const ns = nodeSize(m, n);
			const overlaps =
				Math.abs(n.x - p.x) < (s.w + ns.w) / 2 && Math.abs(n.y - p.y) < (s.h + ns.h) / 2;
			expect(overlaps).toBe(false);
		}
	});

	it('gives up after the step cap instead of looping forever', () => {
		const m = emptyModel();
		// Blanket the whole cascade path so no candidate is ever free.
		for (let i = 0; i < 200; i++) {
			m.nodes.push({ id: `N${i}`, label: `N${i}`, shape: 'rect', x: 100 + i * 24, y: 50 + i * 24, w: 400, h: 400 });
		}
		const p = findFreeSpot(m, 100, 50, 'rect');
		expect(Number.isFinite(p.x)).toBe(true);
		expect(p.x).toBeLessThanOrEqual(100 + 40 * 24);
	});
});
