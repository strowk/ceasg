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

  it('draws no label on a marker shape, which has no room for one', () => {
    // hourglass is a fixed 48x48 marker: its size rule ignores the label, so a
    // drawn label would spill outside the shape. Mermaid resolves this by
    // discarding the label for these shapes rather than placing it elsewhere.
    const { model } = mermaidToModel('flowchart LR\nA@{ shape: hourglass, label: "Collate" }\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0;
    const { refs } = renderDiagram(model);
    const node = refs.nodeEls.get('A')!;
    expect(node.querySelector('.ceasg-label')).toBeNull();
    expect(node.textContent).not.toContain('Collate');
  });

  it('still draws a label on a shape that sizes itself to fit one', () => {
    // The counterpart to the marker case: tri grows via fitGrow to contain its
    // label, so suppressing it there would lose text the shape has room for.
    const { model } = mermaidToModel('flowchart LR\nA@{ shape: tri, label: "Extract" }\n');
    model.nodes[0].x = 0; model.nodes[0].y = 0;
    const { refs } = renderDiagram(model);
    expect(refs.nodeEls.get('A')!.textContent).toContain('Extract');
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

  it('anchors an edge to a subgraph on the group box border', () => {
    const { model } = mermaidToModel('flowchart LR\nsubgraph g1\nA\nend\nB\n');
    const a = model.nodes.find((n) => n.id === 'A')!;
    const b = model.nodes.find((n) => n.id === 'B')!;
    a.x = 0; a.y = 0; b.x = 500; b.y = 0;
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    g1.x = -100; g1.y = -100; g1.w = 200; g1.h = 200;
    model.edges.push({ id: 'e1', from: 'g1', to: 'B', label: '', kind: 'arrow' });
    const { refs } = renderDiagram(model);
    const d = refs.edgeEls.get('e1')!.querySelector('.ceasg-edge-line')!.getAttribute('d')!;
    // Group centre is (0, 0), B is due east, so the path leaves the box's right
    // border at x = 100 — not the centre and not a member node's border.
    expect(d.startsWith('M100,0')).toBe(true);
  });

  it('skips an edge with an unresolvable endpoint instead of throwing', () => {
    const { model } = mermaidToModel('flowchart LR\nA-->B\n');
    model.nodes.forEach((n, i) => { n.x = i * 200; n.y = 0; });
    model.edges.push({ id: 'ghost', from: 'A', to: 'nope', label: '', kind: 'arrow' });
    const { refs } = renderDiagram(model);
    expect(refs.edgeEls.has('ghost')).toBe(false);
    expect(refs.edgeEls.size).toBe(1);
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

describe('formatted labels', () => {
  const place = (model: ReturnType<typeof mermaidToModel>['model']) => {
    model.nodes.forEach((n, i) => { n.x = i * 300; n.y = 0; });
  };

  it('emits one tspan per styled run', () => {
    const { model } = mermaidToModel('flowchart LR\nA["`**Bold** and _italic_`"]\n');
    place(model);
    const { refs } = renderDiagram(model);
    const tspans = refs.nodeEls.get('A')!.querySelectorAll('tspan');
    expect(tspans.length).toBe(3);
    expect(tspans[0]!.textContent).toBe('Bold');
    expect(tspans[0]!.style.fontWeight).toBe('bold');
    expect(tspans[1]!.textContent).toBe(' and ');
    expect(tspans[1]!.style.fontWeight).toBe('');
    expect(tspans[2]!.textContent).toBe('italic');
    expect(tspans[2]!.style.fontStyle).toBe('italic');
  });

  // Only the first run of a line carries x, so the whole line stays one SVG
  // text chunk and the browser centres it under text-anchor: middle.
  it('gives only the first run of a line an x', () => {
    const { model } = mermaidToModel('flowchart LR\nA["`**a** b`"]\n');
    place(model);
    const { refs } = renderDiagram(model);
    const tspans = refs.nodeEls.get('A')!.querySelectorAll('tspan');
    expect(tspans[0]!.hasAttribute('x')).toBe(true);
    expect(tspans[1]!.hasAttribute('x')).toBe(false);
    expect(tspans[1]!.hasAttribute('dy')).toBe(false);
  });

  it('preserves whitespace only when a line has several runs', () => {
    const { model: multi } = mermaidToModel('flowchart LR\nA["`**a** b`"]\n');
    place(multi);
    expect(renderDiagram(multi).refs.nodeEls.get('A')!
      .querySelector('text')!.getAttribute('xml:space')).toBe('preserve');

    const { model: single } = mermaidToModel('flowchart LR\nA[Plain]\n');
    place(single);
    expect(renderDiagram(single).refs.nodeEls.get('A')!
      .querySelector('text')!.hasAttribute('xml:space')).toBe(false);
  });

  it('renders HTML markup in a plain label', () => {
    const { model } = mermaidToModel('flowchart LR\nA["one<br/><b>two</b>"]\n');
    place(model);
    const g = renderDiagram(model).refs.nodeEls.get('A')!;
    const tspans = g.querySelectorAll('tspan');
    expect(tspans.length).toBe(2);
    expect(tspans[0]!.textContent).toBe('one');
    expect(tspans[1]!.textContent).toBe('two');
    expect(tspans[1]!.style.fontWeight).toBe('bold');
    // Second line: its own x, and a dy that steps down one line.
    expect(tspans[1]!.hasAttribute('x')).toBe(true);
  });

  it('decodes entities', () => {
    const { model } = mermaidToModel('flowchart LR\nA["Tom &amp; Jerry"]\n');
    place(model);
    expect(renderDiagram(model).refs.nodeEls.get('A')!.textContent).toBe('Tom & Jerry');
  });

  it('renders a markdown edge label as styled runs', () => {
    const { model } = mermaidToModel('flowchart LR\nA -->|"`**yes**`"| B\n');
    place(model);
    const label = renderDiagram(model).refs.edgeEls.get(model.edges[0]!.id)!
      .querySelector('.ceasg-edge-label')!;
    const tspans = label.querySelectorAll('tspan');
    expect(tspans.length).toBe(1);
    expect(tspans[0]!.textContent).toBe('yes');
    expect((tspans[0] as SVGElement).style.fontWeight).toBe('bold');
  });

  it('renders a markdown subgraph title as styled runs', () => {
    const { model } = mermaidToModel('flowchart LR\nsubgraph S["`**G**`"]\nA\nend\n');
    place(model);
    const title = renderDiagram(model).refs.groupEls.get('S')!
      .querySelector('.ceasg-group-title')!;
    const tspans = title.querySelectorAll('tspan');
    expect(tspans[0]!.textContent).toBe('G');
    expect((tspans[0] as SVGElement).style.fontWeight).toBe('bold');
  });
});
