/*
 * Recursive cluster layout.
 *
 * dagre has one global `rankdir`, so a subgraph cannot pick its own direction
 * inside a single graph. Mermaid solves this by laying some clusters out in
 * their own nested dagre graph and collapsing the result to one fixed-size box
 * in the parent. This module reproduces that, branch for branch, from
 *   mermaid/packages/mermaid/src/rendering-util/layout-algorithms/dagre/mermaid-graphlib.js
 * (the `extractor` function).
 *
 * Per subgraph:
 *   collapse — an explicit `direction` line               → that direction
 *   collapse — no explicit line and no edge crosses out   → perpendicular to
 *              the parent (or the diagram direction when `inheritDir` is set)
 *   flat     — otherwise → stays in the parent graph as a dagre compound
 *              cluster, sharing the parent's rankdir
 *
 * When every subgraph is flat this builds exactly one dagre graph holding every
 * node, which is the graph the pre-recursive engine built — so a diagram that
 * uses no per-subgraph direction keeps the arrangement it always had. The only
 * difference is the origin: the canvas is shifted so the outermost subgraph
 * *box* clears the margin, where the flat engine only cleared the nodes.
 */

import * as dagre from "@dagrejs/dagre";
import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre";
import {
	DiagramModel,
	DiagramGroup,
	Direction,
	GROUP_PAD,
	GROUP_TITLE_H,
	groupChildren,
	materializeGroupBounds,
	groupBounds,
	nodeSize,
} from "./model";
import { edgeLabelSize } from "./nodeGeometry";

const ORIGIN = 60;
/** Fallback box for a container that holds nothing measurable. Matches groupBounds(). */
const EMPTY_W = 120;
const EMPTY_H = 80;

export type ClusterBranch = "collapse" | "flat";

export interface ClusterPlan {
	branch: ClusterBranch;
	/** The rankdir this group's members are laid out along. For a flat group
	 *  this is the enclosing container's rankdir, which it shares. */
	rankdir: Direction;
}

/** Mermaid flips a self-contained cluster perpendicular to its parent. */
function flip(d: Direction): Direction {
	return d === "TB" ? "LR" : "TB";
}

/**
 * Member node ids plus every nested group id, transitively.
 *
 * Walks the group tree itself rather than calling `groupDescendantNodeIds`,
 * which has no cycle guard: a malformed `parentId` cycle would overflow the
 * stack inside `hasCrossingEdge`, before any guard further up could see it.
 */
function descendantIds(model: DiagramModel, group: DiagramGroup): Set<string> {
	const out = new Set<string>();
	const seen = new Set<string>();
	const walk = (id: string) => {
		if (seen.has(id)) return; // cyclic parentId
		seen.add(id);
		const gr = model.groups.find((g) => g.id === id);
		if (gr) {
			for (const n of gr.nodeIds) out.add(n);
		}
		for (const child of groupChildren(model, id)) {
			out.add(child.id);
			walk(child.id);
		}
	};
	walk(group.id);
	return out;
}

/** Member node ids only, transitively, cycle-guarded. */
function descendantNodeIds(model: DiagramModel, id: string): string[] {
	const group = model.groups.find((g) => g.id === id);
	if (!group) return [];
	const all = descendantIds(model, group);
	const nodes = new Set(model.nodes.map((n) => n.id));
	return [...all].filter((x) => nodes.has(x));
}

/**
 * True when a group has anything to lay out. Mermaid gates both of its collapse
 * branches on `graph.children(node).length > 0` (mermaid-graphlib.js:367, :410),
 * so an empty subgraph is never extracted into its own graph — it falls through
 * to flat. The parser keeps an otherwise-empty subgraph that carries an authored
 * `direction` line, so this case reaches us in practice.
 */
function hasContent(model: DiagramModel, group: DiagramGroup): boolean {
	const nodes = new Set(model.nodes.map((n) => n.id));
	return (
		group.nodeIds.some((id) => nodes.has(id)) ||
		groupChildren(model, group.id).length > 0
	);
}

/**
 * True when some edge has exactly one endpoint inside the group. The group's
 * own id counts as inside: Mermaid rewrites an edge naming a cluster onto an
 * anchor node within it and marks the cluster external, which this predicate
 * captures directly.
 */
