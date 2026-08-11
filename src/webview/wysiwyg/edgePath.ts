import { DiagramModel, DiagramNode, DiagramEdge, Direction } from '../../core';
import { nodeSize, SHAPES, geom, rayPolygonHit, endpointGeometry } from '../../core';

/** Where a ray from a box's centre toward (dx, dy) crosses the box border.
 *  Shared by nodes and subgraph boxes so both meet an edge the same way. */
function boxBorderPoint(
  cx: number, cy: number, w: number, h: number, dx: number, dy: number,
): { x: number; y: number } {
  // Coincident centres give no direction to cast along; the right edge keeps the
  // path's two ends distinct instead of collapsing onto the centre.
  if (dx === 0 && dy === 0) { return { x: cx + w / 2, y: cy }; }
  const hw = w / 2;
  const hh = h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

// `model` is needed to resolve the node's font (classDef layers included), which
// decides the box size and therefore where the edge meets its border.
export function nodeBorderPoint(model: DiagramModel, node: DiagramNode, towardX: number, towardY: number): { x: number; y: number } {
  const { w, h } = nodeSize(model, node);
  const dx = towardX - node.x;
  const dy = towardY - node.y;
  if (dx === 0 && dy === 0) { return boxBorderPoint(node.x, node.y, w, h, dx, dy); }
  // Shapes whose filled region diverges sharply from their box declare an
  // outline; everything else keeps the box math this function has always used.
  const outline = SHAPES[node.shape]?.outline;
  if (outline) {
    const hit = rayPolygonHit(node.x, node.y, dx, dy, outline(geom(node.x, node.y, w, h)));
    if (hit) { return hit; }
  }
  return boxBorderPoint(node.x, node.y, w, h, dx, dy);
}

/** Border point for an edge endpoint id, which may name a node *or* a subgraph.
 *  Undefined when the id names neither, so callers can skip the edge. */
export function endpointBorderPoint(
  model: DiagramModel, id: string, towardX: number, towardY: number,
): { x: number; y: number } | undefined {
  // Nodes go through `nodeBorderPoint` to keep the shape-outline ray cast; a
  // subgraph box is a plain rect and has no outline to cast against.
  const node = model.nodes.find((n) => n.id === id);
  if (node) { return nodeBorderPoint(model, node, towardX, towardY); }
  const g = endpointGeometry(model, id);
  if (!g) { return undefined; }
  return boxBorderPoint(g.x, g.y, g.w, g.h, towardX - g.x, towardY - g.y);
}

type Box = { x: number; y: number; w: number; h: number };

/** True when `inner`'s centre lies within `outer`'s box — a subgraph and one of
 *  its own members, or a nested subgraph. */
function contains(outer: Box, inner: Box): boolean {
  return Math.abs(inner.x - outer.x) <= outer.w / 2 && Math.abs(inner.y - outer.y) <= outer.h / 2;
}

export function edgePathD(model: DiagramModel, fromId: string, toId: string, dir: Direction, offset = 0): string | null {
  const from = endpointGeometry(model, fromId);
  const to = endpointGeometry(model, toId);
  if (!from || !to) { return null; }
  let a = endpointBorderPoint(model, fromId, to.x, to.y);
  let b = endpointBorderPoint(model, toId, from.x, from.y);
  if (!a || !b) { return null; }
  // Containment (a subgraph and a node inside it) breaks the usual assumption
  // that each end can aim at the other's centre. The enclosed box's centre lies
  // *past* the border the line actually arrives from, so aiming at it picks the
  // far side: the path then crosses the enclosed box and parks its arrowhead
  // under it, invisible beneath the node layer. Re-aim the enclosed end at the
  // enclosing border point instead, so the line spans the gap between them.
  if (contains(from, to)) {
    b = endpointBorderPoint(model, toId, a.x, a.y) ?? b;
  } else if (contains(to, from)) {
    a = endpointBorderPoint(model, fromId, b.x, b.y) ?? a;
  }
  // Approach axis follows the actual geometry of this edge, so the arrowhead
  // points the natural way (down when the target is below, right when it's to the
  // right, etc.) even after nodes are dragged around. Fall back to the diagram's
  // global flow direction only when the two nodes are perfectly diagonal.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) === Math.abs(dy)
    ? (dir === 'LR' || dir === 'RL')
    : Math.abs(dx) > Math.abs(dy);
  // perpendicular offset for parallel-edge separation
  const nx = horizontal ? 0 : offset;
  const ny = horizontal ? offset : 0;
  const c1 = horizontal
    ? { x: (a.x + b.x) / 2, y: a.y + ny }
    : { x: a.x + nx, y: (a.y + b.y) / 2 };
  const c2 = horizontal
    ? { x: (a.x + b.x) / 2, y: b.y + ny }
    : { x: b.x + nx, y: (a.y + b.y) / 2 };
  return `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
}

export function selfLoopPathD(model: DiagramModel, id: string, dir: Direction): string | null {
  const g = endpointGeometry(model, id);
  if (!g) { return null; }
  const horizontal = dir === 'LR' || dir === 'RL';
  if (horizontal) {
    const x = g.x + g.w / 2;
    const y = g.y;
    return `M${x},${y - 8} C${x + 60},${y - 40} ${x + 60},${y + 40} ${x},${y + 8}`;
  }
  const x = g.x;
  const y = g.y + g.h / 2;
  return `M${x - 8},${y} C${x - 40},${y + 60} ${x + 40},${y + 60} ${x + 8},${y}`;
}

export function bezierMidpoint(d: string): { x: number; y: number } {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  // [x0,y0, x1,y1, x2,y2, x3,y3]
  if (nums.length < 8) { return { x: nums[0] ?? 0, y: nums[1] ?? 0 }; }
  const [x0, y0, x1, y1, x2, y2, x3, y3] = nums;
  const t = 0.5, mt = 0.5;
  const x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
  const y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
  return { x, y };
}
