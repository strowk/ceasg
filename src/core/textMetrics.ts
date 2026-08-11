/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): import paths and a DOM accessor shim; core logic unchanged.
 */

/*
 * Text width measurement for node sizing. Uses a real canvas measureText when
 * available; falls back to a per-codepoint estimate where CJK/fullwidth
 * characters count double (the old chars × 8.2 heuristic underestimated them,
 * making wide labels overflow their shapes).
 */

import { getDocument } from './dom';

const FALLBACK_CHAR_W = 8.2;
// Bold glyphs are wider than their regular counterparts. Real `measureText`
// accounts for it; the per-codepoint fallback would not, which would size a
// bold label exactly like a plain one and let its text overflow the shape.
const FALLBACK_BOLD_FACTOR = 1.06;

// Must stay in lockstep with the .mermaid-flow-node-label font in styles.css, so
// the box we size matches the text we draw. Mermaid's stock flowchart font/size,
// which the rendered diagram uses — measuring with it keeps the canvas boxes the
// same size as the render's.
export const BASE_FONT_SIZE = 16;
export const BASE_FONT_FAMILY = '"trebuchet ms", verdana, arial, sans-serif';
const LABEL_FONT = `${BASE_FONT_SIZE}px ${BASE_FONT_FAMILY}`;

let ctx: CanvasRenderingContext2D | null | undefined;

function isWide(cp: number): boolean {
	return (
		cp >= 0x1100 &&
		(cp <= 0x115f || // Hangul Jamo
			(cp >= 0x2e80 && cp <= 0xa4cf) || // CJK radicals … Yi
			(cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
			(cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
			(cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
			(cp >= 0xff00 && cp <= 0xff60) || // Fullwidth forms
			(cp >= 0xffe0 && cp <= 0xffe6) ||
			cp >= 0x20000) // CJK extension B and beyond, emoji planes
	);
}

export function measureTextWidth(text: string, font: string = LABEL_FONT): number {
	if (ctx === undefined) {
		ctx = getDocument().createElement("canvas").getContext("2d");
	}
	if (ctx) {
		ctx.font = font;
		const w = ctx.measureText(text).width;
		if (w > 0) return w;
	}
	let units = 0;
	for (const ch of text) {
		units += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
	}
	// FALLBACK_CHAR_W is calibrated for BASE_FONT_SIZE, so scale it by the size
	// in `font` — otherwise the estimate is font-blind and a node styled
	// `font-size:32px` would get a box sized for 16px text.
	const px = /(\d+(?:\.\d+)?)px/.exec(font);
	const scale = px ? Number(px[1]) / BASE_FONT_SIZE : 1;
	const weight = /(^|\s)(bold|[6-9]00)(\s|$)/i.test(font) ? FALLBACK_BOLD_FACTOR : 1;
	return units * FALLBACK_CHAR_W * scale * weight;
}
