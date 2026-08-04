import { describe, it, expect } from 'vitest';
import { mermaidToModel } from './parser';

describe('mermaidToModel', () => {
  it('parses direction, nodes, and an edge', () => {
    const { model } = mermaidToModel('flowchart LR\n  A[Start] --> B{Choice}\n');
    expect(model.direction).toBe('LR');
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['A', 'B']);
    expect(model.nodes.find((n) => n.id === 'A')?.label).toBe('Start');
    expect(model.nodes.find((n) => n.id === 'B')?.shape).toBe('diam');
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

describe('subgraph nesting + geometry', () => {
  it('records parentId for a nested subgraph', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph outer\nsubgraph inner\nA-->B\nend\nC\nend\n',
    );
    const inner = model.groups.find((g) => g.id === 'inner')!;
    const outer = model.groups.find((g) => g.id === 'outer')!;
    expect(inner.parentId).toBe('outer');
    expect(outer.parentId).toBeUndefined();
    // A and B are innermost members of inner, C is a direct member of outer
    expect(inner.nodeIds).toContain('A');
    expect(outer.nodeIds).toContain('C');
    expect(outer.nodeIds).not.toContain('A');
  });

  it('parses a gpos comment into stored group bounds', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph g1\nA-->B\nend\n%% mermaid-flow:gpos g1=40,20,300,180\n',
    );
    const g = model.groups.find((gr) => gr.id === 'g1')!;
    expect(g.x).toBe(40);
    expect(g.y).toBe(20);
    expect(g.w).toBe(300);
    expect(g.h).toBe(180);
  });

  it('leaves bounds undefined when no gpos comment is present', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA-->B\nend\n');
    const g = model.groups.find((gr) => gr.id === 'g1')!;
    expect(g.x).toBeUndefined();
  });

  it('keeps an outer group that only contains a nested subgraph (no direct nodes)', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph outer\nsubgraph inner\nA-->B\nend\nend\n',
    );
    // outer has no direct member nodes, only the nested `inner` group — must survive.
    expect(model.groups.find((g) => g.id === 'outer')).toBeTruthy();
    expect(model.groups.find((g) => g.id === 'outer')!.nodeIds).toHaveLength(0);
    expect(model.groups.find((g) => g.id === 'inner')!.parentId).toBe('outer');
  });
});

describe('node style props', () => {
  it('parses stroke-width and stroke-dasharray as typed fields, not extras', () => {
    const { model } = mermaidToModel(
      'flowchart LR\nA-->B\nstyle A stroke-width:3px,stroke-dasharray:5 5\n',
    );
    const style = model.nodes.find((n) => n.id === 'A')!.style!;
    expect(style.strokeWidth).toBe(3);
    expect(style.strokeDasharray).toBe('5 5');
    expect(style.extra ?? []).toHaveLength(0);
  });

  it('parses font-size and font-family', () => {
    const { model } = mermaidToModel(
      'flowchart LR\nA-->B\nstyle A font-size:24px,font-family:monospace\n',
    );
    const style = model.nodes.find((n) => n.id === 'A')!.style!;
    expect(style.fontSize).toBe(24);
    expect(style.fontFamily).toBe('monospace');
  });

  it('still preserves genuinely unknown props verbatim', () => {
    const { model } = mermaidToModel('flowchart LR\nA-->B\nstyle A opacity:0.5\n');
    expect(model.nodes.find((n) => n.id === 'A')!.style!.extra).toEqual(['opacity:0.5']);
  });
});

describe('@{shape} alias resolution', () => {
  const shapeOf = (src: string) =>
    mermaidToModel(`flowchart TD\n  ${src}\n`).model.nodes[0]?.shape;

  it('resolves canonical Mermaid names', () => {
    expect(shapeOf('A@{shape: dbl-circ, label: "x"}')).toBe('dbl-circ');
  });

  it('resolves documented aliases', () => {
    expect(shapeOf('A@{shape: database, label: "x"}')).toBe('cyl');
    expect(shapeOf('A@{shape: out-in, label: "x"}')).toBe('lean-l');
  });

  it('is case-insensitive', () => {
    expect(shapeOf('A@{shape: DATABASE, label: "x"}')).toBe('cyl');
  });

  it('degrades an unknown name to rect', () => {
    expect(shapeOf('A@{shape: not-a-shape, label: "x"}')).toBe('rect');
  });
});
