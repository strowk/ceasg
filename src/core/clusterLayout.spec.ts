import { describe, it, expect } from 'vitest';
import * as dagre from '@dagrejs/dagre';
import type { EdgeLabel, GraphLabel, NodeLabel } from '@dagrejs/dagre';
import { planClusters, layoutClusters, layoutSubtree } from './clusterLayout';
import { mermaidToModel } from './parser';
import { emptyModel, groupBounds, groupDescendantNodeIds, nodeSize, type DiagramModel } from './model';
import { autoLayout } from './layout';
import { edgeLabelSize } from './nodeGeometry';

const at = (m: DiagramModel, id: string) => m.nodes.find((n) => n.id === id)!;
/** True when the two nodes are laid out along x rather than y. */
const horizontal = (m: DiagramModel, a: string, b: string) =>
  Math.abs(at(m, a).x - at(m, b).x) > Math.abs(at(m, a).y - at(m, b).y);

/**
 * An independent oracle for "what does a single compound dagre graph produce",
 * built directly against dagre rather than through clusterLayout or autoLayout.
 * Used only to pin the all-flat invariant below without relying on either of
 * those sharing the code that made the comparison meaningful before Task 5.
 */
function singleGraphDagreLayout(model: DiagramModel): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({ compound: true });
  g.setGraph({
    rankdir: model.direction,
    nodesep: model.config.nodeSpacing ?? 50,
    ranksep: model.config.rankSpacing ?? 50,
    marginx: 60,
    marginy: 60,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeIds = new Set(model.nodes.map((n) => n.id));
  for (const node of model.nodes) {
    const s = nodeSize(model, node);
    g.setNode(node.id, { width: s.w, height: s.h });
  }
  const groupIds = new Set(model.groups.map((gr) => gr.id));
  for (const grp of model.groups) {
    if (nodeIds.has(grp.id)) continue;
    g.setNode(grp.id, { width: 0, height: 0 });
  }
  for (const grp of model.groups) {
    if (nodeIds.has(grp.id)) continue;
    if (grp.parentId && groupIds.has(grp.parentId)) g.setParent(grp.id, grp.parentId);
    for (const id of grp.nodeIds) if (nodeIds.has(id)) g.setParent(id, grp.id);
  }
  const rankProxy = (id: string): string | undefined => {
    if (nodeIds.has(id)) return id;
    if (!groupIds.has(id)) return undefined;
    return groupDescendantNodeIds(model, id).find((n) => nodeIds.has(n));
  };
  for (const e of model.edges) {
    if (e.from === e.to) continue;
    const from = rankProxy(e.from);
    const to = rankProxy(e.to);
    if (from === undefined || to === undefined || from === to) continue;
    const label = edgeLabelSize(e);
    const prev = g.edge(from, to);
    g.setEdge(from, to, {
      width: Math.max(label.w, prev?.width ?? 0),
      height: Math.max(label.h, prev?.height ?? 0),
      labelpos: 'c',
    });
  }
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  for (const node of model.nodes) {
    const p = g.node(node.id);
    // Round exactly as layoutClusters/layoutContainer do, so the two are
    // comparable to the pixel rather than off by dagre's float remainder.
    out.set(node.id, {
      x: Math.max(40, Math.round(p!.x)),
      y: Math.max(30, Math.round(p!.y)),
    });
  }
  return out;
}

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

  it('matches a single-graph dagre layout when no subgraph collapses', () => {
    // Every group here has a crossing edge, so all are flat: layoutClusters
    // builds one dagre graph holding every node, exactly like a plain
    // compound-cluster dagre layout would.
    //
    // Originally (Task 4) this compared layoutClusters against autoLayout's
    // separate pre-recursive engine. Task 5 deleted that engine and routed
    // autoLayout through layoutClusters itself, which would make that
    // comparison a tautology (same function, called twice). This now compares
    // against `singleGraphDagreLayout` above — an oracle built directly on
    // dagre, independent of both layoutClusters and autoLayout — so the
    // invariant it pins (an all-flat diagram is laid out exactly as one
    // compound dagre graph would place it) stays meaningful.
    const src =
      'flowchart LR\n subgraph S\n  subgraph T\n   A-->B\n  end\n  X-->A\n end\n B-->C\n S-->D\n';
    const { model } = mermaidToModel(src);
    for (const g of planClusters(model).values()) {
      expect(g.branch).toBe('flat'); // precondition: nothing collapses here
    }
    const oracle = singleGraphDagreLayout(model);
    layoutClusters(model);

    expect(model.nodes.length).toBeGreaterThan(3);
    // Up to one uniform translation: layoutClusters places the origin so the
    // outermost subgraph *box* clears the margin, where the raw dagre graph
    // only clears the nodes.
    const first = at(model, 'A');
    const dx = first.x - oracle.get('A')!.x;
    const dy = first.y - oracle.get('A')!.y;
    for (const n of model.nodes) {
      const o = oracle.get(n.id)!;
      expect(n.x - o.x).toBe(dx);
      expect(n.y - o.y).toBe(dy);
    }
    // A translation, not a collapse to a point: the layout is still spread out.
    expect(new Set(model.nodes.map((n) => n.x)).size).toBeGreaterThan(1);
  });

  it('lays out a chain with no groups exactly as a plain dagre layout does', () => {
    const m = emptyModel('TB');
    for (const id of ['A', 'B', 'C']) { m.nodes.push({ id, label: id, shape: 'rect', x: 0, y: 0 }); }
    m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
    m.edges.push({ id: 'e2', from: 'B', to: 'C', label: '', kind: 'arrow' });
    const oracle = singleGraphDagreLayout(m);
    layoutClusters(m);
    expect(new Set(m.nodes.map((n) => n.y)).size).toBeGreaterThan(1);
    expect(horizontal(m, 'A', 'B')).toBe(false);
    // With no group boxes to clear, even the origin matches.
    for (const n of m.nodes) {
      expect([n.x, n.y]).toEqual([oracle.get(n.id)!.x, oracle.get(n.id)!.y]);
    }
  });
});

