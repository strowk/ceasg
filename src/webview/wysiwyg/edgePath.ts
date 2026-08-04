import { DiagramModel, DiagramNode, DiagramEdge, Direction } from '../../core';
import { nodeSize, SHAPES, geom, rayPolygonHit } from '../../core';

// `model` is needed to resolve the node's font (classDef layers included), which
// decides the box size and therefore where the edge meets its border.
export function nodeBorderPoint(model: DiagramModel, node: DiagramNode, towardX: number, towardY: number): { x: number; y: number } {
  const { w, h } = nodeSize(model, node);
  const dx = towardX - node.x;
  const dy = towardY - node.y;
  if (dx === 0 && dy === 0) { return { x: node.x + w / 2, y: node.y }; }
  // Shapes whose filled region diverges sharply from their box declare an
  // outline; everything else keeps the box math this function has always used.
  const outline = SHAPES[node.shape]?.outline;
  if (outline) {
    const hit = rayPolygonHit(node.x, node.y, dx, dy, outline(geom(node.x, node.y, w, h)));
    if (hit) { return hit; }
  }
  const hw = w / 2;
  const hh = h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: node.x + dx * scale, y: node.y + dy * scale };
}

export function edgePathD(model: DiagramModel, from: DiagramNode, to: DiagramNode, dir: Direction, offset = 0): string {
  const a = nodeBorderPoint(model, from, to.x, to.y);
  const b = nodeBorderPoint(model, to, from.x, from.y);
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

export function selfLoopPathD(model: DiagramModel, node: DiagramNode, dir: Direction): string {
  const { w, h } = nodeSize(model, node);
  const horizontal = dir === 'LR' || dir === 'RL';
  if (horizontal) {
    const x = node.x + w / 2;
    const y = node.y;
    return `M${x},${y - 8} C${x + 60},${y - 40} ${x + 60},${y + 40} ${x},${y + 8}`;
  }
  const x = node.x;
  const y = node.y + h / 2;
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
