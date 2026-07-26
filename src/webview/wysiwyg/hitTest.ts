import { DiagramModel, DiagramNode, estimateNodeSize } from '../../core';

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
