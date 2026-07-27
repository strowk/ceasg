import { mermaidToModel, layoutMissing, detectDiagramType, isVisuallyEditable } from '../core';
import { renderDiagram } from '../webview/wysiwyg/render';
import { computeContentBounds } from '../webview/wysiwyg/viewport';

/** Whether ceasg's positioned renderer should draw this block (vs. mermaid.js). */
export function isFlowchartSource(src: string): boolean {
  return isVisuallyEditable(detectDiagramType(src));
}

/** Parse → layout (auto if unpositioned) → render → size into a standalone SVG. */
export function renderFlowchartToSvg(src: string): SVGSVGElement {
  const { model } = mermaidToModel(src);
  layoutMissing(model); // no-op when positions came from the pos comment
  const { svg } = renderDiagram(model);
  const b = computeContentBounds(model);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  svg.setAttribute('viewBox', `${b.minX} ${b.minY} ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
  return svg;
}
