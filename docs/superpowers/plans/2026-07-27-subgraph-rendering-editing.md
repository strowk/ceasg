# Subgraph Rendering & Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Mermaid flowchart `subgraph` containers in the custom WYSIWYG renderer and make them fully editable (create from selection, drag, node in/out, rename, ungroup, resize, nesting) with lossless round-trip.

**Architecture:** Groups become a tree via a `parentId` pointer, with explicit optional `x/y/w/h` bounds that fall back to a live-derived box wrapping members when unset. Rendering adds a group layer behind edges/nodes; interaction adds group hit-testing, group-drag, membership-on-drop, reparent-on-drop, and resize. Parser/serializer gain nesting + a `gpos` geometry comment for round-trip.

**Tech Stack:** TypeScript, dagre (`@dagrejs/dagre`), SVG DOM, vitest (unit, jsdom), esbuild, `@vscode/vsce` (packaging). Package manager: **pnpm**.

## Global Constraints

- Package manager is **pnpm**; run unit tests with `pnpm run test:unit` (vitest).
- Type-check with `pnpm run check-types` (checks both `tsconfig.json` and `tsconfig.webview.json`); lint with `pnpm run lint`.
- Core files under `src/core/` carry a GPL-3.0 port header — do not remove it; new code in those files follows existing style (tabs in `src/core`, 2-space in `src/webview`).
- Round-trip must stay lossless: `parentId` round-trips structurally via nested `subgraph` blocks; only `x/y/w/h` are persisted, via a `%% mermaid-flow:gpos …` comment, guarded by `includePositions`.
- `groupBounds(model, group)` is the single geometry accessor: returns stored bounds when all of `x/y/w/h` are set, else derives live from members + child groups. Render, hit-test, and layout all read through it. Never eagerly derive bounds in the parser.
- Node membership changes only on pointer-up (drag end), never mid-drag.
- Constants: `GROUP_PAD = 20` (padding around members), `GROUP_TITLE_H = 24` (title band reserved at top of the box).

---

## Task 1: Model — group tree, bounds accessor, helpers

**Files:**
- Modify: `src/core/model.ts`
- Test: `src/core/model.spec.ts` (append to existing describe blocks)

**Interfaces:**
- Consumes: existing `DiagramModel`, `DiagramGroup`, `DiagramNode`, `estimateNodeSize` (from `./nodeGeometry`), existing `assignNodeToGroup`, `newGroupId`.
- Produces:
  - `DiagramGroup` gains `parentId?: string; x?: number; y?: number; w?: number; h?: number`.
  - `export const GROUP_PAD = 20;` and `export const GROUP_TITLE_H = 24;`
  - `groupChildren(model: DiagramModel, id: string): DiagramGroup[]`
  - `groupBounds(model: DiagramModel, group: DiagramGroup): { x: number; y: number; w: number; h: number }` — returns centre-agnostic top-left box.
  - `assignGroupToParent(model: DiagramModel, groupId: string, parentId: string | null): void` (cycle-guarded)
  - `groupDescendantNodeIds(model: DiagramModel, id: string): string[]`
  - `translateGroup(model: DiagramModel, id: string, dx: number, dy: number): void`
  - `removeGroup` extended to reparent children/members.

- [ ] **Step 1: Write failing tests**

Add to `src/core/model.spec.ts`:

```ts
import {
  emptyModel, groupChildren, groupBounds, assignGroupToParent,
  groupDescendantNodeIds, translateGroup, removeGroup, GROUP_PAD,
} from './model';

function nodeAt(id: string, x: number, y: number) {
  return { id, label: id, shape: 'rect' as const, x, y, w: 80, h: 40 };
}

describe('group tree helpers', () => {
  it('groupBounds derives a box wrapping members plus padding', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100), nodeAt('B', 300, 100));
    m.groups.push({ id: 'g1', title: 'g1', nodeIds: ['A', 'B'] });
    const b = groupBounds(m, m.groups[0]);
    // members span x:[60,340] y:[80,120]; pad GROUP_PAD each side, title band on top
    expect(b.x).toBe(60 - GROUP_PAD);
    expect(b.y).toBeLessThan(80 - GROUP_PAD); // extra title band above
    expect(b.x + b.w).toBe(340 + GROUP_PAD);
  });

  it('groupBounds returns stored bounds when all set', () => {
    const m = emptyModel('TB');
    m.groups.push({ id: 'g1', title: 'g1', nodeIds: [], x: 5, y: 6, w: 7, h: 8 });
    expect(groupBounds(m, m.groups[0])).toEqual({ x: 5, y: 6, w: 7, h: 8 });
  });

  it('groupBounds wraps nested child group boxes', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100));
    m.groups.push({ id: 'outer', title: 'outer', nodeIds: [] });
    m.groups.push({ id: 'inner', title: 'inner', nodeIds: ['A'], parentId: 'outer' });
    const outer = groupBounds(m, m.groups[0]);
    const inner = groupBounds(m, m.groups[1]);
    expect(outer.x).toBeLessThanOrEqual(inner.x);
    expect(outer.x + outer.w).toBeGreaterThanOrEqual(inner.x + inner.w);
  });

  it('groupChildren returns direct child groups only', () => {
    const m = emptyModel('TB');
    m.groups.push({ id: 'outer', title: 'o', nodeIds: [] });
    m.groups.push({ id: 'inner', title: 'i', nodeIds: [], parentId: 'outer' });
    expect(groupChildren(m, 'outer').map((g) => g.id)).toEqual(['inner']);
  });

  it('assignGroupToParent refuses to create a cycle', () => {
    const m = emptyModel('TB');
    m.groups.push({ id: 'a', title: 'a', nodeIds: [] });
    m.groups.push({ id: 'b', title: 'b', nodeIds: [], parentId: 'a' });
    assignGroupToParent(m, 'a', 'b'); // would make a a child of its own descendant
    expect(m.groups.find((g) => g.id === 'a')!.parentId).toBeUndefined();
  });

  it('groupDescendantNodeIds gathers members across nesting', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 0, 0), nodeAt('B', 0, 0));
    m.groups.push({ id: 'outer', title: 'o', nodeIds: ['A'] });
    m.groups.push({ id: 'inner', title: 'i', nodeIds: ['B'], parentId: 'outer' });
    expect(groupDescendantNodeIds(m, 'outer').sort()).toEqual(['A', 'B']);
  });

  it('translateGroup moves members, descendant members and stored bounds', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 100, 100), nodeAt('B', 200, 100));
    m.groups.push({ id: 'outer', title: 'o', nodeIds: ['A'], x: 50, y: 50, w: 300, h: 200 });
    m.groups.push({ id: 'inner', title: 'i', nodeIds: ['B'], parentId: 'outer', x: 120, y: 60, w: 100, h: 80 });
    translateGroup(m, 'outer', 10, 20);
    expect(m.nodes.find((n) => n.id === 'A')!.x).toBe(110);
    expect(m.nodes.find((n) => n.id === 'B')!.x).toBe(210);
    expect(m.groups.find((g) => g.id === 'outer')!.x).toBe(60);
    expect(m.groups.find((g) => g.id === 'inner')!.x).toBe(130);
  });

  it('removeGroup reparents child groups and members to parent', () => {
    const m = emptyModel('TB');
    m.nodes.push(nodeAt('A', 0, 0));
    m.groups.push({ id: 'outer', title: 'o', nodeIds: [] });
    m.groups.push({ id: 'inner', title: 'i', nodeIds: ['A'], parentId: 'outer' });
    m.groups.push({ id: 'leaf', title: 'l', nodeIds: [], parentId: 'inner' });
    removeGroup(m, 'inner');
    expect(m.groups.find((g) => g.id === 'inner')).toBeUndefined();
    expect(m.groups.find((g) => g.id === 'leaf')!.parentId).toBe('outer');
    // member A had innermost 'inner'; after ungroup it belongs to outer
    expect(m.groups.find((g) => g.id === 'outer')!.nodeIds).toContain('A');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:unit -- model.spec`
