import { describe, it, expect } from 'vitest';
import { mermaidToModel, modelToMermaid } from './index';

describe('position round-trip', () => {
  it('preserves manual node positions through serialize→parse', () => {
    const src = 'flowchart TB\nA[X]-->B[Y]\n';
    const { model } = mermaidToModel(src);
    model.nodes.find((n) => n.id === 'A')!.x = 123;
    model.nodes.find((n) => n.id === 'A')!.y = 456;
    const out = modelToMermaid(model, { includePositions: true });
    expect(out).toContain('mermaid-flow:pos');
    const reparsed = mermaidToModel(out).model;
    expect(reparsed.nodes.find((n) => n.id === 'A')).toMatchObject({ x: 123, y: 456 });
  });
});
