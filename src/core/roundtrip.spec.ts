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
