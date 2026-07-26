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
    expect(out).toContain('---');
  });
  it('preserves unknown directives verbatim', () => {
    const src = 'flowchart TB\nA-->B\nclick A callback\n';
    expect(roundtrip(src)).toContain('click A callback');
  });
  it('preserves subgraphs', () => {
    const out = roundtrip('flowchart TB\nsubgraph g1 [Group]\nA-->B\nend\n');
    expect(out).toContain('subgraph');
    expect(out).toContain('end');
  });
});
