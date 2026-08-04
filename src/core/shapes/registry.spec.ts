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

describe('registry invariants', () => {
  it('canonical names are unique', () => {
    const names = ALL_SHAPES.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('no alias is claimed by two shapes', () => {
    const owner = new Map<string, string>();
    const collisions: string[] = [];
    for (const def of ALL_SHAPES) {
      for (const alias of def.aliases) {
        const key = alias.toLowerCase();
        const prev = owner.get(key);
        if (prev && prev !== def.name) { collisions.push(`${alias}: ${prev} vs ${def.name}`); }
        owner.set(key, def.name);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('no alias shadows a different shape canonical name', () => {
    const canonical = new Set(ALL_SHAPES.map((d) => d.name.toLowerCase()));
    for (const def of ALL_SHAPES) {
      for (const alias of def.aliases) {
        if (canonical.has(alias.toLowerCase())) {
          expect(alias.toLowerCase(), `alias "${alias}" of ${def.name}`).toBe(def.name.toLowerCase());
        }
      }
    }
  });

  it('every shape belongs to exactly one declared group', () => {
    const ids = new Set(SHAPE_GROUPS.map((g) => g.id));
    for (const def of ALL_SHAPES) { expect(ids.has(def.group), def.name).toBe(true); }
  });

  // unskip in Task 14, once every group has members
  it.skip('no group is empty', () => {
    for (const g of SHAPE_GROUPS) { expect(g.shapes.length, g.id).toBeGreaterThan(0); }
  });

  it('every shape that had a bracket form before still has one', () => {
    for (const name of ['rect', 'rounded', 'stadium', 'fr-rect', 'cyl', 'circle',
      'dbl-circ', 'diam', 'hex', 'lean-r', 'lean-l', 'trap-b', 'trap-t', 'odd']) {
      expect(SHAPES[name]?.bracket, `${name} lost its bracket form`).toBeDefined();
    }
  });
});
