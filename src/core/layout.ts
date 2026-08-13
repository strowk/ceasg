/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): import paths and a DOM accessor shim; core logic unchanged.
 */

/*
 * Auto layout. Used when a parsed diagram has no saved positions, or when the
 * user clicks "Auto layout".
 *
 * The engine is the recursive cluster layout in ./clusterLayout: dagre (the
 * same Sugiyama-style layered algorithm Mermaid itself uses) applied per
 * cluster, so each subgraph can pick its own rankdir — an explicit `direction`
 * line, or Mermaid's own perpendicular-flip rule for a self-contained subgraph
 * — while a subgraph that isn't self-contained still folds flat into its
 * parent's dagre graph as a compound cluster. If that ever throws, a trivial
 * grid fallback still places the nodes so the editor has something to show.
 */

import { DiagramModel, materializeGroupBounds, nodeSize } from "./model";
import { layoutClusters } from "./clusterLayout";
import { warn } from "./diagnostics";

const DEFAULT_RANK_GAP = 200; // distance between successive ranks (grid fallback)
const DEFAULT_CROSS_GAP = 110; // distance between siblings within a rank (grid fallback)
const ORIGIN = 60;

export function autoLayout(model: DiagramModel): void {
	if (model.nodes.length === 0) return;
	try {
		layoutClusters(model);
	} catch (e) {
		warn(
			"layout-failed",
			String(e),
			"Auto layout failed; using the grid fallback.",
			String(e),
		);
		gridFallback(model);
	}
	// Re-fit every group box to the freshly laid-out members and store it
	// explicitly, so boxes stay put during subsequent member drags.
	materializeGroupBounds(model, true);
}

/**
 * Last-resort placement if dagre throws: a simple square-ish grid so the editor
 * still shows the nodes. dagre is the real engine — this only guards a crash.
 */
function gridFallback(model: DiagramModel): void {
	const cols = Math.max(1, Math.ceil(Math.sqrt(model.nodes.length)));
	model.nodes.forEach((n, i) => {
		n.x = ORIGIN + (i % cols) * DEFAULT_CROSS_GAP;
		n.y = ORIGIN + Math.floor(i / cols) * DEFAULT_RANK_GAP;
	});
}

/**
 * Nudge overlapping node boxes apart with minimal movement so boxes never cover
 * each other. Runs on load so a diagram whose saved positions predate a box-size
 * change (e.g. a larger label font) still displays cleanly without re-running a
 * full layout (which would discard the user's manual arrangement).
 *
 * Idempotent: a diagram with no overlaps is left untouched, so well-spaced manual
 * layouts are preserved exactly.
 */
export function resolveOverlaps(model: DiagramModel, margin = 12): void {
	if (model.nodes.length < 2) return;
	const boxes = model.nodes.map((n) => {
		const s = nodeSize(model, n);
		return { n, hw: s.w / 2, hh: s.h / 2 };
	});

	const MAX_PASSES = 20;
	for (let pass = 0; pass < MAX_PASSES; pass++) {
		let moved = false;
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const A = boxes[i]!;
				const B = boxes[j]!;
				let dx = B.n.x - A.n.x;
				const dy = B.n.y - A.n.y;
				const ox = A.hw + B.hw + margin - Math.abs(dx);
				const oy = A.hh + B.hh + margin - Math.abs(dy);
				if (ox <= 0 || oy <= 0) continue; // boxes clear each other
				moved = true;
				if (dx === 0 && dy === 0) dx = i < j ? -1 : 1; // coincident: split
				// Separate along the axis of least penetration (least disruptive).
				if (ox < oy) {
					const push = (ox / 2) * (dx >= 0 ? 1 : -1);
					A.n.x -= push;
					B.n.x += push;
				} else {
					const push = (oy / 2) * (dy >= 0 ? 1 : -1);
					A.n.y -= push;
					B.n.y += push;
				}
			}
		}
		if (!moved) break;
	}

	// Keep everything in positive space after pushing.
	let minX = Infinity;
	let minY = Infinity;
	for (const b of boxes) {
		minX = Math.min(minX, b.n.x - b.hw);
		minY = Math.min(minY, b.n.y - b.hh);
	}
	const shiftX = minX < 20 ? 20 - minX : 0;
	const shiftY = minY < 20 ? 20 - minY : 0;
	for (const b of boxes) {
		b.n.x = Math.round(b.n.x + shiftX);
		b.n.y = Math.round(b.n.y + shiftY);
	}
}

/** Place nodes that still have no position (x===0 && y===0) onto a fallback grid. */
export function layoutMissing(model: DiagramModel): void {
	const unplaced = model.nodes.filter((n) => n.x === 0 && n.y === 0);
	if (unplaced.length === 0) return;
	if (unplaced.length === model.nodes.length) {
		autoLayout(model);
		return;
	}
	// A few new nodes among placed ones: drop them on a small grid past the
	// existing content in the diagram's flow direction, so they land where the
	// eye goes next instead of always far right.
	const horizontal = model.direction === "LR" || model.direction === "RL";
	if (horizontal) {
		let maxX = ORIGIN;
		for (const n of model.nodes) maxX = Math.max(maxX, n.x);
		unplaced.forEach((n, i) => {
			n.x = maxX + DEFAULT_RANK_GAP;
			n.y = ORIGIN + i * DEFAULT_CROSS_GAP;
		});
	} else {
		let maxY = ORIGIN;
		for (const n of model.nodes) maxY = Math.max(maxY, n.y);
		unplaced.forEach((n, i) => {
			n.x = ORIGIN + i * DEFAULT_CROSS_GAP;
			n.y = maxY + DEFAULT_RANK_GAP;
		});
	}
}
