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
 * The engine is dagre (the same Sugiyama-style layered algorithm Mermaid itself
 * uses): proper rank assignment, crossing minimisation, and compound clusters
 * keeping subgraph members together. If dagre ever throws, a trivial grid
 * fallback still places the nodes so the editor has something to show.
 */

import * as dagre from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre";
import {
	DiagramModel,
	groupDescendantNodeIds,
	materializeGroupBounds,
	nodeSize,
} from "./model";
import { edgeLabelSize } from "./nodeGeometry";
import { warn } from "./diagnostics";

const DEFAULT_RANK_GAP = 200; // distance between successive ranks (grid fallback)
const DEFAULT_CROSS_GAP = 110; // distance between siblings within a rank (grid fallback)
const ORIGIN = 60;

export function autoLayout(model: DiagramModel): void {
	if (model.nodes.length === 0) return;
	try {
		dagreLayout(model);
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

function dagreLayout(model: DiagramModel): void {
	const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({
		compound: true,
	});
	g.setGraph({
		rankdir: model.direction,
		// Defaults match Mermaid's flowchart defaults (nodeSpacing/rankSpacing 50)
		// so the auto-laid-out canvas tracks the render when spacing is unset.
		nodesep: model.config.nodeSpacing ?? 50,
		ranksep: model.config.rankSpacing ?? 50,
		marginx: ORIGIN,
		marginy: ORIGIN,
	});
	g.setDefaultEdgeLabel(() => ({}));

	const nodeIds = new Set(model.nodes.map((n) => n.id));
	for (const node of model.nodes) {
		const s = nodeSize(model, node);
		g.setNode(node.id, { width: s.w, height: s.h });
	}

	// Groups become compound clusters; nested groups parent to their parent group.
	const groupIds = new Set(model.groups.map((g) => g.id));
	for (const grp of model.groups) {
		if (nodeIds.has(grp.id)) continue; // id collision with a node — skip
		g.setNode(grp.id, { width: 0, height: 0 });
	}
	for (const grp of model.groups) {
		if (nodeIds.has(grp.id)) continue;
		if (grp.parentId && groupIds.has(grp.parentId)) {
			g.setParent(grp.id, grp.parentId);
		}
		for (const id of grp.nodeIds) {
			if (nodeIds.has(id)) g.setParent(id, grp.id);
		}
	}

	// An edge endpoint may name a group. dagre refuses an edge incident to a
	// cluster node, so a group is proxied by one of its descendant nodes: enough
	// for the cluster to rank near its neighbours instead of as an unconnected
	// component. It is an approximation, not exact cluster routing — the drawn
	// edge still terminates on the subgraph box.
	const rankProxy = (id: string): string | undefined => {
		if (nodeIds.has(id)) return id;
		if (!groupIds.has(id)) return undefined;
		return groupDescendantNodeIds(model, id).find((n) => nodeIds.has(n));
	};

	for (const e of model.edges) {
		// Self-loops don't affect ranking; dangling edges have no geometry.
		if (e.from === e.to) continue;
		const from = rankProxy(e.from);
		const to = rankProxy(e.to);
		// Unresolvable (dangling, or a group holding no nodes), or both endpoints
		// proxied to the same node — neither tells dagre anything.
		if (from === undefined || to === undefined || from === to) continue;
		// Give dagre the label's box so it reserves room for the text: it lays the
		// label out as a node on an intermediate rank, which pushes the endpoints
		// apart exactly as Mermaid's own render does. Several model edges can
		// collapse onto one dagre edge (parallel edges, group proxies), so the
		// space reserved is the largest label among them.
		const label = edgeLabelSize(e);
		const prev = g.edge(from, to);
		g.setEdge(from, to, {
			width: Math.max(label.w, prev?.width ?? 0),
			height: Math.max(label.h, prev?.height ?? 0),
			// Centred on the line, matching where the renderer draws it. dagre's
			// default ("r") would instead pad the cross-axis by labeloffset.
			labelpos: "c",
		});
	}

	dagre.layout(g);

	// dagre x/y are node centres — the same convention as DiagramNode.x/y.
	for (const node of model.nodes) {
		const p = g.node(node.id);
		const px = p?.x;
		const py = p?.y;
		if (
			px === undefined ||
			py === undefined ||
			!Number.isFinite(px) ||
			!Number.isFinite(py)
		) {
			throw new Error(`dagre produced no position for "${node.id}"`);
		}
		node.x = Math.max(40, Math.round(px));
		node.y = Math.max(30, Math.round(py));
	}
	// Group boxes are re-fitted by autoLayout() via materializeGroupBounds(force).
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
