import { describe, it, expect } from 'vitest';
import { mermaidToModel } from './parser';
import { modelToMermaid } from './serializer';
import { emptyModel, setNodeShape } from './model';
import { ALL_SHAPES } from './shapes';

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
  it('normalizes the other two line-break spellings onto <br/>', () => {
    const fromEscape = roundtrip('flowchart LR\nA["line1\\nline2"]\n');
    const fromNewline = roundtrip('flowchart LR\nA["line1\nline2"]\n');
    expect(fromEscape).toContain('A["line1<br/>line2"]');
    expect(fromNewline).toBe(fromEscape);
    expect(roundtrip(fromEscape)).toBe(fromEscape);
  });
  it('leaves the \\n escape alone in a markdown label', () => {
    const out = roundtrip('flowchart LR\nA["`line1\\nline2`"]\n');
    expect(out).toContain('A["`line1\\nline2`"]');
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

describe('subgraph-edge round-trip', () => {
  // The regression that motivated the work: the parser used to invent a node
  // for the subgraph id and the serializer wrote it back as `S1["S1"]`, so
  // opening a valid diagram in the editor and saving produced a broken one.
  it('never writes back a phantom node declaration for the subgraph id', () => {
    const src =
      'flowchart TB\n    subgraph S1 [Pipeline]\n        A[Ingest] --> B[Transform]\n    end\n    S1 --> D[Report]\n';
    const out = roundtrip(src);
    expect(out).not.toContain('S1["S1"]');
    expect(out).toContain('S1 --> D');
    expect(out).toContain('subgraph S1 ["Pipeline"]');
  });

  it('reproduces canonical subgraph-edge text byte for byte', () => {
    const canonical = [
      'flowchart TB',
      '    subgraph S1 ["Pipeline"]',
      '        A["Ingest"]',
      '        B["Transform"]',
      '    end',
      '    D["Report"]',
      '    A --> B',
      '    S1 --> D',
    ].join('\n');
    expect(roundtrip(canonical)).toBe(canonical);
  });

  it('applies style and class lines that target the subgraph id to the group', () => {
    const src =
      'flowchart TB\n    subgraph S1 [Pipeline]\n        A[Ingest]\n    end\n    S1 --> D[Report]\n    classDef hot fill:#f00\n    class A,S1 hot\n    style S1 stroke:#00f\n';
    const out = roundtrip(src);
    expect(out).toContain('style S1 stroke:#00f');
    // Node and group ids share one grouped assignment, emitted exactly once.
    expect(out).toContain('class A,S1 hot');
    expect(out.match(/^\s*class /gm)!.length).toBe(1);
    expect(roundtrip(out)).toBe(out);
  });

  it('round-trips a subgraph style whose props ceasg does not model', () => {
    const src = 'flowchart TB\n    subgraph S1 [Pipeline]\n        A[Ingest]\n    end\n    style S1 fill:#f9f,rx:8\n';
    const out = roundtrip(src);
    expect(out).toContain('style S1 fill:#f9f,rx:8');
    expect(roundtrip(out)).toBe(out);
  });

  it('round-trips an empty subgraph that a style line targets', () => {
    const src = 'flowchart TB\n    subgraph S [Pipeline]\n    end\n    style S fill:#f00\n';
    const out = roundtrip(src);
    expect(out).toContain('subgraph S ["Pipeline"]');
    expect(out).toContain('end');
    expect(out).toContain('style S fill:#f00');
    expect(roundtrip(out)).toBe(out);
  });

  it('round-trips a forward reference into its canonical order', () => {
    const forward =
      'flowchart TB\n    S1 --> D[Report]\n    subgraph S1 [Pipeline]\n        A[Ingest] --> B[Transform]\n    end\n';
    const out = roundtrip(forward);
    expect(out).not.toContain('S1["S1"]');
    expect(roundtrip(out)).toBe(out);
  });
});

describe('bracket serialization comes from the registry', () => {
  it('every registered bracket form round-trips through the parser', () => {
    for (const def of ALL_SHAPES) {
      if (!def.bracket) { continue; }
      const src = `flowchart TD\n  ${def.bracket('A', 'Hi')}\n`;
      expect(mermaidToModel(src).model.nodes[0]?.shape, def.name).toBe(def.name);
    }
  });

  // The test above only exercises the parser: it would still pass even if the
  // serializer dropped every shape (as it did until this task), because it
  // never calls modelToMermaid. This test closes that gap by driving the
  // model -> text -> model loop: build a model containing a node of each
  // registered shape, serialize it, and check both that the emitted text is
  // exactly that shape's bracket form and that reparsing it recovers the
  // shape.
  it('every registered shape serializes to its bracket form and survives model -> text -> model', () => {
    const failures: string[] = [];
    for (const def of ALL_SHAPES) {
      if (!def.bracket) { continue; }
      const model = emptyModel('TD');
      model.nodes.push({ id: 'A', label: 'Hi', shape: def.name, x: 0, y: 0 });
      const out = modelToMermaid(model, { includePositions: false });
      const expectedDecl = def.bracket('A', '"Hi"');
      if (!out.includes(expectedDecl)) {
        failures.push(`${def.name}: expected declaration ${JSON.stringify(expectedDecl)} in output ${JSON.stringify(out)}`);
        continue;
      }
      const reparsedShape = mermaidToModel(out).model.nodes[0]?.shape;
      if (reparsedShape !== def.name) {
        failures.push(`${def.name}: round-tripped shape was ${JSON.stringify(reparsedShape)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

const rt = (src: string) => modelToMermaid(mermaidToModel(src).model);

describe('serialization fidelity', () => {
  it('keeps a bracket-authored node in bracket form', () => {
    expect(rt('flowchart TD\n  A[Process]\n')).toContain('A["Process"]');
  });

  it('keeps an attr-authored node in attr form', () => {
    const out = rt('flowchart TD\n  A@{ shape: rect, label: "Process" }\n');
    expect(out).toContain('A@{ shape: rect, label: "Process" }');
    expect(out).not.toContain('A["Process"]');
  });

  it('preserves @{} keys ceasg does not model', () => {
    const out = rt('flowchart TD\n  A@{ shape: rect, label: "P", pos: "t", constraint: "on" }\n');
    expect(out).toContain('pos: "t"');
    expect(out).toContain('constraint: "on"');
  });

  it('preserves an unrecognised shape name verbatim', () => {
    const out = rt('flowchart TD\n  A@{ shape: not-a-shape, label: "P" }\n');
    expect(out).toContain('shape: not-a-shape');
  });

  it('draws an unrecognised shape as a rect', () => {
    expect(mermaidToModel('flowchart TD\n  A@{ shape: not-a-shape }\n').model.nodes[0]?.shape)
      .toBe('rect');
  });

  it('promotes a bracket node to attr form when the new shape has no bracket', () => {
    const model = mermaidToModel('flowchart TD\n  A[Process]\n').model;
    setNodeShape(model.nodes[0]!, 'text');
    expect(model.nodes[0]!.syntax).toBe('attr');
    expect(modelToMermaid(model)).toContain('A@{ shape: text');
  });

  it('promotes a bracket node to attr form for an unregistered shape too', () => {
    // The registry lookup misses entirely here, which reaches the same branch
    // by a different route than a registered shape that simply has no bracket
    // form. Deliberately a name no shape will ever claim.
    const model = mermaidToModel('flowchart TD\n  A[Process]\n').model;
    setNodeShape(model.nodes[0]!, 'fake-bracketless');
    expect(model.nodes[0]!.syntax).toBe('attr');
  });

  it('never demotes an attr node back to bracket form', () => {
    const model = mermaidToModel('flowchart TD\n  A@{ shape: diam, label: "D" }\n').model;
    setNodeShape(model.nodes[0]!, 'rect');
    expect(modelToMermaid(model)).toContain('A@{ shape: rect');
  });

  it('drops a stale rawShape once a later declaration supplies a recognised shape', () => {
    const src =
      'flowchart TD\n  A@{ shape: not-a-shape, label: "x" }\n  A@{ shape: diam, label: "y" }\n';
    const out = rt(src);
    expect(out).toContain('shape: diam');
    expect(out).not.toContain('not-a-shape');
  });
});

describe('round-trip — formatted labels', () => {
  it('preserves a markdown node label including its backticks', () => {
    const src = 'flowchart LR\n    A["`**Bold** and _italic_`"]\n';
    const out = roundtrip(src);
    expect(out).toContain('"`**Bold** and _italic_`"');
    expect(roundtrip(out)).toBe(out);
  });
  it('preserves HTML markup and entities in a plain label', () => {
    const src = 'flowchart LR\n    B["Line 1<br/><b>Line 2</b> &amp; more"]\n';
    const out = roundtrip(src);
    expect(out).toContain('<b>Line 2</b>');
    expect(out).toContain('&amp;');
    expect(roundtrip(out)).toBe(out);
  });
  it('preserves a markdown edge label', () => {
    const out = roundtrip('flowchart LR\n    A -->|"`**yes**`"| B\n');
    expect(out).toContain('|"`**yes**`"|');
    expect(roundtrip(out)).toBe(out);
  });
  it('preserves a markdown subgraph title', () => {
    const out = roundtrip('flowchart LR\n    subgraph S["`**Group**`"]\n    A\n    end\n');
    expect(out).toContain('"`**Group**`"');
    expect(roundtrip(out)).toBe(out);
  });
  it('drops the backticks when the format is cleared', () => {
    const { model } = mermaidToModel('flowchart LR\nA["`**B**`"]\n');
    delete model.nodes[0]!.labelFormat;
    const out = modelToMermaid(model, { includePositions: false });
    expect(out).toContain('A["**B**"]');
    expect(out).not.toContain('`');
  });
});

describe('per-subgraph direction round-trip', () => {
  const src = [
    'flowchart TB',
    '    subgraph S',
    '        direction LR',
    '        A --> B',
    '    end',
    '    S --> C',
  ].join('\n');

  it('keeps the direction line inside the subgraph block', () => {
    const { model } = mermaidToModel(src);
    const out = modelToMermaid(model, { includePositions: false });
    const lines = out.split('\n').map((l) => l.trim());
    const open = lines.indexOf('subgraph S');
    const dir = lines.indexOf('direction LR');
    const end = lines.indexOf('end');
    expect(open).toBeGreaterThanOrEqual(0);
    expect(dir).toBeGreaterThan(open);
    expect(dir).toBeLessThan(end);
  });

  it('re-parses to the same direction', () => {
    const { model } = mermaidToModel(src);
    const { model: again } = mermaidToModel(modelToMermaid(model, { includePositions: false }));
    expect(again.groups.find((g) => g.id === 'S')?.direction).toBe('LR');
    expect(again.direction).toBe('TB');
  });

  it('emits no direction line for a subgraph that never had one', () => {
    const { model } = mermaidToModel('flowchart TB\n subgraph S\n  A-->B\n end\n');
    expect(modelToMermaid(model, { includePositions: false })).not.toContain('direction');
  });

  it('emits inheritDir in the init directive', () => {
    const { model } = mermaidToModel('flowchart TB\nA-->B\n');
    model.config.inheritDir = true;
    const out = modelToMermaid(model, { includePositions: false });
    expect(out).toContain('"inheritDir":true');
    const { model: again } = mermaidToModel(out);
    expect(again.config.inheritDir).toBe(true);
  });
});
