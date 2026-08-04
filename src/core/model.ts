/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): import paths and a DOM accessor shim; core logic unchanged.
 */

/*
 * The internal diagram model. This is the single source of truth the visual
 * editor manipulates. It is converted to/from Mermaid text by parser.ts and
 * serializer.ts.
 */

import { estimateNodeSize } from "./nodeGeometry";
import { ALL_SHAPES, SHAPES } from "./shapes";
import type { ShapeName } from "./shapes";

export type Direction = "TB" | "BT" | "LR" | "RL";

export const DIRECTIONS: Direction[] = ["TB", "BT", "LR", "RL"];

export const DIRECTION_LABELS: Record<Direction, string> = {
	TB: "Top to bottom",
	BT: "Bottom to top",
	LR: "Left to right",
	RL: "Right to left",
};

/** A node shape, keyed by its Mermaid v11 canonical short name. */
export type NodeShape = ShapeName;

/** Every registered shape, in palette order. Derived — do not hand-edit. */
export const NODE_SHAPES: NodeShape[] = ALL_SHAPES.map((d) => d.name);

/** Display labels for the palette and the properties dropdown. Derived. */
export const SHAPE_LABELS: Record<string, string> = Object.fromEntries(
	ALL_SHAPES.map((d) => [d.name, d.label]),
);

export type EdgeKind =
	| "arrow"
	| "open"
	| "dotted"
	| "thick"
	| "bidirectional"
	| "invisible";

export const EDGE_KINDS: EdgeKind[] = [
	"arrow",
	"open",
	"dotted",
	"thick",
	"bidirectional",
	"invisible",
];

export const EDGE_LABELS: Record<EdgeKind, string> = {
	arrow: "Arrow",
	open: "Open line",
	dotted: "Dotted",
	thick: "Thick",
	bidirectional: "Bidirectional",
	invisible: "Invisible",
};

export interface NodeStyle {
	fillColor?: string;
	strokeColor?: string;
	textColor?: string;
	fontSize?: number;
	fontFamily?: string;
	strokeWidth?: number;
	/** Dash pattern for the node border, e.g. "5 5"; empty/undefined = solid. */
	strokeDasharray?: string;
	/** Any style props we don't model explicitly, kept verbatim. */
	extra?: string[];
}

export interface EdgeStyle {
	strokeColor?: string;
	strokeWidth?: number;
	/** Dash pattern for the edge line, e.g. "6 4"; empty/undefined = solid. */
	strokeDasharray?: string;
	textColor?: string;
	fontSize?: number;
	extra?: string[];
}

/** A Mermaid classDef: a named, reusable node style (`classDef hot fill:#f96`). */
export interface ClassDef {
	name: string;
	/** Unknown props are preserved verbatim in style.extra for round-trip. */
	style: NodeStyle;
}

export interface DiagramNode {
	id: string;
	label: string;
	shape: NodeShape;
	x: number;
	y: number;
	/** Manual size overrides (editor hint; auto-sized from the label when unset). */
	w?: number;
	h?: number;
	style?: NodeStyle;
	/** classDef names assigned via `class A name` / `A:::name` — order matters. */
	classes?: string[];
	/** When true the node cannot be dragged on the canvas. */
	locked?: boolean;
	/** Optional hyperlink target: an Obsidian link (`[[Note#Heading]]`) or an
	 *  external URL. Persisted as a Mermaid `click <id> "<target>"` line. */
	link?: string;
	/** Which syntax the author wrote this node in. Undefined means the editor
	 *  created it, which serializes to bracket form when the shape has one. */
	syntax?: "bracket" | "attr";
	/** `@{}` keys other than shape and label, preserved verbatim for round-trip. */
	attrs?: Record<string, string>;
	/** A shape name ceasg does not recognise. Drawn as a rect, written back
	 *  unchanged so a future Mermaid shape survives an edit here. */
	rawShape?: string;
}

