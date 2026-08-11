/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): import paths and a DOM accessor shim; core logic unchanged.
 */

/*
 * Node and edge-label size estimation, shared by the canvas renderer (geom
 * cache) and the auto layout so both always agree on dimensions.
 */

import type { DiagramEdge, DiagramNode, NodeStyle } from "./model";
import { lookupShape } from "./shapes";
import { BASE_FONT_FAMILY, BASE_FONT_SIZE, measureTextWidth } from "./textMetrics";

export const NODE_H = 44;
export const MIN_W = 80;
/** Padding around the label: 32px horizontally, 28px vertically. */
const PAD_W = 32;
const PAD_H = 28;

/**
 * Size a node from its manual w/h or its label text + shape padding.
 *
 * `style` is the node's *resolved* style (see `resolveNodeStyle`); its
 * `fontSize`/`fontFamily` decide the font the label is measured in, so a node
 * styled `font-size:24px` gets a box that actually fits its text. At the
 * default 16px the formulas below reproduce the historical constants exactly
 * (h = NODE_H = 44 for one line, +16 per extra line), so unstyled diagrams
 * keep their existing geometry.
 */
export function estimateNodeSize(
	node: DiagramNode,
	style?: NodeStyle,
): { w: number; h: number } {
	if (node.w && node.h) {
		return { w: node.w, h: node.h };
	}
	const fontSize = style?.fontSize ?? BASE_FONT_SIZE;
	const font = `${fontSize}px ${style?.fontFamily ?? BASE_FONT_FAMILY}`;
	const rawLabel = node.label || node.id;
	const lines = rawLabel.split("\n");
	// Width uses the widest measured line; height grows for multi-line labels.
	const widest = Math.max(...lines.map((l) => measureTextWidth(l, font)));
	const base = {
		w: Math.max(MIN_W, Math.ceil(widest) + PAD_W),
		h: fontSize * lines.length + PAD_H,
	};
	const def = lookupShape(node.shape);
	if (!def?.size) {
		return base;
	}
	return def.size(base, { style, widest, fontSize, lineCount: lines.length });
}

/** Default edge-label font size; matches the `.ceasg-edge-label` rule. */
export const EDGE_LABEL_FONT_SIZE = 12;
/** Padding of the label's background rect around the text. */
const EDGE_LABEL_PAD_W = 8;
const EDGE_LABEL_PAD_H = 6;

/**
 * The box an edge label is drawn in. The renderer paints its background rect at
 * this size and the auto layout hands it to dagre as the edge's label size, so
 * a labelled edge separates its ranks enough for the text to sit between the
 * nodes instead of on top of them — this is why Mermaid's own render pushes A
 * and B apart when the edge carries text.
 *
 * An unlabelled edge is a zero box, which is dagre's default: no extra space.
 */
export function edgeLabelSize(edge: DiagramEdge): { w: number; h: number } {
	if (!edge.label) {
		return { w: 0, h: 0 };
	}
	const fontSize = edge.style?.fontSize ?? EDGE_LABEL_FONT_SIZE;
	const font = `${fontSize}px ${BASE_FONT_FAMILY}`;
	return {
		w: Math.ceil(measureTextWidth(edge.label, font)) + EDGE_LABEL_PAD_W,
		h: fontSize + EDGE_LABEL_PAD_H,
	};
}
