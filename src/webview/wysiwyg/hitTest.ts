import { DiagramModel, DiagramNode, nodeSize, groupBounds } from '../../core';
import { edgePathD, selfLoopPathD } from './edgePath';

export type Hit =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'anchor'; id: string; dir: 'N' | 'S' | 'E' | 'W' }
  | { kind: 'resize'; id: string }
  | { kind: 'background' };

function box(model: DiagramModel, n: DiagramNode): { x: number; y: number; w: number; h: number } {
  const { w, h } = nodeSize(model, n);
  return { x: n.x - w / 2, y: n.y - h / 2, w, h };
}

export function nodeAtPoint(model: DiagramModel, x: number, y: number): DiagramNode | undefined {
  for (let i = model.nodes.length - 1; i >= 0; i--) {
    const b = box(model, model.nodes[i]);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { return model.nodes[i]; }
  }
  return undefined;
}

export function nodesInRect(model: DiagramModel, r: { x: number; y: number; w: number; h: number }): string[] {
  const rx2 = r.x + r.w, ry2 = r.y + r.h;
  return model.nodes.filter((n) => {
    const b = box(model, n);
    return b.x >= r.x && b.y >= r.y && b.x + b.w <= rx2 && b.y + b.h <= ry2;
  }).map((n) => n.id);
}

/** Half-width (screen px) of the invisible clickable band around an edge line.
 *  Constant regardless of the edge's drawn stroke width, so thin edges are just
 *  as easy to click as thick ones. Divide by the viewport scale at call sites. */
export const EDGE_HIT_TOLERANCE = 12;

export function edgeAtPoint(model: DiagramModel, x: number, y: number, tol: number): string | undefined {
  for (let i = model.edges.length - 1; i >= 0; i--) {
    const e = model.edges[i];
    // Endpoint ids resolve to a node or a subgraph box; an unresolvable one
    // gives no path, so that edge is simply not clickable.
    const d = e.from === e.to
      ? selfLoopPathD(model, e.from, model.direction)
      : edgePathD(model, e.from, e.to, model.direction);
    if (d === null) { continue; }
    const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (nums.length < 8) { continue; }
    const [x0, y0, x1, y1, x2, y2, x3, y3] = nums;
    let min = Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const mt = 1 - t;
      const px = mt*mt*mt*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3;
      const py = mt*mt*mt*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3;
      const dist = Math.hypot(px - x, py - y);
      if (dist < min) { min = dist; }
    }
    if (min <= tol) { return e.id; }
  }
  return undefined;
}

/** The four connection-handle points (edge midpoints) of a single node. */
export function nodeAnchorPoints(
  model: DiagramModel,
  node: DiagramNode,
): Array<{ dir: 'N' | 'S' | 'E' | 'W'; x: number; y: number }> {
  const b = box(model, node);
  return [
    { dir: 'N', x: node.x, y: b.y },
    { dir: 'S', x: node.x, y: b.y + b.h },
    { dir: 'E', x: b.x + b.w, y: node.y },
    { dir: 'W', x: b.x, y: node.y },
  ];
}

/** Which of a single node's connection handles (if any) is within `tol` of (x, y). */
export function anchorForNode(
  model: DiagramModel, node: DiagramNode, x: number, y: number, tol: number,
): 'N' | 'S' | 'E' | 'W' | undefined {
  for (const a of nodeAnchorPoints(model, node)) {
    if (Math.abs(x - a.x) <= tol && Math.abs(y - a.y) <= tol) { return a.dir; }
  }
  return undefined;
}

/**
 * What a click at (x, y) lands on, in precedence order: node, then edge, then
 * group, then background.
 *
 * Edges must be tested before groups. A group's box covers its entire interior,
 * so testing groups first makes every edge drawn inside a subgraph unreachable
 * — the click is swallowed by the box and the edge can never be selected. The
 * general rule is that the specific target beats the broad fallback region: a
 * node and an edge are precise, a group box is the area left over.
 *
 * This is deliberately *not* the same rule as drag-drop targeting (see
 * `PointerController.endpointAtPoint`), where an edge is not a legal target and
 * a group's interior is a meaningful one.
 */