/** A Mermaid `subgraph` — a labelled container grouping member nodes. */
export interface DiagramGroup {
	id: string;
	title: string;
	nodeIds: string[];
	/** Enclosing group id for nesting; undefined = top-level. */
	parentId?: string;
	/** Explicit box (top-left origin). Undefined → derived from members. */
	x?: number;
	y?: number;
	w?: number;
	h?: number;
}

export const GROUP_PAD = 20;
export const GROUP_TITLE_H = 24;

/** Diagram-level Mermaid config, emitted as a `%%{init: …}%%` directive. */
export interface DiagramConfig {
	theme?: string;
	/** Diagram background colour; undefined = transparent. Emitted as themeVariables.background. */
	background?: string;
	themeVariables?: Record<string, string>;
	nodeSpacing?: number;
	rankSpacing?: number;
}

export function hasConfig(cfg: DiagramConfig | undefined): boolean {
	if (!cfg) return false;
	return (
		cfg.theme !== undefined ||
		cfg.background !== undefined ||
		cfg.nodeSpacing !== undefined ||
		cfg.rankSpacing !== undefined ||
		(cfg.themeVariables !== undefined &&
			Object.keys(cfg.themeVariables).length > 0)
	);
}

export function hasStyle(style: NodeStyle | undefined): boolean {
	if (!style) return false;
	return (
		style.fillColor !== undefined ||
		style.strokeColor !== undefined ||
		style.textColor !== undefined ||
		style.fontSize !== undefined ||
		style.fontFamily !== undefined ||
		style.strokeWidth !== undefined ||
		style.strokeDasharray !== undefined ||
		(style.extra !== undefined && style.extra.length > 0)
	);
}

export function hasEdgeStyle(style: EdgeStyle | undefined): boolean {
	if (!style) return false;
	return (
		style.strokeColor !== undefined ||
		style.strokeWidth !== undefined ||
		style.strokeDasharray !== undefined ||
		style.textColor !== undefined ||
		style.fontSize !== undefined ||
		(style.extra !== undefined && style.extra.length > 0)
	);
}

export interface DiagramEdge {
	id: string;
	from: string;
	to: string;
	label: string;
	kind: EdgeKind;
	style?: EdgeStyle;
	/** Show a marching-ants CSS animation on the edge line. */
	animated?: boolean;
}

export interface DiagramModel {
	direction: Direction;
	nodes: DiagramNode[];
	edges: DiagramEdge[];
	groups: DiagramGroup[];
	config: DiagramConfig;
	/** Named reusable styles (`classDef`), in declaration order. */
	classDefs: ClassDef[];
	/**
	 * Lines from the original Mermaid source that we do not understand
	 * (click bindings, malformed directives, ...). We round-trip these
	 * untouched so the visual editor never destroys advanced syntax.
	 */
	extras: string[];
}

export function emptyModel(direction: Direction = "TB"): DiagramModel {
	return {
		direction,
		nodes: [],
		edges: [],
		groups: [],
		config: {},
		classDefs: [],
		extras: [],
	};
}

/**
 * Effective render style for a node. Per-property merge, lowest to highest
 * precedence: theme CSS defaults (returned undefined keeps them) <
 * `classDef default` < the node's classes in assignment order (later class
 * wins per property) < the node's explicit `style` (style line / panel edits).
 * `extra` props are round-trip-only and never merged.
 */
