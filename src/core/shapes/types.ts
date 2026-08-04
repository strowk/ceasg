/*
 * Shape vocabulary shared by the registry, the renderer, the palette and the
 * layout. Defined here rather than in model.ts so the registry can be imported
 * without pulling in the diagram model.
 */

import type { NodeStyle } from '../model';

/** Registry keys are Mermaid v11 canonical short names. */
export type ShapeName = string & { readonly __shapeName?: unique symbol };

export type ShapeGroupId =
  | 'basic' | 'process' | 'data' | 'documents' | 'flow' | 'annotations';

/** Display titles for the palette, in palette order. */
export const SHAPE_GROUP_TITLES: Array<{ id: ShapeGroupId; title: string }> = [
  { id: 'basic', title: 'Basic' },
  { id: 'process', title: 'Process' },
  { id: 'data', title: 'Data & I/O' },
  { id: 'documents', title: 'Documents' },
  { id: 'flow', title: 'Flow Control' },
  { id: 'annotations', title: 'Annotations' },
];

/** A node's box, pre-resolved so every render function reads the same fields. */
export interface ShapeGeom {
  cx: number; cy: number; w: number; h: number;
  left: number; right: number; top: number; bottom: number;
  hw: number; hh: number;
}

/** What `estimateNodeSize` already computed, handed to a def's `size` rule. */
export interface SizingCtx {
  style?: NodeStyle;
  /** Width of the widest label line, in px, in the resolved font. */
  widest: number;
  fontSize: number;
  lineCount: number;
}

export type Pt = [number, number];

export interface ShapeDef {
  /** Mermaid canonical short name; the registry key. */
  name: ShapeName;
  /** Human label for the palette and the properties dropdown. */
  label: string;
  group: ShapeGroupId;
  /** Every Mermaid alias plus ceasg's historical name. Must not collide. */
  aliases: string[];
  /** Bracket serialization, present only for shapes Mermaid can express that way. */
  bracket?: (id: string, label: string) => string;
  /** Adjust the label-derived box. Omit when the base box is correct. */
  size?: (base: { w: number; h: number }, ctx: SizingCtx) => { w: number; h: number };
  /** Outline for edge anchoring. Omit to use bounding-box math. */
  outline?: (g: ShapeGeom) => Pt[];
  render: (g: ShapeGeom) => SVGElement[];
}
