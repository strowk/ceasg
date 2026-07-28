import { describe, it, expect } from 'vitest';
import { mermaidToModel } from './parser';
import { modelToMermaid } from './serializer';

function roundtrip(src: string): string {
  return modelToMermaid(mermaidToModel(src).model, { includePositions: false });
}

describe('round-trip parse↔serialize', () => {
  it('is stable across a second pass (idempotent)', () => {
    const once = roundtrip('flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C((End))\n');
    const twice = roundtrip(once);
    expect(twice).toBe(once);
  });
  it('preserves edge kinds', () => {
    const out = roundtrip('flowchart TB\nA -.-> B\nB ==> C\nC --- D\n');
    expect(out).toContain('-.->');
    expect(out).toContain('==>');
    expect(out).toMatch(/C --- D|--- /);
  });
  it('preserves unknown directives verbatim', () => {
    const src = 'flowchart TB\nA-->B\nclick A callback\n';
    expect(roundtrip(src)).toContain('click A callback');
  });
  it('preserves subgraph title and member nodes', () => {
    const src = 'flowchart TB\nsubgraph g1 [My Group]\nA[Alpha] --> B[Beta]\nend\n';
    const out = roundtrip(src);
    expect(out).toContain('subgraph g1');
    expect(out).toContain('My Group');
    expect(out).toContain('Alpha');
    expect(out).toContain('Beta');
    expect(roundtrip(out)).toBe(out);
  });
  it('preserves inline node styles', () => {
    const out = roundtrip('flowchart LR\nA[Styled]\nstyle A fill:#f00,stroke:#333,color:#fff\n');
    expect(out).toContain('style A');
    expect(out).toContain('fill:#f00');
  });
  it('preserves edge linkStyle props including stroke-dasharray', () => {
    const src = 'flowchart LR\nA-->B\nlinkStyle 0 stroke:#f00,stroke-width:4px,stroke-dasharray:6 4,color:#0f0,font-size:20px\n';
    const out = roundtrip(src);
    expect(out).toContain('linkStyle 0');
    expect(out).toContain('stroke:#f00');
    expect(out).toContain('stroke-width:4px');
    expect(out).toContain('stroke-dasharray:6 4');
    expect(out).toContain('color:#0f0');
    expect(out).toContain('font-size:20px');
    expect(roundtrip(out)).toBe(out);
  });
  it('preserves node font and stroke style props', () => {
    const src = 'flowchart LR\nA-->B\nstyle A font-size:24px,font-family:monospace,stroke-width:3px,stroke-dasharray:5 5\n';
    const out = roundtrip(src);
    expect(out).toContain('style A');
    expect(out).toContain('font-size:24px');
    expect(out).toContain('font-family:monospace');
    expect(out).toContain('stroke-width:3px');
    expect(out).toContain('stroke-dasharray:5 5');
    expect(roundtrip(out)).toBe(out);
  });
  it('preserves classDef and class assignments', () => {
    const src = 'flowchart LR\nA[Node]\nclassDef hot fill:#f00\nclass A hot\n';
    const out = roundtrip(src);
    expect(out).toContain('classDef hot');
    expect(out).toContain('fill:#f00');
    expect(roundtrip(out)).toBe(out);
  });
  it('preserves edge label text', () => {
    expect(roundtrip('flowchart LR\nA -->|"yes or no?"| B\n')).toContain('yes or no?');
  });
  it('preserves bidirectional and invisible edge kinds', () => {
    const out = roundtrip('flowchart LR\nA <--> B\nC ~~~ D\n');
    expect(out).toContain('<-->');
    expect(out).toContain('~~~');
  });
  it('encodes multi-line labels and is idempotent', () => {
    const out = roundtrip('flowchart LR\nA["line1<br/>line2"]\n');
    expect(out).toContain('<br/>');
    expect(roundtrip(out)).toBe(out);
  });
});

describe('nested subgraph round-trip', () => {
  it('preserves nesting structure across a round trip', () => {
    const src =
      'flowchart TB\nsubgraph outer\nsubgraph inner\nA[Alpha] --> B[Beta]\nend\nC[Gamma]\nend\n';
    const out = roundtrip(src);
    // inner subgraph appears before its end, nested inside outer
    expect(out).toMatch(/subgraph outer[\s\S]*subgraph inner[\s\S]*end[\s\S]*end/);
    expect(out).toContain('Gamma');
    expect(out.match(/Gamma/g)!.length).toBe(1);
    expect(roundtrip(out)).toBe(out);
  });

  it('emits a gpos comment when positions are included', () => {
    const model = mermaidToModel(
      'flowchart TB\nsubgraph g1\nA-->B\nend\n',
    ).model;
    model.groups[0].x = 40; model.groups[0].y = 20;
    model.groups[0].w = 300; model.groups[0].h = 180;
    const out = modelToMermaid(model, { includePositions: true });
    expect(out).toContain('%% mermaid-flow:gpos');
    expect(out).toContain('g1=40,20,300,180');
  });
});
