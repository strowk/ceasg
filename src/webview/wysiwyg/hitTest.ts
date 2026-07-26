import { DiagramModel, DiagramNode, estimateNodeSize } from '../../core';
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

export function anchorAtPoint(
  model: DiagramModel, x: number, y: number, tolerance: number,
): { id: string; dir: 'N' | 'S' | 'E' | 'W' } | undefined {
  for (let i = model.nodes.length - 1; i >= 0; i--) {
    const n = model.nodes[i];
    const b = box(n);
    const anchors: Array<{ dir: 'N' | 'S' | 'E' | 'W'; ax: number; ay: number }> = [
      { dir: 'N', ax: n.x, ay: b.y },
      { dir: 'S', ax: n.x, ay: b.y + b.h },
      { dir: 'E', ax: b.x + b.w, ay: n.y },
      { dir: 'W', ax: b.x, ay: n.y },
    ];
    for (const a of anchors) {
      if (Math.abs(x - a.ax) <= tolerance && Math.abs(y - a.ay) <= tolerance) { return { id: n.id, dir: a.dir }; }
    }
  }
  return undefined;
}
