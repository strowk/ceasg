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

describe('edges naming a subgraph id', () => {
  const PIPELINE =
    'flowchart TB\n    subgraph S1 [Pipeline]\n        A[Ingest] --> B[Transform]\n    end\n    S1 --> D[Report]\n';

  it('does not invent a phantom node for the subgraph id', () => {
    const { model } = mermaidToModel(PIPELINE);
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'D']);
    expect(model.nodes.find((n) => n.id === 'S1')).toBeUndefined();
    expect(model.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['A->B', 'S1->D']);
    const g = model.groups.find((gr) => gr.id === 'S1')!;
    expect(g.title).toBe('Pipeline');
    expect(g.nodeIds).toEqual(['A', 'B']);
  });

  // Node insertion order differs (the forward reference declares D first), so
  // compare by sorted id — everything that carries meaning must match.
  const shape = (src: string) => {
    const { model } = mermaidToModel(src);
    return {
      nodes: model.nodes.map((n) => n.id).sort(),
      groups: model.groups.map((g) => ({ id: g.id, nodeIds: [...g.nodeIds].sort() })),
      edges: model.edges.map((e) => `${e.from}->${e.to}`).sort(),
    };
  };

  it('gives the same model whether the edge precedes or follows the block', () => {
    const forward =
      'flowchart TB\n    S1 --> D[Report]\n    subgraph S1 [Pipeline]\n        A[Ingest] --> B[Transform]\n    end\n';
    expect(shape(forward)).toEqual(shape(PIPELINE));
  });

  it('resolves a node -> subgraph edge', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nD[Report]\nsubgraph S1\nA-->B\nend\nD --> S1\n',
    );
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'D']);
    expect(model.edges.map((e) => `${e.from}->${e.to}`)).toContain('D->S1');
  });

  it('resolves a subgraph -> subgraph edge', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph S1\nA\nend\nsubgraph S2\nB\nend\nS1 --> S2\n',
    );
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['A', 'B']);
    expect(model.groups.map((g) => g.id).sort()).toEqual(['S1', 'S2']);
    expect(model.edges.map((e) => `${e.from}->${e.to}`)).toEqual(['S1->S2']);
  });

  it('keeps an empty subgraph that an edge references', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph S1\nend\nS1 --> D\n');
    expect(model.groups.find((g) => g.id === 'S1')).toBeTruthy();
    expect(model.nodes.map((n) => n.id)).toEqual(['D']);
  });

  it('strips a subgraph id mentioned inside another subgraph body', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph S1\nA\nend\nsubgraph S2\nS1\nB\nend\nS1 --> B\n',
    );
    const s2 = model.groups.find((g) => g.id === 'S2')!;
    expect(s2.nodeIds).toEqual(['B']);
    expect(model.nodes.find((n) => n.id === 'S1')).toBeUndefined();
  });

  it('keeps a click binding on a subgraph id in extras', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph S1\nA-->B\nend\nS1 --> D\nclick S1 "https://x"\n',
    );
    expect(model.extras.join('\n')).toContain('click S1 "https://x"');
    expect(model.nodes.find((n) => n.id === 'S1')).toBeUndefined();
  });

  // `style S1 ...` / `class S1 hot` is how Mermaid styles a subgraph. ceasg does
  // not model subgraph styling, so the lines must survive as extras rather than
  // disappearing with the placeholder node they were folded into.
  it('preserves a style line targeting a subgraph id', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph S1\nA-->B\nend\nS1 --> D\nstyle S1 fill:#f00\n',
    );
    expect(model.nodes.find((n) => n.id === 'S1')).toBeUndefined();
    expect(model.extras).toContain('style S1 fill:#f00');
  });

  it('preserves a class assignment targeting a subgraph id without duplicating it', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph S1\nA-->B\nend\nS1 --> D\nclassDef hot fill:#f00\nclass A,S1 hot\n',
    );
    expect(model.nodes.find((n) => n.id === 'S1')).toBeUndefined();
    expect(model.extras).toContain('class S1 hot');
    // A still carries the class in the model, so the serializer emits its
    // assignment; the extras line must not repeat it.
    expect(model.nodes.find((n) => n.id === 'A')!.classes).toEqual(['hot']);
    expect(model.extras.filter((e) => e.startsWith('class '))).toEqual(['class S1 hot']);
  });

  it('does not apply a stale pos hint left over from a removed phantom', () => {
    const { model } = mermaidToModel(
      'flowchart TB\n%% mermaid-flow:pos S1=500,500 D=80,60\nsubgraph S1\nA-->B\nend\nS1 --> D\n',
    );
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'D']);
    expect(model.nodes.find((n) => n.id === 'D')).toMatchObject({ x: 80, y: 60 });
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

describe('markdown string labels', () => {
  it('flags a backtick-wrapped node label and strips the backticks', () => {
    const { model } = mermaidToModel('flowchart LR\nA["`**Bold**`"]\n');
    expect(model.nodes[0]?.label).toBe('**Bold**');
    expect(model.nodes[0]?.labelFormat).toBe('markdown');
  });
  it('leaves a plain label unflagged', () => {
    const { model } = mermaidToModel('flowchart LR\nA["**Bold**"]\n');
    expect(model.nodes[0]?.label).toBe('**Bold**');
    expect(model.nodes[0]?.labelFormat).toBeUndefined();
  });
  it('flags a markdown edge label', () => {
    const { model } = mermaidToModel('flowchart LR\nA -->|"`_yes_`"| B\n');
    expect(model.edges[0]?.label).toBe('_yes_');
    expect(model.edges[0]?.labelFormat).toBe('markdown');
  });
  it('flags a markdown subgraph title', () => {
    const { model } = mermaidToModel('flowchart LR\nsubgraph S["`**G**`"]\nA\nend\n');
    expect(model.groups[0]?.title).toBe('**G**');
    expect(model.groups[0]?.titleFormat).toBe('markdown');
  });
  it('flags a markdown label in the v11 attribute form', () => {
    const { model } = mermaidToModel('flowchart LR\nA@{ shape: rect, label: "`**B**`" }\n');
    expect(model.nodes[0]?.label).toBe('**B**');
    expect(model.nodes[0]?.labelFormat).toBe('markdown');
  });
  it('keeps HTML markup in a plain label verbatim', () => {
    const { model } = mermaidToModel('flowchart LR\nA["x <b>y</b>"]\n');
    expect(model.nodes[0]?.label).toBe('x <b>y</b>');
  });
});
