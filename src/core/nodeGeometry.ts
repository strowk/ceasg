/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): import paths and a DOM accessor shim; core logic unchanged.
 */

/*
 * Node size estimation, shared by the canvas renderer (geom cache) and the
 * auto layout so both always agree on node dimensions.
 */

import type { DiagramNode, NodeStyle } from "./model";
import { BASE_FONT_FAMILY, BASE_FONT_SIZE, measureTextWidth } from "./textMetrics";

export const NODE_H = 44;
export const MIN_W = 80;
/** Padding around the label: 32px horizontally, 28px vertically. */
const PAD_W = 32;
const PAD_H = 28;
/**
 * How much of a diamond's rhombus the label may occupy, as `tw/w + th/h`.
 * 1.0 means the label's corners exactly touch the sloped edges, so this leaves
 * a 30% margin. Calibrated to sit just above the historical ratio for a typical
 * short label (`Choice` at 16px ≈ 0.67), which is why ordinary diamonds keep
 * their existing size.
 */
const DIAMOND_FIT = 0.7;

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
	let w = Math.max(MIN_W, Math.ceil(widest) + PAD_W);
	let h = fontSize * lines.length + PAD_H;
	switch (node.shape) {
		case "circle":
		case "double-circle": {
			const d = Math.max(w, 66);
			w = d;
			h = d;
			break;
		}
		case "diamond": {
			w = Math.max(w + 28, 100);
			// A diamond needs extra height for its points; floor at the historical
			// 72 so default-font diamonds are unchanged.
			h = Math.max(72, h + PAD_H);
			// The box above only pads by fixed amounts, but a rhombus pinches in
			// toward its points: it contains a tw x th label only where
			// tw/w + th/h <= 1. Fixed padding therefore gets relatively tighter as
			// the label grows, and long or multi-line labels overflow outright.
			// Grow both axes uniformly (preserving the diamond's aspect) until the
			// label sits within DIAMOND_FIT of the edges.
			const grow = (widest / w + (fontSize * lines.length) / h) / DIAMOND_FIT;
			if (grow > 1) {
				w = Math.ceil(w * grow);
				h = Math.ceil(h * grow);
			}
			break;
		}
		case "hexagon":
			w += 40;
			break;
		case "parallelogram":
		case "parallelogram-alt":
		case "trapezoid":
		case "trapezoid-alt":
			w += 46;
			break;
		case "asymmetric":
			w += 26;
			break;
		case "cylinder":
			h += 20;
			break;
		case "stadium":
			w += 16;
			break;
	}
	return { w, h };
}