Expected: FAIL (helpers not defined / removeGroup signature mismatch).

- [ ] **Step 3: Implement**

In `src/core/model.ts`, extend the interface and add helpers. Add near the top imports:

```ts
import { estimateNodeSize } from "./nodeGeometry";
```

Extend `DiagramGroup`:

```ts
export interface DiagramGroup {
	id: string;
	title: string;
	nodeIds: string[];
	/** Enclosing group id for nesting; undefined = top-level. */
	parentId?: string;
	/** Explicit box (top-left origin). Undefined → derived from members. */
	x?: number;
	y?: number;
	w?: number;
	h?: number;
}

export const GROUP_PAD = 20;
export const GROUP_TITLE_H = 24;
```

Add helpers (place after the existing group helpers such as `assignNodeToGroup`):

```ts
export function groupChildren(
	model: DiagramModel,
	id: string,
): DiagramGroup[] {
	return model.groups.filter((g) => g.parentId === id);
}

/** Top-left box for a group: stored bounds when set, else derived from members. */
export function groupBounds(
	model: DiagramModel,
	group: DiagramGroup,
): { x: number; y: number; w: number; h: number } {
	if (
		group.x !== undefined &&
		group.y !== undefined &&
		group.w !== undefined &&
		group.h !== undefined
	) {
		return { x: group.x, y: group.y, w: group.w, h: group.h };
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	const add = (x: number, y: number, w: number, h: number) => {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x + w);
		maxY = Math.max(maxY, y + h);
	};
	for (const id of group.nodeIds) {
		const n = findNode(model, id);
		if (!n) continue;
		const s = estimateNodeSize(n);
		add(n.x - s.w / 2, n.y - s.h / 2, s.w, s.h);
	}
	for (const child of groupChildren(model, group.id)) {
		const b = groupBounds(model, child);
		add(b.x, b.y, b.w, b.h);
	}
	if (!Number.isFinite(minX)) {
		// Empty group with no stored bounds: a small default box.
		return { x: 0, y: 0, w: 120, h: 80 };
	}
	return {
		x: minX - GROUP_PAD,
		y: minY - GROUP_PAD - GROUP_TITLE_H,
		w: maxX - minX + GROUP_PAD * 2,
		h: maxY - minY + GROUP_PAD * 2 + GROUP_TITLE_H,
	};
}

/** True if `maybeAncestor` is `id` or an ancestor of `id` in the group tree. */
function isGroupAncestor(
	model: DiagramModel,
	maybeAncestor: string,
	id: string,
): boolean {
	let cur: string | undefined = id;
	while (cur) {
		if (cur === maybeAncestor) return true;
		cur = model.groups.find((g) => g.id === cur)?.parentId;
	}
	return false;
}

export function assignGroupToParent(
	model: DiagramModel,
	groupId: string,
	parentId: string | null,
): void {
	const group = model.groups.find((g) => g.id === groupId);
	if (!group) return;
	if (parentId === null) {
		group.parentId = undefined;
		return;
	}
	if (parentId === groupId) return;
	// Refuse cycles: a group cannot become a child of its own descendant.
	if (isGroupAncestor(model, groupId, parentId)) return;
	group.parentId = parentId;
}

export function groupDescendantNodeIds(
	model: DiagramModel,
	id: string,
): string[] {
	const out: string[] = [];
	const group = model.groups.find((g) => g.id === id);
	if (!group) return out;
	out.push(...group.nodeIds);
	for (const child of groupChildren(model, id)) {
		out.push(...groupDescendantNodeIds(model, child.id));
	}
	return out;
}

export function translateGroup(
	model: DiagramModel,
	id: string,
	dx: number,
	dy: number,
): void {
	const group = model.groups.find((g) => g.id === id);
	if (!group) return;
	// Move this group's stored bounds and every descendant group's stored bounds.
	const shiftGroup = (g: DiagramGroup) => {
		if (g.x !== undefined) g.x += dx;
		if (g.y !== undefined) g.y += dy;
		for (const child of groupChildren(model, g.id)) shiftGroup(child);
	};
	shiftGroup(group);
	// Move every descendant member node.
	for (const nid of groupDescendantNodeIds(model, id)) {
		const n = findNode(model, nid);
		if (n && !n.locked) {
			n.x += dx;
			n.y += dy;
		}
	}
}
```

Replace the existing `removeGroup` with the reparenting version:

```ts
/** Delete a group but keep its contents: reparent child groups and member
 *  nodes to this group's parent (top-level when it had none). */
export function removeGroup(model: DiagramModel, groupId: string): void {
	const group = model.groups.find((g) => g.id === groupId);
	if (!group) return;
	const newParent = group.parentId;
	for (const child of groupChildren(model, groupId)) {
		child.parentId = newParent;
	}
	// Member nodes fall to the parent group (or become ungrouped at top-level).
	if (newParent) {
		const parent = model.groups.find((g) => g.id === newParent);
		if (parent) {
			for (const nid of group.nodeIds) {
				if (!parent.nodeIds.includes(nid)) parent.nodeIds.push(nid);
			}
		}
	}
	model.groups = model.groups.filter((g) => g.id !== groupId);
}
```

Update `cloneModel`'s group mapping to copy the new fields:

```ts
		groups: model.groups.map((g) => ({
			id: g.id,
			title: g.title,
			nodeIds: [...g.nodeIds],
			parentId: g.parentId,
			x: g.x,
			y: g.y,
			w: g.w,
			h: g.h,
		})),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:unit -- model.spec` → Expected: PASS. Then `pnpm run check-types` → Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/model.ts src/core/model.spec.ts
