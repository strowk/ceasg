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

import { DEFAULT_WRAP_WIDTH, layoutLabel, type LabelLayout } from "./labelMarkup";
import type { DiagramEdge, DiagramNode, NodeStyle } from "./model";
import { lookupShape } from "./shapes";
import { BASE_FONT_FAMILY, BASE_FONT_SIZE } from "./textMetrics";

export const NODE_H = 44;
export const MIN_W = 80;
/** Padding around the label: 32px horizontally, 28px vertically. */
const PAD_W = 32;
const PAD_H = 28;

/** Default edge-label font size; matches the `.ceasg-edge-label` rule.
 *  Declared here, above `edgeLabelLayout`'s first use of it, because `const`
 *  is not hoisted the way `function` is. */
export const EDGE_LABEL_FONT_SIZE = 12;

/**
 * The laid-out label of a node: parsed, styled and wrapped.
 *
 * The renderer and `estimateNodeSize` both call this, so the box a node
 * reserves and the glyphs painted inside it can never disagree.
 *
 * A manually resized node wraps to its own width rather than Mermaid's default,
 * so dragging a resize handle reflows the text instead of overflowing it.
 */
export function nodeLabelLayout(node: DiagramNode, style?: NodeStyle): LabelLayout {
	return layoutLabel(node.label || node.id, {
		markdown: node.labelFormat === "markdown",
		fontSize: style?.fontSize ?? BASE_FONT_SIZE,
		fontFamily: style?.fontFamily ?? BASE_FONT_FAMILY,
		wrapWidth: node.w ? Math.max(1, node.w - PAD_W) : DEFAULT_WRAP_WIDTH,
	});
}

/** The laid-out label of an edge; see `nodeLabelLayout`. */
export function edgeLabelLayout(edge: DiagramEdge): LabelLayout {
	return layoutLabel(edge.label, {
		markdown: edge.labelFormat === "markdown",
		fontSize: edge.style?.fontSize ?? EDGE_LABEL_FONT_SIZE,
		fontFamily: BASE_FONT_FAMILY,
		wrapWidth: DEFAULT_WRAP_WIDTH,
	});
}

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
	const layout = nodeLabelLayout(node, style);
	const widest = layout.width;
	const base = {
		w: Math.max(MIN_W, Math.ceil(widest) + PAD_W),
		h: fontSize * layout.lines.length + PAD_H,
	};
	const def = lookupShape(node.shape);
	if (!def?.size) {
		return base;
	}
	return def.size(base, { style, widest, fontSize, lineCount: layout.lines.length });
}

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
// `layout` is optional so a caller who already ran `edgeLabelLayout` (the
// renderer, painting the same edge's text right after sizing its background
// rect) can pass it through instead of laying the label out twice. Left
// unpassed, it is computed here as before — kept lazy (not a default
// parameter) so an unlabelled edge, the common case, still returns its zero
// box without ever calling into layout.
export function edgeLabelSize(edge: DiagramEdge, layout?: LabelLayout): { w: number; h: number } {
	if (!edge.label) {
		return { w: 0, h: 0 };
	}
	const fontSize = edge.style?.fontSize ?? EDGE_LABEL_FONT_SIZE;
	const lay = layout ?? edgeLabelLayout(edge);
	return {
		w: Math.ceil(lay.width) + EDGE_LABEL_PAD_W,
		h: fontSize * lay.lines.length + EDGE_LABEL_PAD_H,
	};
}