function hasCrossingEdge(model: DiagramModel, group: DiagramGroup): boolean {
	const inside = descendantIds(model, group);
	const isIn = (id: string) => id === group.id || inside.has(id);
	return model.edges.some((e) => isIn(e.from) !== isIn(e.to));
}

export function planClusters(model: DiagramModel): Map<string, ClusterPlan> {
	const plans = new Map<string, ClusterPlan>();
	// Parents before children: a child's flip is measured against the rankdir
	// its nearest collapsed ancestor resolved to, so that must be known first.
	const visit = (group: DiagramGroup, parentRankdir: Direction): void => {
		if (plans.has(group.id)) return; // defensive: a parentId cycle
		let plan: ClusterPlan;
		// An empty subgraph is never extracted: with nothing to lay out it would
		// only reserve a dead box in the parent. Mermaid gates both collapse
		// branches the same way, on the cluster actually having children.
		const content = hasContent(model, group);
		if (group.direction && content) {
			plan = { branch: "collapse", rankdir: group.direction };
		} else if (content && !hasCrossingEdge(model, group)) {
			plan = {
				branch: "collapse",
				rankdir: model.config.inheritDir ? model.direction : flip(parentRankdir),
			};
		} else {
			plan = { branch: "flat", rankdir: parentRankdir };
		}
		plans.set(group.id, plan);
		// A flat group owns no container: its children measure their flip against
		// the same rankdir it shares with the enclosing container.
		for (const child of groupChildren(model, group.id)) {
			visit(child, plan.rankdir);
		}
	};
	const known = new Set(model.groups.map((g) => g.id));
	// A group whose parentId names a missing group is orphaned; treat it as
	// top-level so it still gets a plan and is never skipped by the layout.
	for (const g of model.groups) {
		if (!g.parentId || !known.has(g.parentId)) visit(g, model.direction);
	}
	// Anything still unplanned sits in a parentId cycle; plan it as top-level.
	for (const g of model.groups) {
		if (!plans.has(g.id)) visit(g, model.direction);
	}
	return plans;
}

/** Relative positions of everything a collapsed container holds, plus its size. */
interface LaidOutCluster {
	/** node id → centre, relative to the cluster box's top-left. */
	positions: Map<string, { x: number; y: number }>;
	w: number;
	h: number;
}

