import { describe, it, expect } from 'vitest';
import { isFlowchartSource, renderFlowchartToSvg } from './flowchartPreview';

describe('isFlowchartSource', () => {
  it('accepts flowcharts and headerless snippets, rejects other types', () => {
    expect(isFlowchartSource('flowchart LR\nA-->B')).toBe(true);
    expect(isFlowchartSource('A-->B')).toBe(true); // unknown/headerless
    expect(isFlowchartSource('sequenceDiagram\nA->>B: hi')).toBe(false);
    expect(isFlowchartSource('pie\n"a": 1')).toBe(false);
  });
});

describe('renderFlowchartToSvg', () => {
  it('renders a node per node and sets a viewBox + size', () => {
    const svg = renderFlowchartToSvg('flowchart LR\nA[Start]-->B[End]');
    expect(svg.querySelectorAll('[data-node-id]').length).toBe(2);
    expect(svg.getAttribute('viewBox')).toMatch(/^-?\d/);
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0);
  });

  it('auto-lays-out an unpositioned flowchart so nodes are not all at the origin', () => {
    const svg = renderFlowchartToSvg('flowchart TD\nA-->B-->C');
    const xs = Array.from(svg.querySelectorAll('.ceasg-node text'))
      .map((t) => Number(t.getAttribute('x')));
    const ys = Array.from(svg.querySelectorAll('.ceasg-node text'))
      .map((t) => Number(t.getAttribute('y')));
    const spread = new Set([...xs, ...ys]).size;
    expect(spread).toBeGreaterThan(1); // not all identical coordinates
  });

  it('honors saved positions from a pos comment', () => {
    const src = 'flowchart LR\nA-->B\n%% mermaid-flow:pos A=100,200 B=400,200';
    const svg = renderFlowchartToSvg(src);
    const aText = svg.querySelector('.ceasg-node[data-node-id="A"] text');
    expect(aText?.getAttribute('x')).toBe('100');
    expect(aText?.getAttribute('y')).toBe('200');
  });
});