git commit -m "feat(model): group tree with parentId, bounds accessor, nesting helpers"
```

---

## Task 2: Parser — nested parentId, gpos comment, no eager derivation

**Files:**
- Modify: `src/core/parser.ts`
- Test: `src/core/parser.spec.ts` (append)

**Interfaces:**
- Consumes: `DiagramGroup` (now with `parentId`, bounds) from Task 1.
- Produces: parser sets `group.parentId` for nested subgraphs and parses a `%% mermaid-flow:gpos id=x,y,w,h …` comment into each group's stored bounds. No behaviour change to member assignment.

- [ ] **Step 1: Write failing tests**

Append to `src/core/parser.spec.ts`:

```ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:unit -- parser.spec` → Expected: FAIL (parentId undefined for inner; bounds not parsed).

- [ ] **Step 3: Implement**

In `src/core/parser.ts`:

1. Add a group-position regex next to `POS_RE`:

```ts
const GPOS_RE = /^\s*%%\s*mermaid-flow:gpos\s+(.*)$/i;
```

2. In `openGroup`, set the parent from the current stack top. Change the tail of `openGroup` (where the group is pushed) to:

```ts
		const parent = groupStack[groupStack.length - 1];
		const group: DiagramGroup = { id, title, nodeIds: [] };
		if (parent) group.parentId = parent.id;
		model.groups.push(group);
		groupStack.push(group);
```

3. Parse the gpos comment. In the main line loop, right after the `POS_RE` block (the `if (posMatch …)` block), add:

```ts
			// Our own group-geometry hint comment.
			const gposMatch = line.match(GPOS_RE);
			if (gposMatch && gposMatch[1] !== undefined) {
				for (const part of gposMatch[1].split(/\s+/)) {
					const m = part.match(
						/^([A-Za-z0-9_]+)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/,
					);
					if (m) {
						groupPosHints.set(m[1]!, {
							x: parseFloat(m[2]!),
							y: parseFloat(m[3]!),
							w: parseFloat(m[4]!),
							h: parseFloat(m[5]!),
						});
					}
				}
				continue;
			}
```

4. Declare the hint map near the other maps at the top of `mermaidToModel`:

```ts
	const groupPosHints = new Map<
		string,
		{ x: number; y: number; w: number; h: number }
	>();
```

5. Apply the hints after the "Drop groups that ended up empty" filter (before the return), so surviving groups get their stored bounds:

```ts
	for (const group of model.groups) {
		const hint = groupPosHints.get(group.id);
		if (hint) {
			group.x = hint.x;
			group.y = hint.y;
			group.w = hint.w;
			group.h = hint.h;
		}
	}
```

Note: the existing "Drop groups that ended up empty" filter removes groups with no member nodes. A nested group that only contains child groups (no direct nodes) would be dropped. Change that filter to keep groups that have child groups too:

```ts
	// Drop groups with no members AND no child groups.
	const parents = new Set(
		model.groups.map((g) => g.parentId).filter((p): p is string => !!p),
	);
	model.groups = model.groups.filter(
		(g) => g.nodeIds.length > 0 || parents.has(g.id),
	);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:unit -- parser.spec` → PASS. `pnpm run check-types` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/parser.ts src/core/parser.spec.ts
git commit -m "feat(parser): nested subgraph parentId and gpos geometry comment"
```

---

## Task 3: Serializer — recursive nested emit + gpos comment

**Files:**
- Modify: `src/core/serializer.ts`
- Test: `src/core/roundtrip.spec.ts` (append)

**Interfaces:**
- Consumes: `groupChildren`, `groupBounds` from Task 1; parser output from Task 2.
- Produces: `modelToMermaid` emits nested `subgraph` blocks (tree walk) and, when `includePositions`, a `%% mermaid-flow:gpos …` line covering all groups.

- [ ] **Step 1: Write failing tests**

Append to `src/core/roundtrip.spec.ts`:

```ts
describe('nested subgraph round-trip', () => {
  it('preserves nesting structure across a round trip', () => {
    const src =
      'flowchart TB\nsubgraph outer\nsubgraph inner\nA[Alpha] --> B[Beta]\nend\nC[Gamma]\nend\n';
    const out = roundtrip(src);
    // inner subgraph appears before its end, nested inside outer
    expect(out).toMatch(/subgraph outer[\s\S]*subgraph inner[\s\S]*end[\s\S]*end/);
    expect(out).toContain('Gamma');
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:unit -- roundtrip.spec` → FAIL (flat emit, no gpos).

- [ ] **Step 3: Implement**

In `src/core/serializer.ts`:

1. Import the tree helpers:

```ts
import {
	DiagramConfig,
	DiagramEdge,
	DiagramModel,
	DiagramNode,
	EdgeKind,
	NodeStyle,
	hasConfig,
	hasEdgeStyle,
	hasStyle,
	groupChildren,
	groupBounds,
} from "./model";
```

2. Replace the "Subgraphs first" block (the `for (const group of model.groups)` loop that emits subgraphs) with a recursive tree walk. Insert this helper above `modelToMermaid` and call it for top-level groups:

```ts
function emitGroup(
	model: DiagramModel,
	group: DiagramModel["groups"][number],
	nodeById: Map<string, DiagramNode>,
	grouped: Set<string>,
	depth: number,
	lines: string[],
): void {
	const pad = INDENT.repeat(depth + 1);
	const title =
		group.title && group.title !== group.id
			? ` [${quoteLabel(group.title)}]`
			: "";
	lines.push(`${pad}subgraph ${sanitizeId(group.id)}${title}`);
	// Nested child groups first.
	for (const child of groupChildren(model, group.id)) {
		emitGroup(model, child, nodeById, grouped, depth + 1, lines);
	}
	// Then this group's direct member node declarations.
	for (const id of group.nodeIds) {
		const node = nodeById.get(id);
		if (!node) continue;
		grouped.add(id);
		lines.push(INDENT.repeat(depth + 2) + nodeDeclaration(node));
	}
	lines.push(`${pad}end`);
}
```

Then in `modelToMermaid`, replace the old subgraph loop with:

```ts
	// Subgraphs (tree walk from top-level groups), declaring members inside.
	for (const group of model.groups) {
		if (group.parentId) continue; // emitted by its parent
		emitGroup(model, group, nodeById, grouped, 0, lines);
	}
```

3. Add a group-position comment emitter. Add this function next to `positionComment`:

