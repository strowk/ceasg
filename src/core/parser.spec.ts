import { describe, it, expect } from 'vitest';
import { mermaidToModel } from './parser';

describe('mermaidToModel', () => {
  it('parses direction, nodes, and an edge', () => {
    const { model } = mermaidToModel('flowchart LR\n  A[Start] --> B{Choice}\n');
    expect(model.direction).toBe('LR');
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['A', 'B']);
    expect(model.nodes.find((n) => n.id === 'A')?.label).toBe('Start');
    expect(model.nodes.find((n) => n.id === 'B')?.shape).toBe('diamond');
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({ from: 'A', to: 'B', kind: 'arrow' });
  });
  it('reads position hints', () => {
    const { model } = mermaidToModel('flowchart TB\n%% mermaid-flow:pos A=80,60\nA[X]\n');
    expect(model.nodes[0]).toMatchObject({ x: 80, y: 60 });
  });
  it('preserves unknown lines in extras (round-trip safety)', () => {
    const { model } = mermaidToModel('flowchart TB\nA-->B\nsomeUnknownDirective foo\n');
    expect(model.extras.join('\n')).toContain('someUnknownDirective foo');
  });
});