interface Box {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/**
 * Lay out one container: the diagram root (`group === undefined`) or a
 * collapsed group. Flat descendant groups are expanded into this same graph as
 * dagre compound clusters; collapsed child groups are laid out first and enter
 * as a single fixed-size node.
 *
 * Ownership rule: a node belongs to exactly one container — the nearest
 * ancestor group that is a container (collapsed, or the group this call is
 * laying out), or the root when it has none. Everything else in the group tree
 * below this container and above the next one is flat and folds into this same
 * dagre graph.
 */
function layoutContainer(
	model: DiagramModel,
	plans: Map<string, ClusterPlan>,
	group: DiagramGroup | undefined,
	rankdir: Direction,
	/** Containers already being laid out further up the recursion. A malformed
	 *  parentId cycle would otherwise recurse forever. */
	open: ReadonlySet<string> = new Set(),
): LaidOutCluster {
	const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({
		compound: true,
	});
	g.setGraph({
		rankdir,
		// Defaults match Mermaid's flowchart defaults (nodeSpacing/rankSpacing 50).
		nodesep: model.config.nodeSpacing ?? 50,
		ranksep: model.config.rankSpacing ?? 50,
		marginx: ORIGIN,
		marginy: ORIGIN,
	});
	g.setDefaultEdgeLabel(() => ({}));

	const nodeIds = new Set(model.nodes.map((n) => n.id));
	const byId = new Map(model.groups.map((gr) => [gr.id, gr]));

	/** A group that owns a dagre graph of its own: this call's group, or any
	 *  collapsed group. Everything else folds into the enclosing container. */
	const isContainer = (id: string): boolean =>
		id === group?.id || plans.get(id)?.branch === "collapse";

	/** Nearest enclosing container id walking up from `id` inclusive, or
	 *  undefined for the root. Guards against a parentId cycle. */
	const containerFrom = (id: string | undefined): string | undefined => {
		const seen = new Set<string>();
		let cur = id;
		while (cur !== undefined && byId.has(cur) && !seen.has(cur)) {
			if (isContainer(cur)) return cur;
			seen.add(cur);
			cur = byId.get(cur)!.parentId;
		}
		return undefined;
	};

	/** True when `a` is `b` or encloses it in the group tree. */
	const encloses = (a: string, b: string): boolean => {
		const seen = new Set<string>();
		let cur: string | undefined = b;
		while (cur !== undefined && !seen.has(cur)) {
			if (cur === a) return true;
			seen.add(cur);
			cur = byId.get(cur)?.parentId;
		}
		return false;
	};

	/** The innermost group a node is a member of, if any. */
	const groupOfNode = new Map<string, string>();
	for (const gr of model.groups) {
		for (const id of gr.nodeIds) {
			const prev = groupOfNode.get(id);
			// Prefer the deeper group when a node is listed twice (malformed input).
			if (prev === undefined || encloses(prev, gr.id)) {
				groupOfNode.set(id, gr.id);
			}
		}
	}

	const here = group?.id;
	// Groups belonging to THIS container: flat ones expand into this graph,
	// collapsed ones are laid out first and enter as a fixed-size node.
	const flatHere: DiagramGroup[] = [];
	const collapsedHere: DiagramGroup[] = [];
	for (const gr of model.groups) {
		if (gr.id === here) continue;
		if (containerFrom(gr.parentId) !== here) continue;
		if (isContainer(gr.id) && !open.has(gr.id)) collapsedHere.push(gr);
		else flatHere.push(gr);
	}
	const flatIds = new Set(flatHere.map((f) => f.id));
	const collapsedIds = new Set(collapsedHere.map((c) => c.id));

	// Nodes owned directly: those whose nearest container is this one.
	const ownedNodeIds = new Set<string>();
	for (const n of model.nodes) {
		if (containerFrom(groupOfNode.get(n.id)) === here) ownedNodeIds.add(n.id);
	}

	for (const id of ownedNodeIds) {
		const node = model.nodes.find((n) => n.id === id)!;
		const s = nodeSize(model, node);
		g.setNode(id, { width: s.w, height: s.h });
	}

	// Flat groups become dagre compound clusters, exactly as the flat engine did.
	for (const f of flatHere) {
		if (nodeIds.has(f.id)) continue; // id collides with a node — skip
		g.setNode(f.id, { width: 0, height: 0 });
	}

	// Collapsed children: lay out first, enter as one fixed-size node.
	const collapsed = new Map<string, LaidOutCluster>();
	const nowOpen = new Set(open);
	if (here !== undefined) nowOpen.add(here);
	for (const c of collapsedHere) {
		const inner = layoutContainer(
			model,
			plans,
			c,
			plans.get(c.id)!.rankdir,
			nowOpen,
		);
		collapsed.set(c.id, inner);
		g.setNode(c.id, { width: inner.w, height: inner.h });
	}

	// Nesting, once every node exists: members into their flat cluster, flat
	// clusters into their flat parent, collapsed boxes into their flat parent.
	for (const f of flatHere) {
		if (nodeIds.has(f.id)) continue;
		if (f.parentId && flatIds.has(f.parentId)) g.setParent(f.id, f.parentId);
		for (const id of f.nodeIds) {
			if (ownedNodeIds.has(id) && groupOfNode.get(id) === f.id) {
				g.setParent(id, f.id);
			}
		}
	}
	for (const c of collapsedHere) {
		if (c.parentId && flatIds.has(c.parentId) && !nodeIds.has(c.parentId)) {
			g.setParent(c.id, c.parentId);
		}
	}

	/** Map a node id to what represents it in THIS graph. */
	const repOfNode = (id: string): string | undefined => {
		if (ownedNodeIds.has(id)) return id;
		for (const c of collapsedHere) {
			if (descendantIds(model, c).has(id)) return c.id;
		}
		return undefined;
	};

	/** Map any edge endpoint id to what represents it in THIS graph. */
	const repOf = (id: string): string | undefined => {
		if (nodeIds.has(id)) return repOfNode(id);
		const gr = byId.get(id);
		if (!gr) return undefined;
		if (collapsedIds.has(id)) return id;
		if (flatIds.has(id)) {
			// dagre refuses an edge incident to a cluster node, so a flat group is
			// proxied by one of its member nodes: enough for the cluster to rank
			// near its neighbours instead of as an unconnected component. The drawn
			// edge still terminates on the subgraph box.
			for (const n of descendantNodeIds(model, id)) {
				const rep = repOfNode(n);
				if (rep !== undefined) return rep;
			}
			return undefined;
		}
		// A group nested inside a collapsed child, or outside this container.
		for (const c of collapsedHere) {
			if (descendantIds(model, c).has(gr.id)) return c.id;
		}
		return undefined;
	};

	for (const e of model.edges) {
		if (e.from === e.to) continue; // self-loops don't affect ranking
		const from = repOf(e.from);
		const to = repOf(e.to);
		// Unresolvable (dangling, or outside this container), or both endpoints
		// map to the same representative — internal to a collapsed child, already
		// laid out there. Neither tells dagre anything.
		if (from === undefined || to === undefined || from === to) continue;
		// Give dagre the label's box so it reserves room for the text, exactly as
		// the flat engine does. Several model edges can collapse onto one dagre
		// edge, so the space reserved is the largest label among them.
		const label = edgeLabelSize(e);
		const prev = g.edge(from, to);
		g.setEdge(from, to, {
			width: Math.max(label.w, prev?.width ?? 0),
			height: Math.max(label.h, prev?.height ?? 0),
			// Centred on the line, matching where the renderer draws it.
			labelpos: "c",
		});
	}

	dagre.layout(g);

	// dagre x/y are node centres — the same convention as DiagramNode.x/y.
	const centre = (id: string, what: string): { x: number; y: number } => {
		const p = g.node(id);
		const px = p?.x;
		const py = p?.y;
		if (px === undefined || py === undefined || !Number.isFinite(px) || !Number.isFinite(py)) {
			throw new Error(`dagre produced no position for ${what} "${id}"`);
		}
		return { x: px, y: py };
	};
	const positions = new Map<string, { x: number; y: number }>();
	for (const id of ownedNodeIds) {
		positions.set(id, centre(id, "node"));
	}
	// Expand each collapsed child: its members sit at the child's own relative
	// offsets, translated by where this graph placed the child's box.
	const collapsedBox = new Map<string, Box>();
	for (const c of collapsedHere) {
		const inner = collapsed.get(c.id)!;
		const p = centre(c.id, "cluster");
		const originX = p.x - inner.w / 2;
		const originY = p.y - inner.h / 2;
		collapsedBox.set(c.id, {
			minX: originX,
			minY: originY,
			maxX: originX + inner.w,
			maxY: originY + inner.h,
		});
		for (const [id, rel] of inner.positions) {
			positions.set(id, { x: originX + rel.x, y: originY + rel.y });
		}
	}

	const grow = (box: Box | undefined, add: Box | undefined): Box | undefined => {
		if (!add) return box;
		if (!box) return { ...add };
		return {
			minX: Math.min(box.minX, add.minX),
			minY: Math.min(box.minY, add.minY),
			maxX: Math.max(box.maxX, add.maxX),
			maxY: Math.max(box.maxY, add.maxY),
		};
	};
	const nodeBox = (id: string): Box | undefined => {
		const p = positions.get(id);
		const node = model.nodes.find((n) => n.id === id);
		if (!p || !node) return undefined;
		const s = nodeSize(model, node);
		return {
			minX: p.x - s.w / 2,
			minY: p.y - s.h / 2,
			maxX: p.x + s.w / 2,
			maxY: p.y + s.h / 2,
		};
	};
	/** Drawn box of a flat group inside this container: its contents plus the
	 *  same padding groupBounds() applies, so a nested box never spills out. */
	const flatBox = (
		gr: DiagramGroup,
		seen: Set<string> = new Set(),
	): Box | undefined => {
		if (seen.has(gr.id)) return undefined; // cyclic parentId
		seen.add(gr.id);
		let box: Box | undefined;
		for (const id of gr.nodeIds) box = grow(box, nodeBox(id));
		for (const child of groupChildren(model, gr.id)) {
			box = grow(
				box,
				collapsedIds.has(child.id)
					? collapsedBox.get(child.id)
					: flatBox(child, seen),
			);
		}
		if (!box) return undefined;
		return {
			minX: box.minX - GROUP_PAD,
			minY: box.minY - GROUP_PAD - GROUP_TITLE_H,
			maxX: box.maxX + GROUP_PAD,
			maxY: box.maxY + GROUP_PAD,
		};
	};

	// Extent of everything this container draws: its own nodes, the boxes of the
	// flat groups folded into it, and the boxes of its collapsed children.
	let extent: Box | undefined;
	for (const id of ownedNodeIds) extent = grow(extent, nodeBox(id));
	for (const f of flatHere) {
		// Only the flat groups directly under this container: a nested one is
		// already inside its parent's box.
		if (f.parentId !== undefined && flatIds.has(f.parentId)) continue;
		extent = grow(extent, flatBox(f));
	}
	for (const c of collapsedHere) extent = grow(extent, collapsedBox.get(c.id));

	if (!extent) {
		return { positions, w: EMPTY_W, h: EMPTY_H };
	}
	// Rebase to the box's top-left so the caller can translate in one add. The
	// padding matches groupBounds() so the drawn box encloses the members.
	const padL = group ? GROUP_PAD : ORIGIN;
	const padT = group ? GROUP_PAD + GROUP_TITLE_H : ORIGIN;
	const rebased = new Map<string, { x: number; y: number }>();
	for (const [id, p] of positions) {
		rebased.set(id, {
			x: p.x - extent.minX + padL,
			y: p.y - extent.minY + padT,
		});
	}
	return {
		positions: rebased,
		w: extent.maxX - extent.minX + GROUP_PAD * 2,
		h: extent.maxY - extent.minY + GROUP_PAD * 2 + GROUP_TITLE_H,
	};
}

/** Lay the whole diagram out, writing absolute centres onto `model.nodes`. */
export function layoutClusters(model: DiagramModel): void {
	if (model.nodes.length === 0) return;
	const plans = planClusters(model);
	const root = layoutContainer(model, plans, undefined, model.direction);
	// Every node belongs to exactly one container, so every node must come back
	// with a position. A model malformed enough to break that (a parentId cycle
	// makes both groups containers, and then nothing is claimed at the root)
	// would otherwise leave every node silently where it was — at 0,0 for a
	// freshly parsed diagram. Fail loudly instead, before writing anything, so
	// autoLayout's try/catch falls back to the grid.
	const unplaced = model.nodes.filter((n) => !root.positions.has(n.id));
	if (unplaced.length > 0) {
		const ids = unplaced.map((n) => `"${n.id}"`).join(", ");
		throw new Error(`cluster layout produced no position for ${ids}`);
	}
	for (const node of model.nodes) {
		const p = root.positions.get(node.id)!;
		node.x = Math.max(40, Math.round(p.x));
		node.y = Math.max(30, Math.round(p.y));
	}
}

/**
 * Re-lay one group's subtree only, keeping the group box's top-left where it
 * is. Used when the direction is changed from the properties panel: the change
 * shows immediately without discarding the manual arrangement of the rest of
 * the diagram.
 */
export function layoutSubtree(model: DiagramModel, groupId: string): void {
	const group = model.groups.find((gr) => gr.id === groupId);
	if (!group) return;
	const before = groupBounds(model, group);
	const plans = planClusters(model);
	const rankdir = plans.get(groupId)?.rankdir ?? model.direction;
	const laid = layoutContainer(model, plans, group, rankdir);
	for (const [id, rel] of laid.positions) {
		const node = model.nodes.find((n) => n.id === id);
		if (!node) continue;
		node.x = Math.round(before.x + rel.x);
		node.y = Math.round(before.y + rel.y);
	}
	// Re-fit this group, its descendants, and its ancestors; everything else
	// keeps its box. The ancestors matter: this group's box has just changed
	// size, and a frozen ancestor box would no longer enclose it — the subgraph
	// would draw outside its own parent, and the bad geometry would be saved as
	// gpos. Re-fitting an ancestor only resizes a box, it moves no node, so
	// "nothing outside the subtree moves" still holds.
	const refit = new Set<string>([groupId]);
	const walk = (id: string) => {
		for (const child of groupChildren(model, id)) {
			if (refit.has(child.id)) continue; // cyclic parentId
			refit.add(child.id);
			walk(child.id);
		}
	};
	walk(groupId);
	// Climb to the root, stopping on any group already seen: a malformed
	// parentId cycle would otherwise loop forever.
	let ancestor = group.parentId;
	while (ancestor !== undefined && !refit.has(ancestor)) {
		refit.add(ancestor);
		ancestor = model.groups.find((gr) => gr.id === ancestor)?.parentId;
	}
	for (const gr of model.groups) {
		if (refit.has(gr.id)) {
			gr.x = gr.y = gr.w = gr.h = undefined;
		}
	}
	materializeGroupBounds(model);
}
