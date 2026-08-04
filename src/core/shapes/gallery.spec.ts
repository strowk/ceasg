import { describe, it, expect } from 'vitest';
import { buildGallery } from './gallery';
import { ALL_SHAPES, SHAPE_GROUPS } from './registry';

describe('buildGallery', () => {
  it('includes every registered shape', () => {
    const out = buildGallery();
    for (const def of ALL_SHAPES) {
      expect(out, def.name).toContain(`shape: ${def.name}`);
    }
  });

  it('emits one mermaid block per group, in palette order', () => {
    const out = buildGallery();
    const headings = (out.match(/^## .+$/gm) ?? []).map((h) => h.slice(3));
    expect(headings).toEqual(SHAPE_GROUPS.map((g) => g.title));
    expect((out.match(/```mermaid/g) ?? [])).toHaveLength(SHAPE_GROUPS.length);
  });

  it('labels each node with its canonical name so the render is self-describing', () => {
    expect(buildGallery()).toContain('label: "doc"');
  });
});
