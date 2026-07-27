import { DiagramModel, DiagramNode, estimateNodeSize, groupBounds } from '../../core';
import { edgePathD, selfLoopPathD } from './edgePath';

export type Hit =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'anchor'; id: string; dir: 'N' | 'S' | 'E' | 'W' }
  | { kind: 'resize'; id: string }
  | { kind: 'background' };

function box(n: DiagramNode): { x: number; y: number; w: number; h: number } {
  const w = n.w ?? estimateNodeSize(n).w;
  const h = n.h ?? estimateNodeSize(n).h;
  return { x: n.x - w / 2, y: n.y - h / 2, w, h };
}

export function nodeAtPoint(model: DiagramModel, x: number, y: number): DiagramNode | undefined {
  for (let i = model.nodes.length - 1; i >= 0; i--) {
    const b = box(model.nodes[i]);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { return model.nodes[i]; }
  }
  return undefined;
}

export function nodesInRect(model: DiagramModel, r: { x: number; y: number; w: number; h: number }): string[] {
  const rx2 = r.x + r.w, ry2 = r.y + r.h;
  return model.nodes.filter((n) => {
    const b = box(n);
    return b.x >= r.x && b.y >= r.y && b.x + b.w <= rx2 && b.y + b.h <= ry2;
  }).map((n) => n.id);
}

export function edgeAtPoint(model: DiagramModel, x: number, y: number, tol: number): string | undefined {
  for (let i = model.edges.length - 1; i >= 0; i--) {
    const e = model.edges[i];
    const from = model.nodes.find((n) => n.id === e.from);
    const to = model.nodes.find((n) => n.id === e.to);
    if (!from || !to) { continue; }
    const d = e.from === e.to ? selfLoopPathD(from, model.direction) : edgePathD(from, to, model.direction);
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
  node: DiagramNode,
): Array<{ dir: 'N' | 'S' | 'E' | 'W'; x: number; y: number }> {
  const b = box(node);
  return [
    { dir: 'N', x: node.x, y: b.y },
    { dir: 'S', x: node.x, y: b.y + b.h },
    { dir: 'E', x: b.x + b.w, y: node.y },
    { dir: 'W', x: b.x, y: node.y },
  ];
}

/** Which of a single node's connection handles (if any) is within `tol` of (x, y). */
export function anchorForNode(
  node: DiagramNode, x: number, y: number, tol: number,
): 'N' | 'S' | 'E' | 'W' | undefined {
  for (const a of nodeAnchorPoints(node)) {
    if (Math.abs(x - a.x) <= tol && Math.abs(y - a.y) <= tol) { return a.dir; }
  }
  return undefined;
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
