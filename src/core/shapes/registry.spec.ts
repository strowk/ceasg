import { describe, it, expect } from 'vitest';
import { SHAPES, ALL_SHAPES, SHAPE_GROUPS, ALIAS_INDEX, lookupShape } from './registry';

describe('registry', () => {
  it('registers every currently supported shape under its Mermaid name', () => {
    for (const name of ['rect', 'rounded', 'stadium', 'fr-rect', 'cyl', 'circle',
      'dbl-circ', 'diam', 'hex', 'lean-r', 'lean-l', 'trap-b', 'trap-t', 'odd']) {
      expect(SHAPES[name], `missing ${name}`).toBeDefined();
    }
    expect(ALL_SHAPES).toHaveLength(14);
  });

  it('resolves historical ceasg names through aliases', () => {
    expect(ALIAS_INDEX.get('double-circle')).toBe('dbl-circ');
    expect(ALIAS_INDEX.get('parallelogram-alt')).toBe('lean-l');
    expect(ALIAS_INDEX.get('subroutine')).toBe('fr-rect');
    expect(ALIAS_INDEX.get('asymmetric')).toBe('odd');
  });

  it('resolves Mermaid aliases', () => {
    expect(ALIAS_INDEX.get('database')).toBe('cyl');
    expect(ALIAS_INDEX.get('question')).toBe('diam');
    expect(ALIAS_INDEX.get('lean-right')).toBe('lean-r');
  });

  it('lookupShape accepts a canonical name or any alias, case-insensitively', () => {
    expect(lookupShape('CYL')?.name).toBe('cyl');
    expect(lookupShape('Database')?.name).toBe('cyl');
    expect(lookupShape('nonsense')).toBeUndefined();
  });

  it('every shape has a bracket form, since all 14 predate @{} syntax', () => {
    for (const def of ALL_SHAPES) {
      expect(def.bracket, `${def.name} lost its bracket form`).toBeDefined();
    }
  });

  it('groups are in palette order and contain every shape exactly once', () => {
    expect(SHAPE_GROUPS.map((g) => g.id)).toEqual(
      ['basic', 'process', 'data', 'documents', 'flow', 'annotations']);
    const flat = SHAPE_GROUPS.flatMap((g) => g.shapes.map((s) => s.name));
    expect(flat.slice().sort()).toEqual(ALL_SHAPES.map((s) => s.name).sort());
  });
});
