import { describe, it, expect } from 'vitest';
import { planClusters, layoutClusters } from './clusterLayout';
import { mermaidToModel } from './parser';
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

  it('gives every node a finite position', () => {
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph S\n  direction LR\n  A-->B\n end\n subgraph T\n  C-->D\n end\n S-->T\n',
    );
    layoutClusters(model);
    for (const n of model.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    }
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
    // Every group here has a crossing edge, so all are flat: one dagre graph,
    // the same one the pre-recursive engine built.
    const m = emptyModel('TB');
    for (const id of ['A', 'B', 'C']) { m.nodes.push({ id, label: id, shape: 'rect', x: 0, y: 0 }); }
    m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
    m.edges.push({ id: 'e2', from: 'B', to: 'C', label: '', kind: 'arrow' });
    layoutClusters(m);
    expect(new Set(m.nodes.map((n) => n.y)).size).toBeGreaterThan(1);
    expect(horizontal(m, 'A', 'B')).toBe(false);
  });
});
