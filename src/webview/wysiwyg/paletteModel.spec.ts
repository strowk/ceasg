import { describe, it, expect, vi } from 'vitest';
import { NODE_SHAPES } from '../../core';
import { PALETTE_GROUPS, SHAPE_DRAG_TYPE, createPaletteItemButton, findPaletteItem } from './paletteModel';

describe('PALETTE_GROUPS', () => {
  it('ships exactly one group, Basic, holding every node shape', () => {
    expect(PALETTE_GROUPS).toHaveLength(1);
    expect(PALETTE_GROUPS[0].id).toBe('basic');
    expect(PALETTE_GROUPS[0].title).toBe('Basic');
    expect(PALETTE_GROUPS[0].items).toHaveLength(NODE_SHAPES.length);
  });

  it('every item carries a valid shape as its drag payload and a human title', () => {
    for (const item of PALETTE_GROUPS[0].items) {
      expect(item.dragType).toBe(SHAPE_DRAG_TYPE);
      expect(NODE_SHAPES).toContain(item.dragData);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it('item ids are unique', () => {
    const ids = PALETTE_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('findPaletteItem', () => {
  it('round-trips every item from its own drag payload', () => {
    for (const item of PALETTE_GROUPS.flatMap((g) => g.items)) {
      expect(findPaletteItem(item.dragType, item.dragData)).toBe(item);
    }
  });

  it('returns undefined for a foreign type or an unknown payload', () => {
    expect(findPaletteItem('text/uri-list', 'https://example.com/')).toBeUndefined();
    expect(findPaletteItem(SHAPE_DRAG_TYPE, 'not-a-shape')).toBeUndefined();
  });
});

describe('createPaletteItemButton', () => {
  const item = PALETTE_GROUPS[0].items[0];

  it('builds a draggable button with the icon and a tooltip', () => {
    const btn = createPaletteItemButton(item, () => {});
    expect(btn.type).toBe('button');
    expect(btn.className).toBe('ceasg-palette-item');
    expect(btn.title).toBe(item.title);
    expect(btn.draggable).toBe(true);
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('writes the drag payload on dragstart', () => {
    const btn = createPaletteItemButton(item, () => {});
    const calls: [string, string][] = [];
    const ev = new Event('dragstart');
    Object.defineProperty(ev, 'dataTransfer', {
      value: { setData: (t: string, d: string) => { calls.push([t, d]); } },
    });
    btn.dispatchEvent(ev);
    expect(calls).toEqual([[item.dragType, item.dragData]]);
  });

  it('calls onActivate with the item on click', () => {
    const onActivate = vi.fn();
    const btn = createPaletteItemButton(item, onActivate);
    btn.click();
    expect(onActivate).toHaveBeenCalledWith(item);
  });
});
