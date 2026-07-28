import { DiagramModel, DiagramNode, NodeShape, nodeSize } from "./model";

/** Clearance kept between the new node's box and any existing node's box. */
const GAP = 12;
/** Cascade step, in svg units, applied to both axes on each retry. */
const STEP = 24;
/** Cap on retries. Past this the caller gets the last candidate — placing a node
 *  slightly overlapping is far better than spinning on a densely packed canvas. */
const MAX_STEPS = 40;

function overlapsAnyNode(model: DiagramModel, x: number, y: number, w: number, h: number): boolean {
	return model.nodes.some((n) => {
		const s = nodeSize(model, n);
		return (
			Math.abs(n.x - x) < (w + s.w) / 2 + GAP &&
			Math.abs(n.y - y) < (h + s.h) / 2 + GAP
		);
	});
}

/** Nearest free point at or down-right of (x, y) for a node of `shape`.
 *
 *  The probe is sized from the shape's empty-label default rather than the real
 *  label (the caller has not named the node yet); GAP absorbs the difference.
 *  Pure — takes no DOM and mutates nothing. */
export function findFreeSpot(
	model: DiagramModel,
	x: number,
	y: number,
	shape: NodeShape,
): { x: number; y: number } {
	const probe: DiagramNode = { id: "", label: "", shape, x, y };
	const { w, h } = nodeSize(model, probe);
	let cx = x;
	let cy = y;
	for (let i = 0; i < MAX_STEPS; i++) {
		if (!overlapsAnyNode(model, cx, cy, w, h)) {
			return { x: cx, y: cy };
		}
		cx += STEP;
		cy += STEP;
	}
	return { x: cx, y: cy };
}