export function resolveNodeStyle(
	model: DiagramModel,
	node: DiagramNode,
): NodeStyle | undefined {
	const byName = new Map(model.classDefs.map((c) => [c.name, c.style]));
	const layers: Array<NodeStyle | undefined> = [byName.get("default")];
	for (const name of node.classes ?? []) layers.push(byName.get(name));
	layers.push(node.style);

	const merged: NodeStyle = {};
	for (const layer of layers) {
		if (!layer) continue;
		if (layer.fillColor !== undefined) merged.fillColor = layer.fillColor;
		if (layer.strokeColor !== undefined) merged.strokeColor = layer.strokeColor;
		if (layer.textColor !== undefined) merged.textColor = layer.textColor;
		if (layer.fontSize !== undefined) merged.fontSize = layer.fontSize;
		if (layer.fontFamily !== undefined) merged.fontFamily = layer.fontFamily;
		if (layer.strokeWidth !== undefined) merged.strokeWidth = layer.strokeWidth;
		if (layer.strokeDasharray !== undefined)
			merged.strokeDasharray = layer.strokeDasharray;
	}
	return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Rendered size of a node: its manual `w`/`h` overrides, else the label
 * estimate measured in the node's *resolved* font (classDef layers included).
 * The single source of truth for node geometry — the renderer, hit testing,
 * the viewport, edge endpoints and auto layout all go through this so they
 * cannot disagree.
 */
export function nodeSize(
	model: DiagramModel,
	node: DiagramNode,
): { w: number; h: number } {
	const est = estimateNodeSize(node, resolveNodeStyle(model, node));
	return { w: node.w ?? est.w, h: node.h ?? est.h };
}

export function findNode(
	model: DiagramModel,
	id: string,
): DiagramNode | undefined {
	return model.nodes.find((n) => n.id === id);
}

/** Generate a node id that does not collide with existing nodes. */
export function nextNodeId(model: DiagramModel): string {
	const used = new Set(model.nodes.map((n) => n.id));
	// Try single uppercase letters first (A, B, C, ...), then N1, N2, ...
	for (let i = 0; i < 26; i++) {
		const id = String.fromCharCode(65 + i);
		if (!used.has(id)) return id;
	}
	let n = 1;
	while (used.has(`N${n}`)) n++;
	return `N${n}`;
}

let edgeCounter = 0;
export function newEdgeId(): string {
	edgeCounter += 1;
	return `e${edgeCounter}-${Date.now().toString(36)}`;
}

export function removeNode(model: DiagramModel, id: string): void {
	model.nodes = model.nodes.filter((n) => n.id !== id);
	model.edges = model.edges.filter((e) => e.from !== id && e.to !== id);
	for (const g of model.groups) {
		g.nodeIds = g.nodeIds.filter((nid) => nid !== id);
	}
}

let groupCounter = 0;
export function newGroupId(model: DiagramModel): string {
	const used = new Set(model.groups.map((g) => g.id));
	let n = ++groupCounter;
	while (used.has(`sub${n}`)) n++;
	groupCounter = n;
	return `sub${n}`;
}

export function groupOf(
	model: DiagramModel,
	nodeId: string,
): DiagramGroup | undefined {
	return model.groups.find((g) => g.nodeIds.includes(nodeId));
}

/** Move a node into `groupId`, or remove it from any group when null. */
export function assignNodeToGroup(
	model: DiagramModel,
	nodeId: string,
	groupId: string | null,
): void {
	for (const g of model.groups) {
		g.nodeIds = g.nodeIds.filter((id) => id !== nodeId);
	}
	if (groupId) {
		const g = model.groups.find((gr) => gr.id === groupId);
		if (g && !g.nodeIds.includes(nodeId)) g.nodeIds.push(nodeId);
	}
}

export function groupChildren(
	model: DiagramModel,
	id: string,
): DiagramGroup[] {
	return model.groups.filter((g) => g.parentId === id);
}

/** Top-left box for a group: stored bounds when set, else derived from members. */
export function groupBounds(
	model: DiagramModel,
	group: DiagramGroup,
): { x: number; y: number; w: number; h: number } {
	if (
		group.x !== undefined &&
		group.y !== undefined &&
		group.w !== undefined &&
		group.h !== undefined
	) {
		return { x: group.x, y: group.y, w: group.w, h: group.h };
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	const add = (x: number, y: number, w: number, h: number) => {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x + w);
		maxY = Math.max(maxY, y + h);
	};
	for (const id of group.nodeIds) {
		const n = findNode(model, id);
		if (!n) continue;
		const s = nodeSize(model, n);
		add(n.x - s.w / 2, n.y - s.h / 2, s.w, s.h);
	}
	for (const child of groupChildren(model, group.id)) {
		const b = groupBounds(model, child);
		add(b.x, b.y, b.w, b.h);
	}
	if (!Number.isFinite(minX)) {
		// Empty group with no stored bounds: a small default box.
		return { x: 0, y: 0, w: 120, h: 80 };
	}
	return {
		x: minX - GROUP_PAD,
		y: minY - GROUP_PAD - GROUP_TITLE_H,
		w: maxX - minX + GROUP_PAD * 2,
		h: maxY - minY + GROUP_PAD * 2 + GROUP_TITLE_H,
	};
}

/** True if `maybeAncestor` is `id` or an ancestor of `id` in the group tree. */
function isGroupAncestor(
	model: DiagramModel,
	maybeAncestor: string,
	id: string,
): boolean {
	let cur: string | undefined = id;
	while (cur) {
		if (cur === maybeAncestor) return true;
		cur = model.groups.find((g) => g.id === cur)?.parentId;
	}
	return false;
}

export function assignGroupToParent(
	model: DiagramModel,
	groupId: string,
	parentId: string | null,
): void {
	const group = model.groups.find((g) => g.id === groupId);
	if (!group) return;
	if (parentId === null) {
		group.parentId = undefined;
		return;
	}
	if (parentId === groupId) return;
	// Refuse cycles: a group cannot become a child of its own descendant.
	if (isGroupAncestor(model, groupId, parentId)) return;
	group.parentId = parentId;
}

export function groupDescendantNodeIds(
	model: DiagramModel,
	id: string,
): string[] {
	const out: string[] = [];
	const group = model.groups.find((g) => g.id === id);
	if (!group) return out;
	out.push(...group.nodeIds);
	for (const child of groupChildren(model, id)) {
		out.push(...groupDescendantNodeIds(model, child.id));
	}
	return out;
}

export function translateGroup(
	model: DiagramModel,
	id: string,
	dx: number,
	dy: number,
): void {
	const group = model.groups.find((g) => g.id === id);
	if (!group) return;
	// Move this group's stored bounds and every descendant group's stored bounds.
	const shiftGroup = (g: DiagramGroup) => {
		if (g.x !== undefined) g.x += dx;
		if (g.y !== undefined) g.y += dy;
		for (const child of groupChildren(model, g.id)) shiftGroup(child);
	};
	shiftGroup(group);
	// Move every descendant member node.
	for (const nid of groupDescendantNodeIds(model, id)) {
		const n = findNode(model, nid);
		if (n && !n.locked) {
			n.x += dx;
			n.y += dy;
		}
	}
}

/** Depth of a group in the tree (0 = top-level). */
function groupTreeDepth(model: DiagramModel, id: string): number {
	let d = 0;
	let cur = model.groups.find((g) => g.id === id)?.parentId;
	while (cur) {
		d++;
		cur = model.groups.find((g) => g.id === cur)?.parentId;
	}
	return d;
}

/**
 * Freeze derived group boxes into explicit stored bounds so a box stays put
 * while its members are dragged (otherwise a derived box re-wraps its members
 * every repaint and nothing can ever leave it). Called after load/auto-layout.
 *
 * With `force`, every group is re-fitted (used by Auto layout); otherwise only
 * groups whose bounds are still undefined are materialized (used on load, so
 * saved `gpos` geometry is respected). Groups are processed deepest-first so a
 * parent box wraps its children's just-stored boxes.
 */
export function materializeGroupBounds(
	model: DiagramModel,
	force = false,
): void {
	if (force) {
		for (const g of model.groups) {
			g.x = g.y = g.w = g.h = undefined;
		}
	}
	const deepestFirst = [...model.groups].sort(
		(a, b) => groupTreeDepth(model, b.id) - groupTreeDepth(model, a.id),
	);
	for (const g of deepestFirst) {
		if (
			g.x !== undefined &&
			g.y !== undefined &&
			g.w !== undefined &&
			g.h !== undefined
		) {
			continue;
		}
		const b = groupBounds(model, g);
		g.x = b.x;
		g.y = b.y;
		g.w = b.w;
		g.h = b.h;
	}
}

/** Delete a group but keep its contents: reparent child groups and member
 *  nodes to this group's parent (top-level when it had none). */
export function removeGroup(model: DiagramModel, groupId: string): void {
	const group = model.groups.find((g) => g.id === groupId);
	if (!group) return;
	const newParent = group.parentId;
	for (const child of groupChildren(model, groupId)) {
		child.parentId = newParent;
	}
	// Member nodes fall to the parent group (or become ungrouped at top-level).
	if (newParent) {
		const parent = model.groups.find((g) => g.id === newParent);
		if (parent) {
			for (const nid of group.nodeIds) {
				if (!parent.nodeIds.includes(nid)) parent.nodeIds.push(nid);
			}
		}
	}
	model.groups = model.groups.filter((g) => g.id !== groupId);
}

export function removeEdge(model: DiagramModel, id: string): void {
	model.edges = model.edges.filter((e) => e.id !== id);
}

/**
 * Change a node's shape, recording the syntax promotion that implies.
 *
 * A shape with no bracket form can only be written as `@{…}`, so switching to
 * one pins the node to the attribute form permanently. Switching back does not
 * demote it: auto-demotion would rewrite a line the author may have written by
 * hand, and the round trip would no longer be stable.
 */
export function setNodeShape(node: DiagramNode, shape: NodeShape): void {
	node.shape = shape;
	// A recognised shape supersedes any preserved unknown name.
	node.rawShape = undefined;
	if (!SHAPES[shape]?.bracket) {
		node.syntax = "attr";
	}
}

/** Copy a node (label, shape and syntax form) to a new id offset slightly. Returns new id. */
export function duplicateNode(
	model: DiagramModel,
	id: string,
): string | null {
	const src = findNode(model, id);
	if (!src) return null;
	const newId = nextNodeId(model);
	model.nodes.push({
		id: newId,
		label: src.label,
		shape: src.shape,
		x: src.x + 40,
		y: src.y + 40,
		w: src.w,
		h: src.h,
		style: src.style ? { ...src.style, extra: src.style.extra ? [...src.style.extra] : undefined } : undefined,
		classes: src.classes ? [...src.classes] : undefined,
		link: src.link,
		syntax: src.syntax,
		attrs: src.attrs ? { ...src.attrs } : undefined,
		rawShape: src.rawShape,
	});
	return newId;
}

/** Move a node to the end of the nodes array (rendered on top). */
export function bringToFront(model: DiagramModel, id: string): void {
	const idx = model.nodes.findIndex((n) => n.id === id);
	if (idx < 0 || idx === model.nodes.length - 1) return;
	const [node] = model.nodes.splice(idx, 1);
	if (node) model.nodes.push(node);
}

/** Move a node to the start of the nodes array (rendered at back). */
export function sendToBack(model: DiagramModel, id: string): void {
	const idx = model.nodes.findIndex((n) => n.id === id);
	if (idx <= 0) return;
	const [node] = model.nodes.splice(idx, 1);
	if (node) model.nodes.unshift(node);
}

/** Deep clone so the editor can discard changes on cancel. */
export function cloneModel(model: DiagramModel): DiagramModel {
	return {
		direction: model.direction,
		nodes: model.nodes.map((n) => ({
			...n,
			style: n.style
				? { ...n.style, extra: n.style.extra ? [...n.style.extra] : undefined }
				: undefined,
			classes: n.classes ? [...n.classes] : undefined,
		})),
		edges: model.edges.map((e) => ({
			...e,
			animated: e.animated,
			style: e.style
				? { ...e.style, extra: e.style.extra ? [...e.style.extra] : undefined }
				: undefined,
		})),
		groups: model.groups.map((g) => ({
			id: g.id,
			title: g.title,
			nodeIds: [...g.nodeIds],
			parentId: g.parentId,
			x: g.x,
			y: g.y,
			w: g.w,
			h: g.h,
		})),
		classDefs: model.classDefs.map((c) => ({
			name: c.name,
			style: { ...c.style, extra: c.style.extra ? [...c.style.extra] : undefined },
		})),
		config: {
			...model.config,
			themeVariables: model.config.themeVariables
				? { ...model.config.themeVariables }
				: undefined,
		},
		extras: [...model.extras],
	};
}
