import { describe, it, expect } from 'vitest';
import { renderDiagram } from './render';
import { mermaidToModel } from '../../core';

describe('renderDiagram', () => {
  it('emits a node group per node and an edge group per edge', () => {
    const { model } = mermaidToModel('flowchart LR\nA[Start]-->B[End]\n');
    model.nodes.forEach((n, i) => { n.x = i * 200; n.y = 0; });
    const { svg, refs } = renderDiagram(model);
    expect(svg.querySelectorAll('[data-node-id]').length).toBe(2);
    expect(svg.querySelectorAll('[data-edge-id]').length).toBe(1);
    expect(refs.nodeEls.get('A')).toBeTruthy();
    expect(refs.edgeEls.size).toBe(1);
  });
  it('renders the node label text', () => {
    const { model } = mermaidToModel('flowchart LR\nA[Start]\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0;
    const { svg } = renderDiagram(model);
    expect(svg.textContent).toContain('Start');
  });
  it('applies node fill color from style', () => {
    const { model } = mermaidToModel('flowchart LR\nA[X]\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0; model.nodes[0].style = { fillColor: '#ff0000' };
    const { refs } = renderDiagram(model);
    const shape = refs.nodeEls.get('A')!.querySelector('.ceasg-shape')!;
    expect(shape.getAttribute('fill')).toBe('#ff0000');
  });
});
