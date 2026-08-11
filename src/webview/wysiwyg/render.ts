import { DiagramModel, DiagramNode, DiagramEdge, DiagramGroup, createShapeElements, lookupShape, nodeSize, resolveNodeStyle, edgeLabelSize, groupBounds, groupChildren, BASE_FONT_SIZE, nodeLabelLayout, edgeLabelLayout, layoutLabel, EDGE_LABEL_FONT_SIZE, type LabelLine } from '../../core';
import { edgePathD, selfLoopPathD, bezierMidpoint } from './edgePath';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Must match the .ceasg-group-title font-size in media/diagram.css. Exported
// so editor.ts's GROUP_TITLE_FONT (the same size, as a measureText shorthand
// for the rename editor) is built from this one number instead of repeating it.
export const GROUP_TITLE_FONT_SIZE = 13;

export interface RenderRefs {
  nodeEls: Map<string, SVGGElement>;
  edgeEls: Map<string, SVGGElement>;
  groupEls: Map<string, SVGGElement>;
}

function el<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

/**
 * Paint laid-out label lines into a `<text>` as one `<tspan>` per styled run.
 *
 * Only the first run of a line carries `x`/`dy`. That keeps the whole line a
 * single SVG text chunk, so the browser centres it exactly under the inherited
 * `text-anchor` — no measurement, and no drift between runs. `xml:space` is set
 * only for multi-run lines, so the space in `**Bold** and _italic_` survives the
 * tspan boundary while single-run labels keep their existing whitespace handling.
 */
function paintLabelLines(text: SVGTextElement, lines: LabelLine[], x: number, lineH: number): void {
  if (lines.some((line) => line.length > 1)) { text.setAttribute('xml:space', 'preserve'); }
  const top = -((lines.length - 1) / 2) * lineH;
  lines.forEach((line, i) => {
    // An empty line still needs a tspan, or the lines below it shift up.
    const runs = line.length > 0 ? line : [{ text: '' }];
    runs.forEach((run, j) => {
      const tspan = el('tspan');
      if (j === 0) {
        tspan.setAttribute('x', String(x));
        tspan.setAttribute('dy', i === 0 ? String(top) : String(lineH));
      }
      if (run.bold) { tspan.style.fontWeight = 'bold'; }
      if (run.italic) { tspan.style.fontStyle = 'italic'; }
      tspan.textContent = run.text;
      text.appendChild(tspan);
    });
  });
}

function renderNode(node: DiagramNode, model: DiagramModel): SVGGElement {
  const g = el('g');
  g.setAttribute('class', 'ceasg-node');
  g.setAttribute('data-node-id', node.id);
  const { w, h } = nodeSize(model, node);
  const style = resolveNodeStyle(model, node);
  for (const shapeEl of createShapeElements(node.shape, node.x, node.y, w, h)) {
    shapeEl.classList.add('ceasg-shape');
    // A solid marker (fork bar, junction dot) is a mark drawn in the stroke
    // colour, not a container: diagram.css fills it from --ceasg-node-stroke,
    // so the node's own fill must not claim it and the stroke colour has to
    // reach it as that custom property. Without the property set the rule
    // falls back to `currentColor` — the inherited text colour, which is not
    // this node's stroke at all.
    const isSolid = shapeEl.getAttribute('data-ceasg-solid') === 'true';
    // Inline style beats the `.ceasg-shape` stylesheet rule; a presentation
    // attribute would be overridden by it, so per-node styling must use style.
    if (style?.fillColor && !isSolid) { shapeEl.style.fill = style.fillColor; }
    if (style?.strokeColor) {
      shapeEl.style.stroke = style.strokeColor;
      shapeEl.style.setProperty('--ceasg-node-stroke', style.strokeColor);
    }
    if (style?.strokeWidth) { shapeEl.style.strokeWidth = String(style.strokeWidth); }
    if (style?.strokeDasharray) { shapeEl.style.strokeDasharray = style.strokeDasharray; }
    g.appendChild(shapeEl);
  }
  // A fixed-size marker sizes itself without reference to its label, so there
  // is nowhere inside it to draw one; Mermaid drops the label for these too.
  // The label stays on the node and in the properties panel — only unpainted.
  if (lookupShape(node.shape)?.hideLabel) { return g; }
  const layout = nodeLabelLayout(node, style);
  const text = el('text');
  text.setAttribute('class', 'ceasg-label');
  text.setAttribute('x', String(node.x));
  text.setAttribute('y', String(node.y));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  if (style?.textColor) { text.style.fill = style.textColor; }
  if (style?.fontSize) { text.style.fontSize = `${style.fontSize}px`; }
  if (style?.fontFamily) { text.style.fontFamily = style.fontFamily; }
  // Line height tracks the font so multi-line labels stay spaced at any size,
  // and agrees with the height `estimateNodeSize` reserved for them.
  paintLabelLines(text, layout.lines, node.x, style?.fontSize ?? BASE_FONT_SIZE);
  g.appendChild(text);
  return g;
}