export function pickAtPoint(model: DiagramModel, x: number, y: number, tol: number): Hit {
  const node = nodeAtPoint(model, x, y);
  if (node) { return { kind: 'node', id: node.id }; }
  const edgeId = edgeAtPoint(model, x, y, tol);
  if (edgeId !== undefined) { return { kind: 'edge', id: edgeId }; }
  const groupId = groupAtPoint(model, x, y);
  if (groupId !== undefined) { return { kind: 'group', id: groupId }; }
  return { kind: 'background' };
}

function groupDepth(model: DiagramModel, id: string): number {
  let d = 0;
  let cur = model.groups.find((g) => g.id === id)?.parentId;
  while (cur) { d++; cur = model.groups.find((g) => g.id === cur)?.parentId; }
  return d;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export function groupResizeHandles(
  model: DiagramModel, groupId: string,
): Array<{ corner: Corner; x: number; y: number }> {
  const g = model.groups.find((gr) => gr.id === groupId);
  if (!g) { return []; }
  const b = groupBounds(model, g);
  return [
    { corner: 'nw', x: b.x, y: b.y },
    { corner: 'ne', x: b.x + b.w, y: b.y },
    { corner: 'sw', x: b.x, y: b.y + b.h },
    { corner: 'se', x: b.x + b.w, y: b.y + b.h },
  ];
}

export function groupHandleAtPoint(
  model: DiagramModel, groupId: string, x: number, y: number, tol: number,
): Corner | undefined {
  for (const h of groupResizeHandles(model, groupId)) {
    if (Math.abs(x - h.x) <= tol && Math.abs(y - h.y) <= tol) { return h.corner; }
  }
  return undefined;
}

/** The four connection-anchor points (box edge midpoints) of a subgraph — the
 *  group counterpart of nodeAnchorPoints. Midpoints never coincide with the
 *  corner resize handles, so the two need no hit-test priority rule. */
export function groupAnchorPoints(
  model: DiagramModel, groupId: string,
): Array<{ dir: 'N' | 'S' | 'E' | 'W'; x: number; y: number }> {
  const g = model.groups.find((gr) => gr.id === groupId);
  if (!g) { return []; }
  const b = groupBounds(model, g);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return [
    { dir: 'N', x: cx, y: b.y },
    { dir: 'S', x: cx, y: b.y + b.h },
    { dir: 'E', x: b.x + b.w, y: cy },
    { dir: 'W', x: b.x, y: cy },
  ];
}

/** Apply a corner-resize delta to a box, keeping the opposite edge anchored and
 *  never shrinking below `min`. Returns the new box. */
export function resizeBox(
  b: { x: number; y: number; w: number; h: number },
  corner: Corner, dx: number, dy: number, min = 40,
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = b;
  if (corner === 'nw') { x += dx; y += dy; w -= dx; h -= dy; }
  else if (corner === 'ne') { y += dy; w += dx; h -= dy; }
  else if (corner === 'sw') { x += dx; w -= dx; h += dy; }
  else { w += dx; h += dy; }
  // Clamp to min while keeping the anchored (opposite) edge fixed.
  if (w < min) { if (corner === 'nw' || corner === 'sw') { x -= (min - w); } w = min; }
  if (h < min) { if (corner === 'nw' || corner === 'ne') { y -= (min - h); } h = min; }
  return { x, y, w, h };
}

/** The innermost (deepest-nested) group whose box contains (x, y). */
export function groupAtPoint(model: DiagramModel, x: number, y: number): string | undefined {
  let best: string | undefined;
  let bestDepth = -1;
  for (const grp of model.groups) {
    const b = groupBounds(model, grp);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      const d = groupDepth(model, grp.id);
      if (d > bestDepth) { bestDepth = d; best = grp.id; }
    }
  }
  return best;
}
