import { describe, it, expect } from 'vitest';
import { planClusters, layoutClusters } from './clusterLayout';
import { mermaidToModel } from './parser';
import { autoLayout } from './layout';
import { emptyModel, nodeSize, type DiagramModel } from './model';

const at = (m: DiagramModel, id: string) => m.nodes.find((n) => n.id === id)!;
/** True when the two nodes are laid out along x rather than y. */
const horizontal = (m: DiagramModel, a: string, b: string) =>
  Math.abs(at(m, a).x - at(m, b).x) > Math.abs(at(m, a).y - at(m, b).y);

describe('planClusters', () => {
  it('collapses a subgraph with an explicit direction even when an edge crosses out', () => {
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph S\n  direction LR\n  A-->B\n end\n B-->C\n',
    );
    const plan = planClusters(model).get('S')!;
    expect(plan.branch).toBe('collapse');
    expect(plan.rankdir).toBe('LR');
  });

  it('collapses a self-contained subgraph perpendicular to its parent', () => {
    const { model } = mermaidToModel('flowchart TB\n subgraph S\n  A-->B\n end\n C-->D\n');
    const plan = planClusters(model).get('S')!;
    expect(plan.branch).toBe('collapse');
    expect(plan.rankdir).toBe('LR'); // TB flips to LR
  });

  it('flips anything that is not TB to TB', () => {
    const { model } = mermaidToModel('flowchart LR\n subgraph S\n  A-->B\n end\n C-->D\n');
    expect(planClusters(model).get('S')!.rankdir).toBe('TB');
  });

  it('leaves a subgraph with a crossing edge flat on the parent rankdir', () => {
    const { model } = mermaidToModel('flowchart TB\n subgraph S\n  A-->B\n end\n B-->C\n');
    const plan = planClusters(model).get('S')!;
    expect(plan.branch).toBe('flat');
    expect(plan.rankdir).toBe('TB');
  });

  it('counts an edge naming the subgraph id as a crossing edge', () => {
    const { model } = mermaidToModel('flowchart TB\n subgraph S\n  A-->B\n end\n S-->C\n');
    expect(planClusters(model).get('S')!.branch).toBe('flat');
  });

  it('honours inheritDir instead of flipping', () => {
    const { model } = mermaidToModel(
      '%%{init: {"flowchart": {"inheritDir": true}}}%%\nflowchart TB\n subgraph S\n  A-->B\n end\n C-->D\n',
    );
    expect(planClusters(model).get('S')!.rankdir).toBe('TB');
  });

  it('resolves a nested flip against the nearest collapsed ancestor', () => {
    // Outer is explicit LR; Inner is self-contained, so it flips off LR to TB.
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph Outer\n  direction LR\n  subgraph Inner\n   A-->B\n  end\n end\n',
    );
    expect(planClusters(model).get('Inner')!.rankdir).toBe('TB');
  });
});