function renderEdge(model: DiagramModel, edge: DiagramEdge, offset: number): SVGGElement | null {
  // An endpoint id may name a node or a subgraph; either may also be dangling.
  // A dangling edge is skipped rather than raised, because an exception here
  // blanks the whole fenced block in the Markdown preview.
  const d = edge.from === edge.to
    ? selfLoopPathD(model, edge.from, model.direction)
    : edgePathD(model, edge.from, edge.to, model.direction, offset);
  if (d === null) { return null; }
  const g = el('g');
  g.setAttribute('class', `ceasg-edge ceasg-edge-${edge.kind}`);
  g.setAttribute('data-edge-id', edge.id);

  const hit = el('path');
  hit.setAttribute('class', 'ceasg-edge-hit');
  hit.setAttribute('d', d);
  const line = el('path');
  line.setAttribute('class', 'ceasg-edge-line');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  if (edge.kind !== 'open' && edge.kind !== 'invisible') { line.setAttribute('marker-end', 'url(#ceasg-arrow)'); }
  if (edge.kind === 'bidirectional') { line.setAttribute('marker-start', 'url(#ceasg-arrow)'); }
  // Apply per-edge style inline: inline beats the `.ceasg-edge-line` stylesheet
  // rule (a presentation attribute would be overridden by it). The
  // `.ceasg-edge-selected` rule uses `!important` so selection still shows.
  const style = edge.style;
  if (style?.strokeColor) { line.style.stroke = style.strokeColor; }
  if (style?.strokeWidth) { line.style.strokeWidth = String(style.strokeWidth); }
  if (style?.strokeDasharray) { line.style.strokeDasharray = style.strokeDasharray; }
  g.appendChild(hit);
  g.appendChild(line);

  if (edge.label) {
    const mid = bezierMidpoint(d);
    // Background rect so the label reads clearly over the edge line. Sized from
    // measured text width (getBBox isn't available on a detached SVG at build time)
    // via the same helper the auto layout reserves rank space with, so the box
    // always fits the gap the layout opened for it.
    const { w: boxW, h: boxH } = edgeLabelSize(edge);
    const bg = el('rect');
    bg.setAttribute('class', 'ceasg-edge-label-bg');
    bg.setAttribute('x', String(mid.x - boxW / 2));
    bg.setAttribute('y', String(mid.y - boxH / 2));
    bg.setAttribute('width', String(boxW));
    bg.setAttribute('height', String(boxH));
    bg.setAttribute('rx', '2');
    g.appendChild(bg);
    const label = el('text');
    label.setAttribute('class', 'ceasg-edge-label');
    label.setAttribute('x', String(mid.x));
    label.setAttribute('y', String(mid.y));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    if (style?.textColor) { label.style.fill = style.textColor; }
    if (style?.fontSize) { label.style.fontSize = `${style.fontSize}px`; }
    paintLabelLines(label, edgeLabelLayout(edge).lines, mid.x, style?.fontSize ?? EDGE_LABEL_FONT_SIZE);
    g.appendChild(label);
  }
  return g;
}

function renderGroup(model: DiagramModel, group: DiagramGroup): SVGGElement {
  const g = el('g');
  g.setAttribute('class', 'ceasg-group');
  g.setAttribute('data-group-id', group.id);
  const b = groupBounds(model, group);
  const rect = el('rect');
  rect.setAttribute('class', 'ceasg-group-box');
  rect.setAttribute('x', String(b.x));
  rect.setAttribute('y', String(b.y));
  rect.setAttribute('width', String(b.w));
  rect.setAttribute('height', String(b.h));
  rect.setAttribute('rx', '6');
  g.appendChild(rect);
  const title = el('text');
  title.setAttribute('class', 'ceasg-group-title');
  title.setAttribute('x', String(b.x + 10));
  title.setAttribute('y', String(b.y + 16));
  // The title is anchored at the box's top-left, and the box is sized from its
  // members, so the title never wraps — only its markup is styled.
  const lines = layoutLabel(group.title, {
    markdown: group.titleFormat === 'markdown', fontSize: GROUP_TITLE_FONT_SIZE,
  }).lines;
  paintLabelLines(title, lines, b.x + 10, GROUP_TITLE_FONT_SIZE);
  g.appendChild(title);
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

  const groupLayer = el('g');
  groupLayer.setAttribute('class', 'ceasg-group-layer');
  svg.appendChild(groupLayer);

  const edgeLayer = el('g');
  edgeLayer.setAttribute('class', 'ceasg-edge-layer');
  const nodeLayer = el('g');
  nodeLayer.setAttribute('class', 'ceasg-node-layer');
  svg.appendChild(edgeLayer);
  svg.appendChild(nodeLayer);

  const refs: RenderRefs = { nodeEls: new Map(), edgeEls: new Map(), groupEls: new Map() };

  // Render groups outermost-first so nested boxes paint on top of their parent.
  const orderedGroups: DiagramGroup[] = [];
  const pushGroup = (grp: DiagramGroup) => {
    orderedGroups.push(grp);
    for (const child of groupChildren(model, grp.id)) pushGroup(child);
  };
  for (const grp of model.groups) { if (!grp.parentId) pushGroup(grp); }
  for (const grp of orderedGroups) {
    const gEl = renderGroup(model, grp);
    groupLayer.appendChild(gEl);
    refs.groupEls.set(grp.id, gEl);
  }

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
    const g = renderNode(node, model);
    nodeLayer.appendChild(g);
    refs.nodeEls.set(node.id, g);
  }
  return { svg, refs };
}
