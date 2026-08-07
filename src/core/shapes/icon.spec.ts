import { describe, it, expect } from 'vitest';
import { createShapeIcon } from './index';
import { ALL_SHAPES } from './registry';

/**
 * The palette and the toolbar dropdown both draw their previews with
 * `createShapeIcon`. It once tagged its elements with only `mermaid-flow-shape`
 * — a class carried over from the Obsidian port that no stylesheet has ever
 * defined — so icons fell back to the SVG defaults of a black fill and no
 * stroke. Filled shapes still showed up, which hid the problem; every
 * stroke-only shape drew nothing at all. All three comment shapes are built
 * purely from `unfilled(path(...))` and were invisible in the palette, as were
 * the divider lines inside the framed and lined shapes.
 */
describe('createShapeIcon', () => {
  it('gives every drawn element the class the stylesheet actually targets', () => {
    // `.ceasg-shape` is the rule in diagram.css that supplies fill and stroke,
    // and it is the same class the canvas renderer uses — so an icon previews
    // what the node will look like instead of being styled separately.
    for (const def of ALL_SHAPES) {
      const svg = createShapeIcon(def.name);
      for (const el of Array.from(svg.children)) {
        expect(el.classList.contains('ceasg-shape'), `${def.name} <${el.tagName}>`).toBe(true);
      }
    }
  });

  it('draws the stroke-only comment shapes rather than nothing', () => {
    // These have no fill by construction, so a missing stroke means an empty
    // icon. Guards the specific regression above.
    for (const name of ['brace', 'brace-r', 'braces']) {
      const svg = createShapeIcon(name);
      expect(svg.children.length, name).toBeGreaterThan(0);
      for (const el of Array.from(svg.children)) {
        expect(el.getAttribute('fill'), name).toBe('none');
        expect(el.classList.contains('ceasg-shape'), name).toBe(true);
      }
    }
  });

  it('sizes itself through a viewBox so the sidebar can scale it', () => {
    const svg = createShapeIcon('rect');
    expect(svg.getAttribute('viewBox')).toBe('0 0 36 24');
    expect(svg.classList.contains('mermaid-flow-shape-icon')).toBe(true);
  });
});