describe('layoutSubtree', () => {
  /**
   * O ⊃ { S ⊃ {A,B,G,H}, C, D, E } with F outside — the nested case. S is flat
   * (B-->E crosses out) and so lays out TB, tall and narrow; giving it LR turns
   * it wide and short, and its ancestor O has to grow to keep enclosing it.
   * autoLayout() first, so every box is frozen exactly as it is after a load.
   */
  function nested(): DiagramModel {
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph O\n  subgraph S\n   A-->B-->G-->H\n  end\n  B-->E\n  C-->D\n end\n F-->C\n',
    );
    autoLayout(model);
    return model;
  }
  const box = (m: DiagramModel, id: string) =>
    groupBounds(m, m.groups.find((g) => g.id === id)!);

  it('re-fits every ancestor box around a nested subgraph that changed direction', () => {
    const model = nested();
    model.groups.find((g) => g.id === 'S')!.direction = 'LR';
    layoutSubtree(model, 'S');

    // Collected rather than asserted one by one, so a failure names the box.
    const escaped: string[] = [];
    for (const g of model.groups) {
      const b = box(model, g.id);
      const holds = (what: string, x: number, y: number, w: number, h: number) => {
        if (x < b.x || y < b.y || x + w > b.x + b.w || y + h > b.y + b.h) {
          escaped.push(`${what} [${x},${y},${w},${h}] escapes ${g.id} [${b.x},${b.y},${b.w},${b.h}]`);
        }
      };
      for (const id of groupDescendantNodeIds(model, g.id)) {
        const n = at(model, id);
        const s = nodeSize(model, n);
        holds(`node ${id}`, n.x - s.w / 2, n.y - s.h / 2, s.w, s.h);
      }
      for (const child of model.groups.filter((c) => c.parentId === g.id)) {
        const cb = box(model, child.id);
        holds(`group ${child.id}`, cb.x, cb.y, cb.w, cb.h);
      }
    }
    expect(escaped).toEqual([]);
  });

  it('anchors the changed group and moves nothing outside its subtree', () => {
    const model = nested();
    const before = new Map(model.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const sBefore = box(model, 'S');
    model.groups.find((g) => g.id === 'S')!.direction = 'LR';
    layoutSubtree(model, 'S');

    // Re-fitting an ancestor resizes a box; it must never move a node.
    const inside = new Set(groupDescendantNodeIds(model, 'S'));
    for (const n of model.nodes) {
      if (inside.has(n.id)) continue;
      expect([n.id, n.x, n.y]).toEqual([n.id, before.get(n.id)!.x, before.get(n.id)!.y]);
    }
    const sAfter = box(model, 'S');
    expect([sAfter.x, sAfter.y]).toEqual([sBefore.x, sBefore.y]);
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
    // The parser seeds every node at 0,0, so "finite" alone would also hold for
    // a layout that placed nothing at all.
    expect(model.nodes.every((n) => n.x === 0 && n.y === 0)).toBe(true);
    // Both groups are containers and neither is reachable from the root, so no
    // container claims any node. That must surface as a controlled error (not a
    // stack overflow, and not a silent no-op) so autoLayout's fallback engages.
    expect(() => { layoutClusters(model); }).toThrow(/no position/);
    expect(() => { autoLayout(model); }).not.toThrow();
    for (const n of model.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    }
    // Actually placed by the fallback: spread out, not all stacked at 0,0.
    expect(model.nodes.some((n) => n.x !== 0 || n.y !== 0)).toBe(true);
    const seen = new Set(model.nodes.map((n) => `${n.x},${n.y}`));
    expect(seen.size).toBe(model.nodes.length);
  });

  it('re-lays a subtree without hanging on a parentId cycle', () => {
    // layoutSubtree reaches groupBounds() and materializeGroupBounds() in
    // model.ts, which walk the group tree themselves. An unguarded cycle there
    // overflows the stack (groupBounds) or spins forever (groupTreeDepth), and
    // ANY cyclic group in the model triggers it, not just the one passed in.
    // The explicit timeout is the "does not hang" half of the assertion.
    const { model } = mermaidToModel(
      'flowchart TB\n subgraph G1\n  A-->B\n end\n subgraph G2\n  C-->D\n end\n',
    );
    model.groups.find((g) => g.id === 'G1')!.parentId = 'G2';
    model.groups.find((g) => g.id === 'G2')!.parentId = 'G1';
    expect(() => { layoutSubtree(model, 'G1'); }).not.toThrow();
    for (const n of model.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    }
  }, 5000);

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
