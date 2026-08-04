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
  it('draws a background rect behind edge labels', () => {
    const { model } = mermaidToModel('flowchart LR\nA -->|hi| B\n');
    model.nodes.forEach((n, i) => { n.x = i * 200; n.y = 0; });
    const { svg } = renderDiagram(model);
    expect(svg.querySelector('.ceasg-edge-label-bg')).toBeTruthy();
    expect(svg.textContent).toContain('hi');
  });
  it('applies node fill color from style', () => {
    const { model } = mermaidToModel('flowchart LR\nA[X]\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0; model.nodes[0].style = { fillColor: '#ff0000' };
    const { refs } = renderDiagram(model);
    const shape = refs.nodeEls.get('A')!.querySelector<SVGElement>('.ceasg-shape')!;
    // Inline style (overrides the .ceasg-shape class rule), not a presentation attribute.
    // jsdom normalizes the hex to rgb(), as browsers do.
    expect(shape.style.fill).toBe('rgb(255, 0, 0)');
  });

  it('gives a solid marker the node stroke colour, not the node fill', () => {
    // fork draws one solid bar. diagram.css fills it from --ceasg-node-stroke,
    // so the stroke colour has to arrive as that property, and the node's fill
    // must not be written over it.
    const { model } = mermaidToModel('flowchart LR\nA@{ shape: fork }\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0;
    model.nodes[0].style = { fillColor: '#ff0000', strokeColor: '#0000ff' };
    const { refs } = renderDiagram(model);
    const shape = refs.nodeEls.get('A')!.querySelector<SVGElement>('.ceasg-shape')!;
    expect(shape.getAttribute('data-ceasg-solid')).toBe('true');
    expect(shape.style.getPropertyValue('--ceasg-node-stroke')).toBe('#0000ff');
    expect(shape.style.fill).toBe('');
  });

  it('applies node stroke width and dasharray from style', () => {
    const { model } = mermaidToModel('flowchart LR\nA[X]\nstyle A stroke-width:3px,stroke-dasharray:5 5\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0;
    const { refs } = renderDiagram(model);
    const shape = refs.nodeEls.get('A')!.querySelector<SVGElement>('.ceasg-shape')!;
    expect(shape.style.strokeWidth).toBe('3');
    expect(shape.style.strokeDasharray).toBe('5 5');
  });

  it('applies node font size and family from style', () => {
    const { model } = mermaidToModel('flowchart LR\nA[X]\nstyle A font-size:24px,font-family:monospace\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0;
    const { refs } = renderDiagram(model);
    const text = refs.nodeEls.get('A')!.querySelector<SVGElement>('.ceasg-label')!;
    expect(text.style.fontSize).toBe('24px');
    expect(text.style.fontFamily).toBe('monospace');
  });

  it('spaces multi-line labels by the styled font size', () => {
    const { model } = mermaidToModel('flowchart LR\nA["one<br>two"]\nstyle A font-size:30px\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0;
    const { refs } = renderDiagram(model);
    const tspans = refs.nodeEls.get('A')!.querySelectorAll('tspan');
    expect(tspans.length).toBe(2);
    expect(tspans[1].getAttribute('dy')).toBe('30');
  });

  it('renders a classDef font size, inherited via a class assignment', () => {
    const { model } = mermaidToModel('flowchart LR\nA[X]\nclassDef big font-size:28px\nclass A big\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0;
    const { refs } = renderDiagram(model);
    const text = refs.nodeEls.get('A')!.querySelector<SVGElement>('.ceasg-label')!;
    expect(text.style.fontSize).toBe('28px');
  });

  it('applies edge stroke color, width, and dasharray from style', () => {
    const { model } = mermaidToModel('flowchart LR\nA-->B\n');
    model.nodes.forEach((n, i) => { n.x = i * 200; n.y = 0; });
    model.edges[0].style = { strokeColor: '#ff0000', strokeWidth: 4, strokeDasharray: '6 4' };
    const { refs } = renderDiagram(model);
    const line = refs.edgeEls.get(model.edges[0].id)!.querySelector<SVGElement>('.ceasg-edge-line')!;
    expect(line.style.stroke).toBe('rgb(255, 0, 0)');
    expect(line.style.strokeWidth).toBe('4');
    expect(line.style.strokeDasharray).toBe('6 4');
  });

  it('applies edge label color and font size from style', () => {
    const { model } = mermaidToModel('flowchart LR\nA -->|hi| B\n');
    model.nodes.forEach((n, i) => { n.x = i * 200; n.y = 0; });
    model.edges[0].style = { textColor: '#00ff00', fontSize: 20 };
    const { refs } = renderDiagram(model);
    const label = refs.edgeEls.get(model.edges[0].id)!.querySelector<SVGElement>('.ceasg-edge-label')!;
    expect(label.style.fill).toBe('rgb(0, 255, 0)');
    expect(label.style.fontSize).toBe('20px');
  });

  it('renders a parsed {} diamond as its real geometry, not a fallback rect', () => {
    // End to end over the real parser: `{}` must come out of the pipeline as a
    // polygon. It no longer exercises alias resolution — the parser
    // canonicalises `{}` to "diam" itself now — but it does still catch the
    // failure that matters here, a name the renderer cannot resolve silently
    // degrading to the fallback rect.
    const { model } = mermaidToModel('flowchart LR\nA[Start]-->B{Choice}\n');
    model.nodes.forEach((n, i) => { n.x = i * 200; n.y = 0; });
    const { refs } = renderDiagram(model);
    const shape = refs.nodeEls.get('B')!.querySelector('.ceasg-shape')!;
    expect(shape.tagName).toBe('polygon');
  });
});

describe('renderDiagram groups', () => {
  it('emits a group box and title behind the nodes', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph g1 [My Group]\nA[Alpha]-->B[Beta]\nend\n',
    );
    model.nodes.forEach((n, i) => { n.x = 100 + i * 150; n.y = 100; });
    const { svg, refs } = renderDiagram(model);
    expect(svg.querySelectorAll('[data-group-id]').length).toBe(1);
    expect(refs.groupEls.get('g1')).toBeTruthy();
    expect(svg.textContent).toContain('My Group');
    // group layer precedes node layer in DOM order (renders behind)
    const groupLayer = svg.querySelector('.ceasg-group-layer')!;
    const nodeLayer = svg.querySelector('.ceasg-node-layer')!;
    expect(groupLayer.compareDocumentPosition(nodeLayer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders an outer group before its nested child (outer behind)', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph outer\nsubgraph inner\nA-->B\nend\nend\n',
    );
    model.nodes.forEach((n, i) => { n.x = 120 + i * 120; n.y = 120; });
    const { svg } = renderDiagram(model);
    const ids = [...svg.querySelectorAll('[data-group-id]')].map((e) => e.getAttribute('data-group-id'));
    expect(ids.indexOf('outer')).toBeLessThan(ids.indexOf('inner'));
  });
});