```ts
function groupPositionComment(model: DiagramModel): string | null {
	const parts = model.groups
		.map((g) => {
			const b = groupBounds(model, g);
			return `${sanitizeId(g.id)}=${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`;
		});
	if (parts.length === 0) return null;
	return `%% mermaid-flow:gpos ${parts.join(" ")}`;
}
```

And in `modelToMermaid`, inside the `if (includePositions)` block, after the node position comment:

```ts
	if (includePositions) {
		const pos = positionComment(model);
		if (pos) lines.push(INDENT + pos);
		const gpos = groupPositionComment(model);
		if (gpos) lines.push(INDENT + gpos);
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:unit -- roundtrip.spec` → PASS. Also run the full core suite `pnpm run test:unit` to catch serializer regressions in `positionRoundtrip.spec` → all PASS. `pnpm run check-types` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/serializer.ts src/core/roundtrip.spec.ts
git commit -m "feat(serializer): nested subgraph emit and gpos geometry comment"
```

---

## Task 4: Layout — nested dagre parents + refresh group bounds

**Files:**
- Modify: `src/core/layout.ts`
- Test: `src/core/layout.spec.ts` (append)

**Interfaces:**
- Consumes: `groupBounds`, `groupChildren` from Task 1.
- Produces: `autoLayout` sets dagre parents for nested groups and clears stored group bounds so they re-derive after a fresh layout.

- [ ] **Step 1: Write failing test**

Append to `src/core/layout.spec.ts`:

```ts
import { groupBounds } from './model';

describe('auto layout with nested groups', () => {
  it('keeps nested members inside the parent group box', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph outer\nsubgraph inner\nA-->B\nend\nend\n',
    );
    autoLayout(model);
    const outer = groupBounds(model, model.groups.find((g) => g.id === 'outer')!);
    const inner = groupBounds(model, model.groups.find((g) => g.id === 'inner')!);
    expect(outer.x).toBeLessThanOrEqual(inner.x);
    expect(outer.y).toBeLessThanOrEqual(inner.y);
    expect(outer.x + outer.w).toBeGreaterThanOrEqual(inner.x + inner.w);
  });
});
```

(If `layout.spec.ts` lacks the `mermaidToModel`/`autoLayout` imports, add them at the top.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- layout.spec` → FAIL (nested parent not set; boxes may not nest).

- [ ] **Step 3: Implement**

In `src/core/layout.ts`, in `dagreLayout`, replace the subgraph-cluster block so nested groups set their parent group as dagre parent, and members set their innermost group:

```ts
	// Groups become compound clusters; nested groups parent to their parent group.
	const groupIds = new Set(model.groups.map((g) => g.id));
	for (const grp of model.groups) {
		if (nodeIds.has(grp.id)) continue; // id collision with a node — skip
		g.setNode(grp.id, { width: 0, height: 0 });
	}
	for (const grp of model.groups) {
		if (nodeIds.has(grp.id)) continue;
		if (grp.parentId && groupIds.has(grp.parentId)) {
			g.setParent(grp.id, grp.parentId);
		}
		for (const id of grp.nodeIds) {
			if (nodeIds.has(id)) g.setParent(id, grp.id);
		}
	}
```

After the loop that writes node x/y back (end of `dagreLayout`), clear stored group bounds so they re-derive from the freshly laid-out members:

