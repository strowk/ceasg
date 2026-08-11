import { describe, it, expect } from 'vitest';
import { autoLayout, layoutMissing } from './layout';
import { emptyModel, groupBounds, nodeSize } from './model';
import { edgeLabelSize } from './nodeGeometry';
import { mermaidToModel } from './parser';
import { clearDiagnostics, setDiagnosticSink, type Diagnostic } from './diagnostics';

describe('autoLayout', () => {
  it('assigns finite non-overlapping positions to a chain', () => {
    const m = emptyModel();
    for (const id of ['A', 'B', 'C']) { m.nodes.push({ id, label: id, shape: 'rect', x: 0, y: 0 }); }
    m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
    m.edges.push({ id: 'e2', from: 'B', to: 'C', label: '', kind: 'arrow' });
    autoLayout(m);
    for (const n of m.nodes) { expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true); }
    const ys = m.nodes.map((n) => n.y);
    expect(new Set(ys).size).toBeGreaterThan(1); // TB layout ranks vertically
  });
  it('separates ranks enough for the edge label to fit between them', () => {
    // Mermaid hands dagre the edge label's box, so a labelled edge pushes its
    // endpoints apart. Without that the text is drawn over the nodes.
    const gap = (label: string) => {
      const m = emptyModel('LR');
      m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
      m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 });
      m.edges.push({ id: 'e1', from: 'A', to: 'B', label, kind: 'arrow' });
      autoLayout(m);
      const [a, b] = ['A', 'B'].map((id) => m.nodes.find((n) => n.id === id)!);
      const half = (n: typeof a) => nodeSize(m, n).w / 2;
      return b.x - half(b) - (a.x + half(a));
    };
    const bare = gap('');
    const short = gap('text');
    const long = gap('Long long long text');
    expect(short).toBeGreaterThan(bare);
    expect(long).toBeGreaterThan(short);
    // The label box itself has to fit in the gap it opened.
    expect(long - bare).toBeGreaterThanOrEqual(
      edgeLabelSize({ id: 'e1', from: 'A', to: 'B', label: 'Long long long text', kind: 'arrow' }).w,
    );
  });
  it('layoutMissing only places unplaced nodes', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 500, y: 500 });
    m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 });
    layoutMissing(m);
    expect(m.nodes.find((n) => n.id === 'A')).toMatchObject({ x: 500, y: 500 });
    const b = m.nodes.find((n) => n.id === 'B')!;
    expect(b.x === 0 && b.y === 0).toBe(false);
  });
});

describe('auto layout with nested groups', () => {
  it('re-fits stale stored group bounds into explicit boxes that nest after layout', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph outer\nsubgraph inner\nA-->B\nend\nend\n',
    );
    const outerGrp = model.groups.find((g) => g.id === 'outer')!;
    // Seed WRONG tiny stored bounds that would break nesting if not re-fitted.
    outerGrp.x = 0; outerGrp.y = 0; outerGrp.w = 1; outerGrp.h = 1;
    autoLayout(model);
    // Layout re-fits stored bounds to explicit values (not undefined) so boxes
    // stay put during later member drags — the 1x1 seed must be replaced.
    expect(outerGrp.w).toBeGreaterThan(1);
    expect(outerGrp.h).toBeGreaterThan(1);
    const outer = groupBounds(model, outerGrp);
    const inner = groupBounds(model, model.groups.find((g) => g.id === 'inner')!);
    // Re-fitted outer box fully encloses inner on all four edges.
    expect(outer.x).toBeLessThanOrEqual(inner.x);
    expect(outer.y).toBeLessThanOrEqual(inner.y);
    expect(outer.x + outer.w).toBeGreaterThanOrEqual(inner.x + inner.w);
    expect(outer.y + outer.h).toBeGreaterThanOrEqual(inner.y + inner.h);
  });
});

describe('auto layout with subgraph edge endpoints', () => {
  /** Collects diagnostics so a dagre throw (which autoLayout catches) is visible. */
  function captureDiagnostics(): Diagnostic[] {
    const seen: Diagnostic[] = [];
    clearDiagnostics();
    setDiagnosticSink((d) => { seen.push(d); });
    return seen;
  }

  it('ranks a node below a subgraph that points at it', () => {
    const diagnostics = captureDiagnostics();
    const m = emptyModel('TB');
    for (const id of ['A', 'B', 'D']) { m.nodes.push({ id, label: id, shape: 'rect', x: 0, y: 0 }); }
    m.groups.push({ id: 'S1', title: 'Pipeline', nodeIds: ['A', 'B'] });
    m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
    m.edges.push({ id: 'e2', from: 'S1', to: 'D', label: '', kind: 'arrow' });
    autoLayout(m);
    const y = (id: string) => m.nodes.find((n) => n.id === id)!.y;
    // Without the proxy D is an unconnected component and dagre puts it on rank 0
    // alongside A; the proxied edge pushes it below.
    expect(y('D')).toBeGreaterThan(y('A'));
    expect(diagnostics).toHaveLength(0);
  });

  it('skips an edge whose group has no descendant nodes', () => {
    const diagnostics = captureDiagnostics();
    const m = emptyModel('TB');
    m.nodes.push({ id: 'D', label: 'D', shape: 'rect', x: 0, y: 0 });
    m.groups.push({ id: 'S1', title: 'Empty', nodeIds: [] });
    m.edges.push({ id: 'e1', from: 'S1', to: 'D', label: '', kind: 'arrow' });
    autoLayout(m);
    const d = m.nodes.find((n) => n.id === 'D')!;
    expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
    expect(diagnostics).toHaveLength(0); // dagre ran; no fallback
  });

  it('skips an edge whose endpoints proxy to the same node', () => {
    const diagnostics = captureDiagnostics();
    const m = emptyModel('TB');
    m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
    m.groups.push({ id: 'S1', title: 'Pipeline', nodeIds: ['A'] });
    m.edges.push({ id: 'e1', from: 'S1', to: 'A', label: '', kind: 'arrow' });
    autoLayout(m);
    const a = m.nodes.find((n) => n.id === 'A')!;
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
    expect(diagnostics).toHaveLength(0);
  });
});