describe('layoutClusters', () => {
  it('lays an explicit-LR subgraph out horizontally inside a TB diagram', () => {
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph S\n  direction LR\n  A-->B\n end\n B-->C\n',
    );
    layoutClusters(model);
    expect(horizontal(model, 'A', 'B')).toBe(true);  // inside S: left-to-right
    expect(horizontal(model, 'B', 'C')).toBe(false); // outside S: top-down
  });

  it('gives every node a real, distinct position', () => {
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph S\n  direction LR\n  A-->B\n end\n subgraph T\n  C-->D\n end\n S-->T\n',
    );
    // The parser seeds every node at 0,0 — "finite" alone would also hold for a
    // no-op, so assert the engine actually placed them somewhere distinct.
    expect(model.nodes.every((n) => n.x === 0 && n.y === 0)).toBe(true);
    layoutClusters(model);
    for (const n of model.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBeGreaterThan(0);
      expect(n.y).toBeGreaterThan(0);
    }
    const seen = new Set(model.nodes.map((n) => `${n.x},${n.y}`));
    expect(seen.size).toBe(model.nodes.length); // no two nodes stacked
  });

  it('does not let a collapsed subgraph overlap a sibling node', () => {
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph S\n  direction LR\n  A-->B\n end\n S-->C\n',
    );
    layoutClusters(model);
    const c = at(model, 'C');
    const cs = nodeSize(model, c);
    for (const id of ['A', 'B']) {
      const n = at(model, id);
      const ns = nodeSize(model, n);
      const clear =
        Math.abs(n.x - c.x) >= (ns.w + cs.w) / 2 || Math.abs(n.y - c.y) >= (ns.h + cs.h) / 2;
      expect(clear).toBe(true);
    }
  });

  it('matches the flat engine when no subgraph collapses', () => {
    // Every group here has a crossing edge, so all are flat: layoutClusters
    // builds one dagre graph holding every node — the same graph autoLayout's
    // pre-recursive engine builds. The arrangement must therefore be identical,
    // up to one uniform translation: layoutClusters places the origin so the
    // outermost subgraph *box* clears the margin, where the flat engine only
    // cleared the nodes.
    //
    // NOTE: Task 5 reroutes autoLayout onto layoutClusters and deletes
    // dagreLayout, at which point this comparison becomes a tautology. If this
    // test has to change then, tell the reviewer of Task 5 why: the invariant it
    // pins is that an all-flat diagram is untouched by the recursive engine.
    const src =
      'flowchart LR\n subgraph S\n  subgraph T\n   A-->B\n  end\n  X-->A\n end\n B-->C\n S-->D\n';
    const mine = mermaidToModel(src).model;
    const flat = mermaidToModel(src).model;
    for (const g of planClusters(mine).values()) {
      expect(g.branch).toBe('flat'); // precondition: nothing collapses here
    }
    layoutClusters(mine);
    autoLayout(flat);

    expect(mine.nodes.length).toBeGreaterThan(3);
    const first = at(mine, 'A');
    const dx = first.x - at(flat, 'A').x;
    const dy = first.y - at(flat, 'A').y;
    for (const n of mine.nodes) {
      const o = at(flat, n.id);
      expect(n.x - o.x).toBe(dx);
      expect(n.y - o.y).toBe(dy);
    }
    // A translation, not a collapse to a point: the layout is still spread out.
    expect(new Set(mine.nodes.map((n) => n.x)).size).toBeGreaterThan(1);
  });

  it('lays out a chain with no groups exactly as the flat engine does', () => {
    const build = () => {
      const m = emptyModel('TB');
      for (const id of ['A', 'B', 'C']) { m.nodes.push({ id, label: id, shape: 'rect', x: 0, y: 0 }); }
      m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
      m.edges.push({ id: 'e2', from: 'B', to: 'C', label: '', kind: 'arrow' });
      return m;
    };
    const mine = build();
    const flat = build();
    layoutClusters(mine);
    autoLayout(flat);
    expect(new Set(mine.nodes.map((n) => n.y)).size).toBeGreaterThan(1);
    expect(horizontal(mine, 'A', 'B')).toBe(false);
    // With no group boxes to clear, even the origin matches.
    for (const n of mine.nodes) {
      expect([n.x, n.y]).toEqual([at(flat, n.id).x, at(flat, n.id).y]);
    }
  });
});

describe('malformed input', () => {
  it('survives a parentId cycle', () => {
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph G1\n  A-->B\n end\n subgraph G2\n  C-->D\n end\n',
    );
    // Not reachable through the parser, but assignGroupToParent is not the only
    // way a model is built (undo state, hand-edited JSON), and an unguarded
    // recursion overflows the stack rather than degrading.
    model.groups.find((g) => g.id === 'G1')!.parentId = 'G2';
    model.groups.find((g) => g.id === 'G2')!.parentId = 'G1';

    const plans = planClusters(model);
    expect(plans.has('G1')).toBe(true);
    expect(plans.has('G2')).toBe(true);
    expect(() => { layoutClusters(model); }).not.toThrow();
    for (const n of model.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    }
  });

  it('leaves an empty subgraph flat even with an explicit direction', () => {
    // Mermaid gates both collapse branches on the cluster having children
    // (mermaid-graphlib.js:367, :410), so an empty subgraph is never extracted.
    // The parser keeps one that carries a direction line, so it reaches layout.
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph S\n  direction LR\n end\n A-->B\n',
    );
    expect(model.groups.map((g) => g.id)).toContain('S');
    expect(planClusters(model).get('S')!.branch).toBe('flat');
    layoutClusters(model);
    // No dead box reserved: the two nodes lay out as if S were not there.
    const bare = mermaidToModel('flowchart TB\n A-->B\n').model;
    layoutClusters(bare);
    for (const n of model.nodes) {
      expect([n.x, n.y]).toEqual([at(bare, n.id).x, at(bare, n.id).y]);
    }
  });
});
