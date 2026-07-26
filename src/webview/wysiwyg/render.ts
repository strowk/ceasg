import { DiagramModel, DiagramNode, DiagramEdge, createShapeElements, estimateNodeSize } from '../../core';
import { edgePathD, selfLoopPathD, bezierMidpoint } from './edgePath';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface RenderRefs {
  nodeEls: Map<string, SVGGElement>;
  edgeEls: Map<string, SVGGElement>;
}

function el<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function sizeOf(n: DiagramNode): { w: number; h: number } {
  return { w: n.w ?? estimateNodeSize(n).w, h: n.h ?? estimateNodeSize(n).h };
}

function renderNode(node: DiagramNode): SVGGElement {
  const g = el('g');
  g.setAttribute('class', 'ceasg-node');
  g.setAttribute('data-node-id', node.id);
  const { w, h } = sizeOf(node);
  for (const shapeEl of createShapeElements(node.shape, node.x, node.y, w, h)) {
    shapeEl.classList.add('ceasg-shape');
    g.appendChild(shapeEl);
  }
  const lines = node.label.split('\n');
  const text = el('text');
  text.setAttribute('class', 'ceasg-label');
  text.setAttribute('x', String(node.x));
  text.setAttribute('y', String(node.y));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  const lineH = 16;
  lines.forEach((line, i) => {
    const tspan = el('tspan');
    tspan.setAttribute('x', String(node.x));
    tspan.setAttribute('dy', i === 0 ? `${-((lines.length - 1) / 2) * lineH}` : `${lineH}`);
    tspan.textContent = line;
    text.appendChild(tspan);
  });
  g.appendChild(text);
  return g;
}

function renderEdge(model: DiagramModel, edge: DiagramEdge, offset: number): SVGGElement | null {
  const from = model.nodes.find((n) => n.id === edge.from);
  const to = model.nodes.find((n) => n.id === edge.to);
  if (!from || !to) { return null; }
  const g = el('g');
  g.setAttribute('class', `ceasg-edge ceasg-edge-${edge.kind}`);
  g.setAttribute('data-edge-id', edge.id);

  const d = from.id === to.id ? selfLoopPathD(from, model.direction) : edgePathD(from, to, model.direction, offset);

  const hit = el('path');
  hit.setAttribute('class', 'ceasg-edge-hit');
  hit.setAttribute('d', d);
  const line = el('path');
  line.setAttribute('class', 'ceasg-edge-line');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  if (edge.kind !== 'open' && edge.kind !== 'invisible') { line.setAttribute('marker-end', 'url(#ceasg-arrow)'); }
  if (edge.kind === 'bidirectional') { line.setAttribute('marker-start', 'url(#ceasg-arrow)'); }
  g.appendChild(hit);
  g.appendChild(line);

  if (edge.label) {
    const mid = bezierMidpoint(d);
    const label = el('text');
    label.setAttribute('class', 'ceasg-edge-label');
    label.setAttribute('x', String(mid.x));
    label.setAttribute('y', String(mid.y));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.textContent = edge.label;
    g.appendChild(label);
  }
  return g;
}

function arrowMarker(): SVGDefsElement {
  const defs = el('defs');
  const marker = el('marker');
  marker.setAttribute('id', 'ceasg-arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '7');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('orient', 'auto-start-reverse');
  const path = el('path');
  path.setAttribute('d', 'M0,0 L10,5 L0,10 z');
  path.setAttribute('class', 'ceasg-arrowhead');
  marker.appendChild(path);
  defs.appendChild(marker);
  return defs;
}

export function renderDiagram(model: DiagramModel): { svg: SVGSVGElement; refs: RenderRefs } {
  const svg = el('svg');
  svg.setAttribute('class', 'ceasg-canvas-svg');
  svg.appendChild(arrowMarker());

  const edgeLayer = el('g');
  edgeLayer.setAttribute('class', 'ceasg-edge-layer');
  const nodeLayer = el('g');
  nodeLayer.setAttribute('class', 'ceasg-node-layer');
  svg.appendChild(edgeLayer);
  svg.appendChild(nodeLayer);

  const refs: RenderRefs = { nodeEls: new Map(), edgeEls: new Map() };

  // count parallels for offset separation
  const pairCount = new Map<string, number>();
  for (const edge of model.edges) {
    const key = [edge.from, edge.to].sort().join('~');
    const idx = pairCount.get(key) ?? 0;
    const offset = idx === 0 ? 0 : (idx % 2 === 1 ? 1 : -1) * Math.ceil(idx / 2) * 18;
    pairCount.set(key, idx + 1);
    const g = renderEdge(model, edge, offset);
    if (g) { edgeLayer.appendChild(g); refs.edgeEls.set(edge.id, g); }
  }
  for (const node of model.nodes) {
    const g = renderNode(node);
    nodeLayer.appendChild(g);
    refs.nodeEls.set(node.id, g);
  }
  return { svg, refs };
}
