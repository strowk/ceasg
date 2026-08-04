import { describe, it, expect } from 'vitest';
import { SHAPES, ALL_SHAPES, SHAPE_GROUPS, ALIAS_INDEX, lookupShape } from './registry';

describe('registry', () => {
  it('registers every currently supported shape under its Mermaid name', () => {
    for (const name of ['rect', 'rounded', 'stadium', 'fr-rect', 'cyl', 'circle',
      'dbl-circ', 'diam', 'hex', 'lean-r', 'lean-l', 'trap-b', 'trap-t', 'odd']) {
      expect(SHAPES[name], `missing ${name}`).toBeDefined();
    }
    expect(ALL_SHAPES).toHaveLength(48);
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

  it('every shape has a bracket form, except ones deliberately attr-only', () => {
    // Task 11's 10 rect/line/circle shapes are new to Mermaid v11's `@{}`
    // syntax and never had a bracket shorthand; they, and `text`, serialize
    // only through the @{ shape: X, ... } attr form.
    const attrOnly = new Set([
      'text', 'lin-rect', 'div-rect', 'win-pane', 'lin-cyl',
      'fork', 'sm-circ', 'f-circ', 'fr-circ', 'cross-circ',
      // Task 12's 9 polygon shapes: also new to Mermaid v11's `@{}` syntax,
      // with no classic bracket shorthand of their own.
      'tri', 'flip-tri', 'notch-rect', 'notch-pent', 'sl-rect',
      'bow-rect', 'hourglass', 'bolt', 'bang',
      // Task 13's 12 curve shapes: same story — none carries an
      // `internalAliases` entry in Mermaid's vendored `shapesDefs`, meaning
      // none has a classic bracket handler to fall back to.
      'doc', 'lin-doc', 'tag-doc', 'tag-rect', 'delay', 'curv-trap',
      'h-cyl', 'datastore', 'flag', 'brace', 'brace-r', 'braces',
      // Task 14's 3 stacked shapes: same story again — no `internalAliases`
      // entry for st-rect, docs or cloud in the vendored shapesDefs.
      'st-rect', 'docs', 'cloud',
    ]);
    for (const def of ALL_SHAPES) {
      if (attrOnly.has(def.name)) { continue; }
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

  it('no group is empty', () => {
    for (const g of SHAPE_GROUPS) { expect(g.shapes.length, g.id).toBeGreaterThan(0); }
  });

  it('every shape that had a bracket form before still has one', () => {
    for (const name of ['rect', 'rounded', 'stadium', 'fr-rect', 'cyl', 'circle',
      'dbl-circ', 'diam', 'hex', 'lean-r', 'lean-l', 'trap-b', 'trap-t', 'odd']) {
      expect(SHAPES[name]?.bracket, `${name} lost its bracket form`).toBeDefined();
    }
  });
});
