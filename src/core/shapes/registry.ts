/*
 * The single source of truth for node shapes. Every other module derives from
 * this: model.ts (union, list, labels), parser.ts (alias resolution),
 * serializer.ts (bracket forms), nodeGeometry.ts (sizing), and both palettes.
 */

import { ANNOTATION_SHAPES } from './annotations';
import { BASIC_SHAPES } from './basic';
import { DATA_SHAPES } from './data';
import { DOCUMENT_SHAPES } from './documents';
import { FLOW_SHAPES } from './flow';
import { PROCESS_SHAPES } from './process';
import { SHAPE_GROUP_TITLES } from './types';
import type { ShapeDef, ShapeGroupId, ShapeName } from './types';

export const ALL_SHAPES: ShapeDef[] = [
  ...BASIC_SHAPES,
  ...PROCESS_SHAPES,
  ...DATA_SHAPES,
  ...DOCUMENT_SHAPES,
  ...FLOW_SHAPES,
  ...ANNOTATION_SHAPES,
];

export const SHAPES: Record<string, ShapeDef> = Object.fromEntries(
  ALL_SHAPES.map((d) => [d.name, d]),
);

export const SHAPE_GROUPS: Array<{ id: ShapeGroupId; title: string; shapes: ShapeDef[] }> =
  SHAPE_GROUP_TITLES.map(({ id, title }) => ({
    id,
    title,
    shapes: ALL_SHAPES.filter((d) => d.group === id),
  }));

/**
 * Every alias and every canonical name, lowercased, mapped to the canonical
 * name. Built once at module load. A duplicate alias would make resolution
 * order-dependent; registry.spec.ts asserts uniqueness rather than throwing
 * here, because a throw at import time would disable the whole extension.
 */
export const ALIAS_INDEX: Map<string, ShapeName> = (() => {
  const m = new Map<string, ShapeName>();
  for (const def of ALL_SHAPES) {
    m.set(def.name.toLowerCase(), def.name);
    for (const alias of def.aliases) {
      if (!m.has(alias.toLowerCase())) { m.set(alias.toLowerCase(), def.name); }
    }
  }
  return m;
})();

/** Resolve a canonical name or any alias, case-insensitively. */
export function lookupShape(name: string): ShapeDef | undefined {
  const canonical = ALIAS_INDEX.get(name.toLowerCase());
  return canonical === undefined ? undefined : SHAPES[canonical];
}