```ts
	// A fresh layout invalidates any manual group boxes — let them re-derive.
	for (const grp of model.groups) {
		grp.x = grp.y = grp.w = grp.h = undefined;
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- layout.spec` → PASS. `pnpm run test:unit` (full) → PASS. `pnpm run check-types` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/layout.ts src/core/layout.spec.ts
git commit -m "feat(layout): nested compound clusters and group bounds refresh"
```

---

## Task 5: Render — group layer, boxes, titles, refs, CSS

**Files:**
- Modify: `src/webview/wysiwyg/render.ts`
- Modify: `media/diagram.css`
- Test: `src/webview/wysiwyg/render.spec.ts` (append)

**Interfaces:**
- Consumes: `groupBounds` from `../../core`, `RenderRefs`.
- Produces: `RenderRefs` gains `groupEls: Map<string, SVGGElement>`. Groups render as `<g class="ceasg-group" data-group-id>` containing a `<rect>` + title `<text>`, in a layer behind edges/nodes, outermost-first.

- [ ] **Step 1: Write failing tests**

Append to `src/webview/wysiwyg/render.spec.ts`:

```ts
describe('renderDiagram groups', () => {
  it('emits a group box and title behind the nodes', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph g1 [My Group]\nA[Alpha]-->B[Beta]\nend\n',
    );
    model.nodes.forEach((n, i) => { n.x = 100 + i * 150; n.y = 100; });
    const { svg, refs } = renderDiagram(model);
    expect(svg.querySelectorAll('[data-group-id]').length).toBe(1);
    expect(refs.groupEls.get('g1')).toBeTruthy();
    expect(svg.textContent).toContain('My Group');
    // group layer precedes node layer in DOM order (renders behind)
    const groupLayer = svg.querySelector('.ceasg-group-layer')!;
    const nodeLayer = svg.querySelector('.ceasg-node-layer')!;
    expect(groupLayer.compareDocumentPosition(nodeLayer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders an outer group before its nested child (outer behind)', () => {
    const { model } = mermaidToModel(
      'flowchart TB\nsubgraph outer\nsubgraph inner\nA-->B\nend\nend\n',
    );
    model.nodes.forEach((n, i) => { n.x = 120 + i * 120; n.y = 120; });
    const { svg } = renderDiagram(model);
    const ids = [...svg.querySelectorAll('[data-group-id]')].map((e) => e.getAttribute('data-group-id'));
    expect(ids.indexOf('outer')).toBeLessThan(ids.indexOf('inner'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:unit -- render.spec` → FAIL (no group layer / groupEls).

- [ ] **Step 3: Implement**

In `src/webview/wysiwyg/render.ts`:

1. Extend imports and `RenderRefs`:

```ts
import { DiagramModel, DiagramNode, DiagramEdge, DiagramGroup, createShapeElements, estimateNodeSize, resolveNodeStyle, measureTextWidth, groupBounds, groupChildren } from '../../core';
```

```ts
export interface RenderRefs {
  nodeEls: Map<string, SVGGElement>;
  edgeEls: Map<string, SVGGElement>;
  groupEls: Map<string, SVGGElement>;
}
```

2. Add a group renderer:

```ts
function renderGroup(model: DiagramModel, group: DiagramGroup): SVGGElement {
  const g = el('g');
  g.setAttribute('class', 'ceasg-group');
  g.setAttribute('data-group-id', group.id);
  const b = groupBounds(model, group);
  const rect = el('rect');
  rect.setAttribute('class', 'ceasg-group-box');
  rect.setAttribute('x', String(b.x));
  rect.setAttribute('y', String(b.y));
  rect.setAttribute('width', String(b.w));
  rect.setAttribute('height', String(b.h));
  rect.setAttribute('rx', '6');
  g.appendChild(rect);
  const title = el('text');
  title.setAttribute('class', 'ceasg-group-title');
  title.setAttribute('x', String(b.x + 10));
  title.setAttribute('y', String(b.y + 16));
  title.textContent = group.title;
  g.appendChild(title);
  return g;
}
```

3. In `renderDiagram`, add the group layer first (behind edges/nodes) and populate it outermost-first. Insert before the `edgeLayer` creation:

```ts
  const groupLayer = el('g');
  groupLayer.setAttribute('class', 'ceasg-group-layer');
  svg.appendChild(groupLayer);
```

Keep `edgeLayer` and `nodeLayer` appended after (so DOM order is group → edge → node). Initialise refs with `groupEls`:

```ts
  const refs: RenderRefs = { nodeEls: new Map(), edgeEls: new Map(), groupEls: new Map() };
```

Populate groups pre-order (parents before children). Add before the edge loop:

```ts
  // Render groups outermost-first so nested boxes paint on top of their parent.
  const orderedGroups: DiagramGroup[] = [];
  const pushGroup = (grp: DiagramGroup) => {
    orderedGroups.push(grp);
    for (const child of groupChildren(model, grp.id)) pushGroup(child);
  };
  for (const grp of model.groups) { if (!grp.parentId) pushGroup(grp); }
  for (const grp of orderedGroups) {
    const gEl = renderGroup(model, grp);
    groupLayer.appendChild(gEl);
    refs.groupEls.set(grp.id, gEl);
  }
```

4. In `media/diagram.css`, add group styles (place near the node/shape rules):

```css
.ceasg-group-box {
  fill: color-mix(in srgb, currentColor 4%, transparent);
  stroke: color-mix(in srgb, currentColor 35%, transparent);
  stroke-width: 1px;
}
.ceasg-group .ceasg-group-box { pointer-events: all; }
.ceasg-group-title {
  font: 600 13px "trebuchet ms", verdana, arial, sans-serif;
  fill: currentColor;
  opacity: 0.8;
  pointer-events: none;
  dominant-baseline: middle;
}
.ceasg-group-selected .ceasg-group-box {
  stroke: var(--vscode-focusBorder, #007fd4);
  stroke-width: 2px;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:unit -- render.spec` → PASS. `pnpm run check-types` → the new `groupEls` field must be initialised everywhere `RenderRefs` is created; `editor.ts` initialises `refs` with an object literal — update it (Step in Task 7) — but the render module compiles now. If `check-types` flags `editor.ts`'s `refs` initialiser, fix it here too:

In `src/webview/wysiwyg/editor.ts` change the field initialiser:

```ts
  private refs: RenderRefs = { nodeEls: new Map(), edgeEls: new Map(), groupEls: new Map() };
```

Re-run `pnpm run check-types` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/webview/wysiwyg/render.ts src/webview/wysiwyg/render.spec.ts media/diagram.css src/webview/wysiwyg/editor.ts
git commit -m "feat(render): draw subgraph boxes and titles in a layer behind nodes"
```

---

## Task 6: Hit-testing — innermost group at point

**Files:**
- Modify: `src/webview/wysiwyg/hitTest.ts`
- Test: `src/webview/wysiwyg/hitTest.spec.ts` (append)

**Interfaces:**
- Consumes: `groupBounds` from `../../core`.
- Produces: `groupAtPoint(model, x, y): string | undefined` returning the innermost (deepest) group whose box contains the point. `groupDepth` helper is internal.

- [ ] **Step 1: Write failing tests**

Append to `src/webview/wysiwyg/hitTest.spec.ts`:

```ts
import { groupAtPoint } from './hitTest';

describe('groupAtPoint', () => {
  it('returns the innermost group containing the point', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph outer\nsubgraph inner\nA-->B\nend\nend\n');
    // stored bounds: inner nested inside outer
    const outer = model.groups.find((g) => g.id === 'outer')!;
    const inner = model.groups.find((g) => g.id === 'inner')!;
    outer.x = 0; outer.y = 0; outer.w = 400; outer.h = 400;
    inner.x = 100; inner.y = 100; inner.w = 100; inner.h = 100;
    expect(groupAtPoint(model, 150, 150)).toBe('inner'); // inside both → innermost
    expect(groupAtPoint(model, 20, 20)).toBe('outer');   // only outer
    expect(groupAtPoint(model, 500, 500)).toBeUndefined();
  });
});
```

(Add `import { mermaidToModel } from '../../core';` at the top of the spec if not present.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:unit -- hitTest.spec` → FAIL (`groupAtPoint` not exported).

- [ ] **Step 3: Implement**

In `src/webview/wysiwyg/hitTest.ts`:

```ts
import { DiagramModel, DiagramNode, estimateNodeSize, groupBounds } from '../../core';
```

```ts
function groupDepth(model: DiagramModel, id: string): number {
  let d = 0;
  let cur = model.groups.find((g) => g.id === id)?.parentId;
  while (cur) { d++; cur = model.groups.find((g) => g.id === cur)?.parentId; }
  return d;
}

/** The innermost (deepest-nested) group whose box contains (x, y). */
export function groupAtPoint(model: DiagramModel, x: number, y: number): string | undefined {
  let best: string | undefined;
  let bestDepth = -1;
  for (const grp of model.groups) {
    const b = groupBounds(model, grp);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      const d = groupDepth(model, grp.id);
      if (d > bestDepth) { bestDepth = d; best = grp.id; }
    }
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:unit -- hitTest.spec` → PASS. `pnpm run check-types` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/webview/wysiwyg/hitTest.ts src/webview/wysiwyg/hitTest.spec.ts
git commit -m "feat(hittest): innermost groupAtPoint"
```

---

## Task 7: Interaction — group selection, group drag, membership & reparent on drop

**Files:**
- Modify: `src/webview/wysiwyg/pointer.ts`
- Modify: `src/webview/wysiwyg/editor.ts`
- Test: `src/webview/wysiwyg/editor.spec.ts` (append — drives the model-level operations the pointer calls)

**Interfaces:**
- Consumes: `groupAtPoint` (Task 6), `translateGroup`, `assignNodeToGroup`, `assignGroupToParent`, `groupBounds` (Task 1).
- Produces: on the editor, `isGroupId(id): boolean`; group drag via `translateGroup`; node drop reassigns membership; group drop reparents. `drawSelection` outlines a selected group.

- [ ] **Step 1: Write failing tests**

Append to `src/webview/wysiwyg/editor.spec.ts` (model-level helpers the interaction relies on — these run without a real pointer):

```ts
import { mermaidToModel, groupAtPoint } from '../../core';
```

Actually `groupAtPoint` lives in `./hitTest`; import from there. Add a focused test of the drop-reassignment rule as a pure function so it is unit-testable. Create the helper in `editor.ts` and test it:

```ts
import { reassignNodeMembership } from './editor';

describe('reassignNodeMembership', () => {
  it('moves a node into the group whose box it is dropped on', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\nB\n');
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    g1.x = 0; g1.y = 0; g1.w = 300; g1.h = 300;
    const B = model.nodes.find((n) => n.id === 'B')!;
    B.x = 150; B.y = 150; // inside g1
    reassignNodeMembership(model, 'B');
    expect(g1.nodeIds).toContain('B');
  });
  it('removes a node from all groups when dropped on empty canvas', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\n');
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    g1.x = 0; g1.y = 0; g1.w = 100; g1.h = 100;
    const A = model.nodes.find((n) => n.id === 'A')!;
    A.x = 500; A.y = 500; // outside
    reassignNodeMembership(model, 'A');
    expect(g1.nodeIds).not.toContain('A');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:unit -- editor.spec` → FAIL (`reassignNodeMembership` not exported).

- [ ] **Step 3: Implement**

In `src/webview/wysiwyg/editor.ts`:

1. Extend imports:

```ts
import { mermaidToModel, modelToMermaid, layoutMissing, cloneModel, DiagramModel, estimateNodeSize, removeNode, removeEdge, NodeShape, nextNodeId, groupBounds, assignNodeToGroup, assignGroupToParent } from '../../core';
import { nodeAtPoint, nodeAnchorPoints, edgeAtPoint, groupAtPoint } from './hitTest';
```

2. Add exported pure helpers used by the pointer:

```ts
/** After a node drag ends, set the node's membership to the innermost group its
 *  centre lands in (or ungroup when it lands on empty canvas). */
export function reassignNodeMembership(model: DiagramModel, nodeId: string): void {
  const n = model.nodes.find((nn) => nn.id === nodeId);
  if (!n) return;
  const gid = groupAtPoint(model, n.x, n.y);
  assignNodeToGroup(model, nodeId, gid ?? null);
}

/** After a group drag ends, reparent it to the innermost OTHER group its box
 *  centre lands in (excluding itself and its descendants), or top-level. */
export function reassignGroupParent(model: DiagramModel, groupId: string): void {
  const g = model.groups.find((gr) => gr.id === groupId);
  if (!g) return;
  const b = groupBounds(model, g);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // Candidate = innermost group at centre that is not this group.
  let best: string | null = null;
  let bestDepth = -1;
  for (const other of model.groups) {
    if (other.id === groupId) continue;
    const ob = groupBounds(model, other);
    const inside = cx >= ob.x && cx <= ob.x + ob.w && cy >= ob.y && cy <= ob.y + ob.h;
    if (!inside) continue;
    let d = 0, cur = other.parentId;
    while (cur) { d++; cur = model.groups.find((gg) => gg.id === cur)?.parentId; }
    if (d > bestDepth) { bestDepth = d; best = other.id; }
  }
  assignGroupToParent(model, groupId, best); // assignGroupToParent guards cycles
}
```

3. Add `isGroupId` and group handling in `drawSelection`. Add method:

```ts
  isGroupId(id: string): boolean { return this.model.groups.some((g) => g.id === id); }
```

In `drawSelection`, inside the `for (const id of this.selection.multi)` loop, before the edge fallback, add a group branch:

```ts
      if (this.isGroupId(id)) {
        const gEl = this.refs.groupEls.get(id);
        if (gEl) { gEl.classList.add('ceasg-group-selected'); }
        continue;
      }
```

And clear the class at the top of `drawSelection` alongside the edge-class clearing:

```ts
    for (const [, g] of this.refs.groupEls) { g.classList.remove('ceasg-group-selected'); }
```

In `src/webview/wysiwyg/pointer.ts`:

4. Extend imports:

```ts
import { newEdgeId, translateGroup } from '../../core';
import { nodeAtPoint, nodesInRect, anchorForNode, nodeAnchorPoints, edgeAtPoint, groupAtPoint } from './hitTest';
```

5. Add a group-drag field near the other private fields:

```ts
  private groupDragId: string | null = null;
```

6. In `onDown`, after the node hit branch (the `const node = nodeAtPoint(...)` block that `return`s) and before the edge hit-test, add group handling:

```ts
    // Group box hit (nodes were checked first, so a node inside wins).
    const groupId = groupAtPoint(model, p.x, p.y);
    if (groupId) {
      if (e.shiftKey) { this.selection.toggle(groupId); }
      else { this.selection.select(groupId); }
      this.groupDragId = groupId;
      this.dragging = true;
      this.dragIds = [];
      this.onSelectionChange();
      return;
    }
```

7. In `onMove`, the `if (this.dragging && this.down)` branch currently moves nodes. Make it move a group when `groupDragId` is set:

```ts
    if (this.dragging && this.down) {
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      this.down = p;
      this.editor.mutate((m) => {
        if (this.groupDragId) {
          translateGroup(m, this.groupDragId, dx, dy);
        } else {
          for (const id of this.dragIds) {
            const n = m.nodes.find((nn) => nn.id === id);
            if (n && !n.locked) { n.x += dx; n.y += dy; }
          }
        }
      });
      return;
    }
```

8. In `onUp`, extend the `else if (this.dragging)` branch to run membership/reparent on drop before committing:

```ts
    } else if (this.dragging) {
      this.dragging = false;
      this.editor.mutate((m) => {
        if (this.groupDragId) {
          reassignGroupParent(m, this.groupDragId);
        } else {
          for (const id of this.dragIds) { reassignNodeMembership(m, id); }
        }
      }, { commit: true });
      this.groupDragId = null;
      this.down = null;
```

Import the helpers at the top of `pointer.ts`:

```ts
import { reassignNodeMembership, reassignGroupParent } from './editor';
```

(These are plain functions on the module, so importing them alongside the type is fine even though `WysiwygEditor` is imported as a type.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:unit -- editor.spec` → PASS. `pnpm run check-types` → clean. `pnpm run lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/webview/wysiwyg/pointer.ts src/webview/wysiwyg/editor.ts src/webview/wysiwyg/editor.spec.ts
git commit -m "feat(interaction): group select, drag, membership and reparent on drop"
```

---

## Task 8: Group resize handles

**Files:**
- Modify: `src/webview/wysiwyg/hitTest.ts`
- Modify: `src/webview/wysiwyg/editor.ts` (draw handles)
- Modify: `src/webview/wysiwyg/pointer.ts` (resize drag)
- Test: `src/webview/wysiwyg/hitTest.spec.ts` (append)

**Interfaces:**
- Consumes: `groupBounds`.
- Produces: `groupResizeHandles(model, groupId): Array<{corner:'nw'|'ne'|'sw'|'se'; x:number; y:number}>` and `groupHandleAtPoint(model, groupId, x, y, tol): 'nw'|'ne'|'sw'|'se'|undefined`. Editor materialises + resizes stored bounds.

- [ ] **Step 1: Write failing test**

Append to `hitTest.spec.ts`:

```ts
import { groupResizeHandles, groupHandleAtPoint } from './hitTest';

describe('group resize handles', () => {
  it('exposes four corner handles and hit-tests them', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\n');
    const g1 = model.groups.find((g) => g.id === 'g1')!;
    g1.x = 0; g1.y = 0; g1.w = 200; g1.h = 100;
    const hs = groupResizeHandles(model, 'g1');
    expect(hs.map((h) => h.corner).sort()).toEqual(['ne', 'nw', 'se', 'sw']);
    expect(groupHandleAtPoint(model, 'g1', 200, 100, 6)).toBe('se');
    expect(groupHandleAtPoint(model, 'g1', 100, 50, 6)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- hitTest.spec` → FAIL.

- [ ] **Step 3: Implement**

In `hitTest.ts`:

```ts
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export function groupResizeHandles(
  model: DiagramModel, groupId: string,
): Array<{ corner: Corner; x: number; y: number }> {
  const g = model.groups.find((gr) => gr.id === groupId);
  if (!g) { return []; }
  const b = groupBounds(model, g);
  return [
    { corner: 'nw', x: b.x, y: b.y },
    { corner: 'ne', x: b.x + b.w, y: b.y },
    { corner: 'sw', x: b.x, y: b.y + b.h },
    { corner: 'se', x: b.x + b.w, y: b.y + b.h },
  ];
}

export function groupHandleAtPoint(
  model: DiagramModel, groupId: string, x: number, y: number, tol: number,
): Corner | undefined {
  for (const h of groupResizeHandles(model, groupId)) {
    if (Math.abs(x - h.x) <= tol && Math.abs(y - h.y) <= tol) { return h.corner; }
  }
  return undefined;
}
```

In `editor.ts` `drawSelection`, when a single group is selected draw its handles. After the existing single-node anchor block, add:

```ts
    if (this.selection.single && this.isGroupId(this.selection.single)) {
      const r = 5 / (this.viewport?.scale ?? 1);
      for (const h of groupResizeHandles(this.model, this.selection.single)) {
        this.overlay.handle(h.x, h.y, r);
      }
    }
```

Import `groupResizeHandles` in `editor.ts`:

```ts
import { nodeAtPoint, nodeAnchorPoints, edgeAtPoint, groupAtPoint, groupResizeHandles, groupHandleAtPoint } from './hitTest';
```

In `pointer.ts`, add a resize field:

```ts
  private resize: { groupId: string; corner: import('./hitTest').Corner } | null = null;
```

In `onDown`, before the group-box hit branch, check for a resize handle on the currently single-selected group:

```ts
    if (this.selection.single && this.editor.isGroupId(this.selection.single)) {
      const corner = groupHandleAtPoint(model, this.selection.single, p.x, p.y, 8 / this.editor.viewport!.scale);
      if (corner) {
        // Materialise current bounds so the resize edits explicit values.
        this.editor.mutate((m) => {
          const g = m.groups.find((gr) => gr.id === this.selection.single)!;
          const b = groupBoundsLocal(m, g);
          g.x = b.x; g.y = b.y; g.w = b.w; g.h = b.h;
        });
        this.resize = { groupId: this.selection.single, corner };
        return;
      }
    }
```

Add imports to `pointer.ts`:

```ts
import { groupHandleAtPoint } from './hitTest';
import { groupBounds as groupBoundsLocal } from '../../core';
```

In `onMove`, handle resize before the drag branch:

```ts
    if (this.resize && this.down) {
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      this.down = p;
      const { groupId, corner } = this.resize;
      this.editor.mutate((m) => {
        const g = m.groups.find((gr) => gr.id === groupId);
        if (!g || g.x === undefined || g.y === undefined || g.w === undefined || g.h === undefined) { return; }
        if (corner === 'nw') { g.x += dx; g.y += dy; g.w -= dx; g.h -= dy; }
        else if (corner === 'ne') { g.y += dy; g.w += dx; g.h -= dy; }
        else if (corner === 'sw') { g.x += dx; g.w -= dx; g.h += dy; }
        else { g.w += dx; g.h += dy; }
        if (g.w < 40) { g.w = 40; }
        if (g.h < 40) { g.h = 40; }
      });
      return;
    }
```

In `onUp`, handle resize completion first:

```ts
    if (this.resize) {
      this.resize = null; this.editor.commit(); this.down = null;
      this.capturedPointerId = null;
      return;
    }
```

(Place this at the very top of `onUp`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:unit -- hitTest.spec` → PASS. `pnpm run check-types` → clean. `pnpm run lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/webview/wysiwyg/hitTest.ts src/webview/wysiwyg/hitTest.spec.ts src/webview/wysiwyg/editor.ts src/webview/wysiwyg/pointer.ts
git commit -m "feat(interaction): group resize handles"
```

---

## Task 9: Toolbar, properties, rename, create-from-selection, ungroup

**Files:**
- Modify: `src/webview/wysiwyg/toolbar.ts`
- Modify: `src/webview/wysiwyg/properties.ts`
- Modify: `src/webview/wysiwyg/editor.ts`
- Test: `src/webview/wysiwyg/editor.spec.ts` (append — `groupSelection`/`ungroupSelection` model ops)

**Interfaces:**
- Consumes: `newGroupId`, `groupBounds`, `removeGroup`, `assignNodeToGroup`, `groupOf` from `../../core`.
- Produces: editor methods `groupSelection(): void`, `ungroupSelection(): void`; toolbar Group/Ungroup buttons; properties group panel; Delete key ungroups a selected group; double-click on a group title renames.

- [ ] **Step 1: Write failing tests**

Append to `editor.spec.ts`:

```ts
import { makeGroupFromNodes, ungroup } from './editor';

describe('create / ungroup operations', () => {
  it('wraps selected nodes in a new group with bbox bounds', () => {
    const { model } = mermaidToModel('flowchart TB\nA\nB\nC\n');
    model.nodes.forEach((n, i) => { n.x = 100 + i * 100; n.y = 100; });
    const gid = makeGroupFromNodes(model, ['A', 'B']);
    const g = model.groups.find((gr) => gr.id === gid)!;
    expect(g.nodeIds.sort()).toEqual(['A', 'B']);
    expect(g.w).toBeGreaterThan(0);
    expect(g.x).toBeDefined();
    expect(g.nodeIds).not.toContain('C');
  });

  it('nests the new group under a shared parent group', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph outer\nA\nB\nend\n');
    model.nodes.forEach((n, i) => { n.x = 100 + i * 100; n.y = 100; });
    const gid = makeGroupFromNodes(model, ['A', 'B']);
    expect(model.groups.find((g) => g.id === gid)!.parentId).toBe('outer');
  });

  it('ungroup keeps nodes and removes the group', () => {
    const { model } = mermaidToModel('flowchart TB\nsubgraph g1\nA\nend\n');
    ungroup(model, 'g1');
    expect(model.groups.find((g) => g.id === 'g1')).toBeUndefined();
    expect(model.nodes.find((n) => n.id === 'A')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:unit -- editor.spec` → FAIL.

- [ ] **Step 3: Implement**

In `editor.ts`, add exported ops and thin editor methods:

```ts
import { mermaidToModel, modelToMermaid, layoutMissing, cloneModel, DiagramModel, estimateNodeSize, removeNode, removeEdge, NodeShape, nextNodeId, groupBounds, assignNodeToGroup, assignGroupToParent, newGroupId, removeGroup, groupOf, GROUP_PAD, GROUP_TITLE_H } from '../../core';
```

```ts
/** Wrap nodes in a fresh group. Bounds = bbox+padding; nests under a shared
 *  parent group when all nodes already share one. Returns the new group id. */
export function makeGroupFromNodes(model: DiagramModel, nodeIds: string[]): string {
  const id = newGroupId(model);
  const parents = new Set(nodeIds.map((nid) => groupOf(model, nid)?.id));
  const parentId = parents.size === 1 ? [...parents][0] : undefined;
  // Remove from any current group, then add to the new one.
  for (const nid of nodeIds) { assignNodeToGroup(model, nid, null); }
  model.groups.push({ id, title: id, nodeIds: [...nodeIds], parentId });
  const g = model.groups[model.groups.length - 1];
  const b = groupBounds(model, g); // derived from members
  g.x = b.x; g.y = b.y; g.w = b.w; g.h = b.h;
  return id;
}

export function ungroup(model: DiagramModel, groupId: string): void {
  removeGroup(model, groupId);
}
```

```ts
  groupSelection(): void {
    if (!this.selection) { return; }
    const ids = [...this.selection.multi].filter((id) => this.model.nodes.some((n) => n.id === id));
    if (ids.length === 0) { return; }
    let gid = '';
    this.mutate((m) => { gid = makeGroupFromNodes(m, ids); }, { commit: true });
    this.selection.select(gid);
    this.refreshSelection();
  }

  ungroupSelection(): void {
    if (!this.selection || !this.selection.single || !this.isGroupId(this.selection.single)) { return; }
    const gid = this.selection.single;
    this.mutate((m) => { ungroup(m, gid); }, { commit: true });
    this.selection.clear();
    this.refreshSelection();
  }
```

In `deleteSelected`, make Delete ungroup a selected group instead of trying to remove it as a node. At the top of `deleteSelected`, before the loop:

```ts
    // A selected group is ungrouped (contents kept), not deleted.
    for (const id of [...this.selection.multi]) {
      if (this.isGroupId(id)) { this.ungroupSelection(); return; }
    }
```

In `repaint`, extend the `dblclick` handler to rename a group title when a group box (not a node) is double-clicked. After the node branch (`if (node) { … return; }`), add:

```ts
      const gId = groupAtPoint(this.model, p.x, p.y);
      if (gId) {
        const grp = this.model.groups.find((g) => g.id === gId)!;
        const b = groupBounds(this.model, grp);
        openLabelEditor(this.canvasHost, this.viewport!, { x: b.x + 60, y: b.y + 12, text: grp.title }, (text) => {
          this.mutate((m) => { const gg = m.groups.find((g) => g.id === gId); if (gg) { gg.title = text; } }, { commit: true });
        });
        return;
      }
```

In `toolbar.ts`, add Group/Ungroup buttons after the Delete button:

```ts
    bar.appendChild(this.btn('▢+', 'Group selection into subgraph', () => this.editor.groupSelection()));
    bar.appendChild(this.btn('▢-', 'Ungroup selected subgraph', () => this.editor.ungroupSelection()));
```

In `properties.ts`, show a group panel. In `refresh`, after the node/edge single-selection checks and before the `multi.size > 1` check, add:

```ts
    if (selection.single) {
      const group = model.groups.find((g) => g.id === selection.single);
      if (group) { this.groupPanel(group.id); return; }
    }
```

And add the panel method:

```ts
  private groupPanel(id: string): void {
    const group = () => this.editor.getModel().groups.find((g) => g.id === id)!;
    const head = document.createElement('div'); head.className = 'ceasg-panel-head'; head.textContent = `Subgraph ${id}`;
    this.host.appendChild(head);

    const title = document.createElement('input'); title.type = 'text'; title.value = group().title;
    title.addEventListener('input', () => this.editor.mutate((m) => { const g = m.groups.find((g) => g.id === id); if (g) { g.title = title.value; } }, { commit: true }));
    this.host.appendChild(this.row('Title', title));

    this.host.appendChild(this.hint(`${group().nodeIds.length} member nodes`));

    const ungroupBtn = document.createElement('button'); ungroupBtn.textContent = 'Ungroup'; ungroupBtn.className = 'ceasg-danger';
    ungroupBtn.addEventListener('click', () => this.editor.ungroupSelection());
    const actions = document.createElement('div'); actions.className = 'ceasg-panel-actions'; actions.append(ungroupBtn);
    this.host.appendChild(actions);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test:unit -- editor.spec` → PASS. `pnpm run test:unit` (full suite) → PASS. `pnpm run check-types` → clean. `pnpm run lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/webview/wysiwyg/toolbar.ts src/webview/wysiwyg/properties.ts src/webview/wysiwyg/editor.ts src/webview/wysiwyg/editor.spec.ts
git commit -m "feat(ui): group/ungroup toolbar + properties, rename, delete=ungroup"
```

---

## Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the complete unit suite**

Run: `pnpm run test:unit`
Expected: all specs PASS (core + webview).

- [ ] **Step 2: Type-check both projects and lint**

Run: `pnpm run check-types && pnpm run lint`
Expected: no errors.

- [ ] **Step 3: Production build sanity**

Run: `node esbuild.js --production`
Expected: builds `dist/` with no errors.

- [ ] **Step 4: Commit any lint/format fixups (if the previous steps required edits)**

```bash
git add -A
git commit -m "chore: verification fixups for subgraph feature"
```

(Skip if nothing changed.)

---

## Self-review notes

- **Spec coverage:** model tree+bounds (T1), parser nesting+gpos (T2), serializer nested+gpos (T3), layout nesting (T4), render boxes/titles (T5), hit-test (T6), select/drag/membership/reparent (T7), resize (T8), create/ungroup/rename/toolbar/properties/delete (T9), verification (T10). All spec sections mapped.
- **Out of scope (per spec):** per-subgraph `direction`, subgraph styling/classDef, delete-with-contents, empty-container-first creation — no tasks, intentionally.
- **Type consistency:** `groupBounds` returns top-left `{x,y,w,h}` everywhere; `RenderRefs.groupEls` added in T5 and consumed in T7/T8; `reassignNodeMembership`/`reassignGroupParent`/`makeGroupFromNodes`/`ungroup` are module-level exports in `editor.ts` consumed by `pointer.ts` and tests.
