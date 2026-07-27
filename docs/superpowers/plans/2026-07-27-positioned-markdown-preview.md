# Positioned Mermaid in Markdown Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VS Code's built-in Markdown preview render ceasg flowcharts with their manual `%% mermaid-flow:pos %%` layout (identical to the visual editor), while all non-flowchart Mermaid types render via bundled mermaid.js — ceasg fully replacing the stock Mermaid preview extension.

**Architecture:** A Node-side `extendMarkdownIt` hook replaces the `mermaid` fenced-code rule with a placeholder `<div>` carrying the source. A browser-side preview script (`dist/preview.js`, bundled by esbuild) decodes each placeholder, routes flowcharts to ceasg's existing parser + renderer (auto-layout via dagre when unpositioned) and everything else to bundled mermaid.js. Shared `.ceasg-*` diagram CSS is factored into one partial loaded by both the editor webview and the preview.

**Tech Stack:** TypeScript, esbuild (IIFE browser bundle), markdown-it (provided by VS Code at runtime), mermaid.js (bundled), dagre (existing), vitest + jsdom for tests, `@vscode/vsce` for packaging.

## Global Constraints

- Package manager: **pnpm**. Run scripts with `pnpm run <script>`.
- Unit tests are colocated `*.spec.ts` files, run by **vitest** (`pnpm run test:unit`), environment **jsdom** (DOM globals like `document`, `atob`, `TextDecoder` are available).
- Type checking must pass for both `tsconfig.json` (extension host) and `tsconfig.webview.json` (browser code): `pnpm run check-types`.
- Lint must pass: `pnpm run lint` (eslint on `src`).
- New source files are original work — no GPL header needed (only the ported files carry one).
- Reuse existing core APIs unchanged: `mermaidToModel(text): { model, warnings }`, `layoutMissing(model): void`, `renderDiagram(model): { svg, refs }`, `computeContentBounds(model): { minX, minY, maxX, maxY }`, `detectDiagramType(src)`, `isVisuallyEditable(type)`.
- Commit after each task with a `feat:`/`refactor:`/`chore:` message. Commit on `main`. **Do not push.**

---

### Task 1: Extract shared diagram CSS into one partial

Prevents the editor and preview from drifting on diagram styling. Moves the purely-visual `.ceasg-*` rules out of the editor-only `media/webview.css` into a new `media/diagram.css` loaded by both.

**Files:**
- Create: `media/diagram.css`
- Modify: `media/webview.css` (remove the shared visual rules, keep editor-only rules)
- Modify: `src/extension/webviewHtml.ts` (add a second stylesheet link)
- Modify: `esbuild.js` (copy `media/diagram.css` → `dist/diagram.css`)

**Interfaces:**
- Produces: `media/diagram.css` containing the diagram visual rules (`.ceasg-shape`, `.ceasg-label`, `.ceasg-edge-line`, `.ceasg-edge-hit`, `.ceasg-edge-dotted`, `.ceasg-edge-thick`, `.ceasg-edge-invisible`, `.ceasg-edge-label-bg`, `.ceasg-edge-label`, `.ceasg-edge-selected`, `.ceasg-arrowhead`). Consumed by Task 5 (`previewStyles`) and by the editor webview.

- [ ] **Step 1: Create `media/diagram.css`** with the shared visual rules (copied verbatim from `media/webview.css` lines 12–22, plus the `.ceasg-edge-selected` rule):

```css
.ceasg-shape { fill: var(--vscode-editorWidget-background); stroke: var(--vscode-foreground); stroke-width: 1.5; }
.ceasg-label { fill: var(--vscode-foreground); font: 14px var(--vscode-font-family); }
.ceasg-edge-line { stroke: var(--vscode-foreground); stroke-width: 1.5; }
.ceasg-edge-hit { stroke: transparent; stroke-width: 12; fill: none; }
.ceasg-edge-dotted .ceasg-edge-line { stroke-dasharray: 5 5; }
.ceasg-edge-thick .ceasg-edge-line { stroke-width: 3; }
.ceasg-edge-invisible .ceasg-edge-line { stroke-dasharray: 2 6; opacity: 0.4; }
.ceasg-edge-label-bg { fill: var(--vscode-editor-background); }
.ceasg-edge-label { fill: var(--vscode-foreground); font: 12px var(--vscode-font-family); }
.ceasg-edge-selected .ceasg-edge-line { stroke: var(--vscode-focusBorder); stroke-width: 2.5; }
.ceasg-arrowhead { fill: var(--vscode-foreground); }
```

- [ ] **Step 2: Remove those same rules from `media/webview.css`.** Delete lines 12–21 (the `.ceasg-shape` through `.ceasg-edge-selected` / `.ceasg-arrowhead` block). **Keep** line 11 `.ceasg-canvas-svg { width: 100%; height: 100%; }` (editor viewport sizing — preview sizes explicitly instead). Keep every other editor rule.

- [ ] **Step 3: Link `diagram.css` in the editor webview.** In `src/extension/webviewHtml.ts`, after the existing `cssUri`, add:

```ts
  const diagramCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'diagram.css'));
```

and add a second `<link>` before the existing one in the returned HTML:

```html
<link rel="stylesheet" href="${diagramCssUri}">
<link rel="stylesheet" href="${cssUri}">
```

- [ ] **Step 4: Copy the partial in `esbuild.js`.** Next to the existing `webview.css` copy line, add:

```js
	if (fs.existsSync('media/diagram.css')) { fs.copyFileSync('media/diagram.css', 'dist/diagram.css'); }
```

- [ ] **Step 5: Build and verify existing behavior unaffected.**

Run: `pnpm run compile`
Expected: build succeeds; `dist/diagram.css` exists.
Run: `pnpm run test:unit`
Expected: all existing specs pass (renderer output is class-based and unchanged).

- [ ] **Step 6: Commit**

```bash
git add media/diagram.css media/webview.css src/extension/webviewHtml.ts esbuild.js
git commit -m "refactor: extract shared diagram CSS into media/diagram.css"
```

---

### Task 2: Flowchart-to-SVG preview pipeline

A pure module that turns flowchart source into a correctly-sized standalone SVG, reusing the editor's parser, layout, renderer, and bounds. This is the ceasg branch of preview routing.

**Files:**
- Create: `src/preview/flowchartPreview.ts`
- Test: `src/preview/flowchartPreview.spec.ts`

**Interfaces:**
- Consumes: `mermaidToModel`, `layoutMissing`, `detectDiagramType`, `isVisuallyEditable` from `../core`; `renderDiagram` from `../webview/wysiwyg/render`; `computeContentBounds` from `../webview/wysiwyg/viewport`.
- Produces:
  - `isFlowchartSource(src: string): boolean` — true when ceasg should render it (flowchart or headerless/unknown snippet).
  - `renderFlowchartToSvg(src: string): SVGSVGElement` — parsed, laid out (auto-layout if unpositioned), rendered, and sized with `viewBox` + intrinsic `width`/`height`.
  Both consumed by Task 4.

- [ ] **Step 1: Write the failing test** `src/preview/flowchartPreview.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isFlowchartSource, renderFlowchartToSvg } from './flowchartPreview';

describe('isFlowchartSource', () => {
  it('accepts flowcharts and headerless snippets, rejects other types', () => {
    expect(isFlowchartSource('flowchart LR\nA-->B')).toBe(true);
    expect(isFlowchartSource('A-->B')).toBe(true); // unknown/headerless
    expect(isFlowchartSource('sequenceDiagram\nA->>B: hi')).toBe(false);
    expect(isFlowchartSource('pie\n"a": 1')).toBe(false);
  });
});

describe('renderFlowchartToSvg', () => {
  it('renders a node per node and sets a viewBox + size', () => {
    const svg = renderFlowchartToSvg('flowchart LR\nA[Start]-->B[End]');
    expect(svg.querySelectorAll('[data-node-id]').length).toBe(2);
    expect(svg.getAttribute('viewBox')).toMatch(/^-?\d/);
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0);
  });

  it('auto-lays-out an unpositioned flowchart so nodes are not all at the origin', () => {
    const svg = renderFlowchartToSvg('flowchart TD\nA-->B-->C');
    const xs = Array.from(svg.querySelectorAll('.ceasg-node text'))
      .map((t) => Number(t.getAttribute('x')));
    const ys = Array.from(svg.querySelectorAll('.ceasg-node text'))
      .map((t) => Number(t.getAttribute('y')));
    const spread = new Set([...xs, ...ys]).size;
    expect(spread).toBeGreaterThan(1); // not all identical coordinates
  });

  it('honors saved positions from a pos comment', () => {
    const src = 'flowchart LR\nA-->B\n%% mermaid-flow:pos A=100,200 B=400,200';
    const svg = renderFlowchartToSvg(src);
    const aText = svg.querySelector('.ceasg-node[data-node-id="A"] text');
    expect(aText?.getAttribute('x')).toBe('100');
    expect(aText?.getAttribute('y')).toBe('200');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/preview/flowchartPreview.spec.ts`
Expected: FAIL — module `./flowchartPreview` not found.

- [ ] **Step 3: Write minimal implementation** `src/preview/flowchartPreview.ts`:

```ts
import { mermaidToModel, layoutMissing, detectDiagramType, isVisuallyEditable } from '../core';
import { renderDiagram } from '../webview/wysiwyg/render';
import { computeContentBounds } from '../webview/wysiwyg/viewport';

/** Whether ceasg's positioned renderer should draw this block (vs. mermaid.js). */
export function isFlowchartSource(src: string): boolean {
  return isVisuallyEditable(detectDiagramType(src));
}

/** Parse → layout (auto if unpositioned) → render → size into a standalone SVG. */
export function renderFlowchartToSvg(src: string): SVGSVGElement {
  const { model } = mermaidToModel(src);
  layoutMissing(model); // no-op when positions came from the pos comment
  const { svg } = renderDiagram(model);
  const b = computeContentBounds(model);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  svg.setAttribute('viewBox', `${b.minX} ${b.minY} ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
  return svg;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/preview/flowchartPreview.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Verify the pos-comment test assumption.** If the `honors saved positions` test fails on the coordinate format (e.g. the parser stores a different pos syntax), open `src/core/parser.spec.ts` and `src/core/positionRoundtrip.spec.ts`, copy an exact positioned example from there, and adjust the test's `src` + expected coordinates to match the real format. Re-run until green. Do not change the implementation to satisfy a guessed format.

- [ ] **Step 6: Commit**

```bash
git add src/preview/flowchartPreview.ts src/preview/flowchartPreview.spec.ts
git commit -m "feat: flowchart-to-SVG preview pipeline"
```

---

### Task 3: markdown-it fence plugin (Node side)

Replaces the `mermaid` fenced-code renderer with a placeholder carrying the base64 source, gated by a callback so the setting can disable it.

**Files:**
- Create: `src/preview/markdownItMermaid.ts`
- Test: `src/preview/markdownItMermaid.spec.ts`

**Interfaces:**
- Produces:
  - `encodeSource(src: string): string` — base64 of UTF-8 source.
  - `installMermaidFence(md, isEnabled: () => boolean): typeof md` — overrides `md.renderer.rules.fence`; for `mermaid` blocks when `isEnabled()` returns a placeholder `<div class="ceasg-diagram" data-src="...">`, otherwise delegates to the previous fence rule. Consumed by Task 5 (`activate`).

- [ ] **Step 1: Write the failing test** `src/preview/markdownItMermaid.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeSource, installMermaidFence } from './markdownItMermaid';

// Minimal fake markdown-it renderer sufficient for the fence rule.
function makeMd() {
  return {
    renderer: {
      rules: {
        fence: (tokens: any, i: number) => `<pre>${tokens[i].content}</pre>`,
      },
    },
  };
}
const self = { renderToken: () => '' };

describe('installMermaidFence', () => {
  it('emits a placeholder carrying the base64 source for mermaid blocks', () => {
    const md = makeMd();
    installMermaidFence(md as any, () => true);
    const tokens = [{ info: 'mermaid', content: 'flowchart LR\nA-->B' }];
    const html = md.renderer.rules.fence!(tokens as any, 0, {}, {}, self as any);
    expect(html).toContain('class="ceasg-diagram"');
    expect(html).toContain(`data-src="${encodeSource('flowchart LR\nA-->B')}"`);
  });

  it('delegates non-mermaid blocks to the previous rule', () => {
    const md = makeMd();
    installMermaidFence(md as any, () => true);
    const tokens = [{ info: 'ts', content: 'const x = 1;' }];
    const html = md.renderer.rules.fence!(tokens as any, 0, {}, {}, self as any);
    expect(html).toBe('<pre>const x = 1;</pre>');
  });

  it('delegates mermaid blocks to the previous rule when disabled', () => {
    const md = makeMd();
    installMermaidFence(md as any, () => false);
    const tokens = [{ info: 'mermaid', content: 'flowchart LR\nA-->B' }];
    const html = md.renderer.rules.fence!(tokens as any, 0, {}, {}, self as any);
    expect(html).toBe('<pre>flowchart LR\nA-->B</pre>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/preview/markdownItMermaid.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** `src/preview/markdownItMermaid.ts`:

```ts
// Structural typing for the slice of markdown-it we use. VS Code provides the
// real instance at runtime; we never import the markdown-it package.
interface MdToken { info: string; content: string; }
interface MdSelf { renderToken(tokens: MdToken[], idx: number, options: unknown): string; }
type MdFenceRule = (tokens: MdToken[], idx: number, options: unknown, env: unknown, self: MdSelf) => string;
interface MarkdownIt { renderer: { rules: { fence?: MdFenceRule } }; }

/** Base64-encode UTF-8 source for safe embedding in an HTML attribute. */
export function encodeSource(src: string): string {
  return Buffer.from(src, 'utf8').toString('base64');
}

/**
 * Override the fenced-code renderer: mermaid blocks become a placeholder the
 * preview script fills in; everything else falls through to the prior rule.
 */
export function installMermaidFence(md: MarkdownIt, isEnabled: () => boolean): MarkdownIt {
  const prev: MdFenceRule =
    md.renderer.rules.fence ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = (token.info || '').trim().split(/\s+/)[0];
    if (lang === 'mermaid' && isEnabled()) {
      return `<div class="ceasg-diagram" data-src="${encodeSource(token.content)}"></div>`;
    }
    return prev(tokens, idx, options, env, self);
  };
  return md;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/preview/markdownItMermaid.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preview/markdownItMermaid.ts src/preview/markdownItMermaid.spec.ts
git commit -m "feat: markdown-it mermaid fence plugin"
```

---

### Task 4: Preview host (browser routing + error handling)

The testable core of the preview script: decode a placeholder, route flowchart→ceasg / other→mermaid, and isolate per-diagram errors. Keeps the heavy `mermaid` import out of this file (Task 5's entry injects the render fn) so tests stay light.

**Files:**
- Create: `src/preview/previewHost.ts`
- Test: `src/preview/previewHost.spec.ts`

**Interfaces:**
- Consumes: `isFlowchartSource`, `renderFlowchartToSvg` from `./flowchartPreview`.
- Produces:
  - `decodeSource(b64: string): string` — UTF-8 decode of `encodeSource` output.
  - `type MermaidRender = (id: string, src: string) => Promise<{ svg: string }>`.
  - `processElement(el: Element, render: MermaidRender, seq: number): Promise<void>` — fills one placeholder, marks it `data-done`, renders an error `<div class="ceasg-err">` on failure.
  - `renderAll(render: MermaidRender): Promise<void>` — processes every `.ceasg-diagram:not([data-done])`.
  Consumed by Task 5's entry file.

- [ ] **Step 1: Write the failing test** `src/preview/previewHost.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { decodeSource, processElement, renderAll } from './previewHost';
import { encodeSource } from './markdownItMermaid';

function placeholder(src: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ceasg-diagram';
  el.setAttribute('data-src', encodeSource(src));
  return el;
}
const noMermaid = vi.fn(async () => ({ svg: '<svg id="mermaid-stub"></svg>' }));

describe('decodeSource', () => {
  it('round-trips unicode through encodeSource', () => {
    expect(decodeSource(encodeSource('flowchart LR\nA-->✓'))).toBe('flowchart LR\nA-->✓');
  });
});

describe('processElement', () => {
  it('renders a flowchart with the ceasg renderer (no mermaid call)', async () => {
    const el = placeholder('flowchart LR\nA[Start]-->B[End]');
    await processElement(el, noMermaid, 0);
    expect(el.querySelector('svg[data-node-id], svg [data-node-id]')).toBeTruthy();
    expect(el.getAttribute('data-done')).toBe('1');
    expect(noMermaid).not.toHaveBeenCalled();
  });

  it('delegates non-flowchart diagrams to mermaid', async () => {
    const el = placeholder('sequenceDiagram\nA->>B: hi');
    await processElement(el, noMermaid, 1);
    expect(noMermaid).toHaveBeenCalledWith('ceasg-md-1', 'sequenceDiagram\nA->>B: hi');
    expect(el.innerHTML).toContain('mermaid-stub');
  });

  it('renders an error div when mermaid throws', async () => {
    const el = placeholder('sequenceDiagram\nbroken');
    const boom: any = vi.fn(async () => { throw new Error('parse fail'); });
    await processElement(el, boom, 2);
    expect(el.querySelector('.ceasg-err')?.textContent).toBe('parse fail');
  });

  it('skips already-processed elements', async () => {
    const el = placeholder('flowchart LR\nA-->B');
    el.setAttribute('data-done', '1');
    await processElement(el, noMermaid, 3);
    expect(el.children.length).toBe(0);
  });
});

describe('renderAll', () => {
  it('processes every un-done placeholder', async () => {
    document.body.innerHTML = '';
    document.body.append(placeholder('flowchart LR\nA-->B'), placeholder('flowchart TD\nX-->Y'));
    await renderAll(noMermaid);
    expect(document.querySelectorAll('.ceasg-diagram[data-done]').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/preview/previewHost.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** `src/preview/previewHost.ts`:

```ts
import { isFlowchartSource, renderFlowchartToSvg } from './flowchartPreview';

export type MermaidRender = (id: string, src: string) => Promise<{ svg: string }>;

/** UTF-8 decode of a base64 string produced by encodeSource. */
export function decodeSource(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Fill one placeholder; isolate failures so one bad block can't blank the page. */
export async function processElement(el: Element, render: MermaidRender, seq: number): Promise<void> {
  if (el.getAttribute('data-done')) { return; }
  el.setAttribute('data-done', '1');
  const src = decodeSource(el.getAttribute('data-src') || '');
  try {
    if (isFlowchartSource(src)) {
      el.replaceChildren(renderFlowchartToSvg(src));
    } else {
      const { svg } = await render(`ceasg-md-${seq}`, src);
      el.innerHTML = svg;
    }
  } catch (e) {
    const err = document.createElement('div');
    err.className = 'ceasg-err';
    err.textContent = e instanceof Error ? e.message : String(e);
    el.replaceChildren(err);
  }
}

let seq = 0;

/** Process every not-yet-rendered placeholder in the document. */
export async function renderAll(render: MermaidRender): Promise<void> {
  const els = Array.from(document.querySelectorAll('.ceasg-diagram:not([data-done])'));
  for (const el of els) { await processElement(el, render, seq++); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/preview/previewHost.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preview/previewHost.ts src/preview/previewHost.spec.ts
git commit -m "feat: preview host routing and error isolation"
```

---

### Task 5: Wire it together — entry, manifest, build, styles

Connects the pieces: the browser entry that imports mermaid and runs `renderAll`, the esbuild bundle, the preview CSS, the manifest contributions + setting, and the `activate` hook. Ends with a manual smoke test in the Extension Development Host.

**Files:**
- Create: `src/preview/preview-inject.ts` (browser entry)
- Create: `media/preview.css`
- Modify: `esbuild.js` (third bundle entry)
- Modify: `package.json` (contributions + configuration; version bump)
- Modify: `src/extension.ts` (return `extendMarkdownIt`)

**Interfaces:**
- Consumes: `renderAll` from `./previewHost`; `installMermaidFence` from `./markdownItMermaid`; `mermaid` (bundled).
- Produces: `dist/preview.js`; manifest keys `markdown.markdownItPlugins`, `markdown.previewScripts`, `markdown.previewStyles`, `configuration.ceasg.previewRendering`.

- [ ] **Step 1: Create the browser entry** `src/preview/preview-inject.ts`:

```ts
import mermaid from 'mermaid';
import { renderAll } from './previewHost';

function run(): void {
  const dark =
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast');
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });
  void renderAll((id, src) => mermaid.render(id, src));
}

// previewScripts are re-run on every content change; the data-done guard in
// renderAll makes re-runs cheap and idempotent.
run();
document.addEventListener('DOMContentLoaded', run);
```

- [ ] **Step 2: Create `media/preview.css`** (container rules; diagram visuals come from `diagram.css`):

```css
.ceasg-diagram { display: block; margin: 1em 0; overflow-x: auto; }
.ceasg-diagram svg { display: block; }
.ceasg-diagram .ceasg-err { color: var(--vscode-errorForeground); white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
```

- [ ] **Step 3: Add the third esbuild entry.** In `esbuild.js`, after `webviewCtx`, add:

```js
	const previewCtx = await esbuild.context({
		...shared, entryPoints: ['src/preview/preview-inject.ts'], format: 'iife',
		platform: 'browser', outfile: 'dist/preview.js',
	});
```

Then include `previewCtx` in both the `watch` and the build branches:

```js
	if (watch) {
		await Promise.all([extensionCtx.watch(), webviewCtx.watch(), previewCtx.watch()]);
	} else {
		await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild(), previewCtx.rebuild()]);
		await Promise.all([extensionCtx.dispose(), webviewCtx.dispose(), previewCtx.dispose()]);
	}
```

- [ ] **Step 4: Update `package.json`.** Bump `"version"` to `"0.2.0"`. Replace the `contributes` block with (keeping the existing command):

```jsonc
  "contributes": {
    "commands": [
      { "command": "ceasg.openEditor", "title": "Mermaid: Open Visual Editor" }
    ],
    "markdown.markdownItPlugins": true,
    "markdown.previewScripts": ["./dist/preview.js"],
    "markdown.previewStyles": ["./media/diagram.css", "./media/preview.css"],
    "configuration": {
      "title": "ceasg",
      "properties": {
        "ceasg.previewRendering": {
          "type": "string",
          "enum": ["on", "off"],
          "default": "on",
          "description": "Render Mermaid diagrams in the built-in Markdown preview. Flowcharts use ceasg's positioned (comment-based) layout; other diagram types render with mermaid.js."
        }
      }
    }
  },
```

- [ ] **Step 5: Return `extendMarkdownIt` from `activate`.** In `src/extension.ts`, add the import and return value. The existing `activate` body stays; append a `return`:

```ts
import { installMermaidFence } from './preview/markdownItMermaid';
// ...existing imports and activate body (registrations) unchanged...

  return {
    extendMarkdownIt(md: unknown) {
      const enabled = () =>
        vscode.workspace.getConfiguration('ceasg').get<string>('previewRendering', 'on') !== 'off';
      return installMermaidFence(md as Parameters<typeof installMermaidFence>[0], enabled);
    },
  };
```

- [ ] **Step 6: Build and check types/lint.**

Run: `pnpm run compile`
Expected: PASS — type-check, lint, and all three bundles build; `dist/preview.js`, `dist/diagram.css` exist.
Run: `pnpm run test:unit`
Expected: PASS — all specs.

- [ ] **Step 7: Manual smoke test in the Extension Development Host.**

1. Press F5 (or Run → Start Debugging) to launch the Extension Development Host.
2. In that window, if the stock Mermaid Markdown extension is installed, disable it for this test.
3. Open `ceasg-test`'s sample Markdown file and open the built-in preview (`Ctrl+Shift+V`).
4. Verify: a **positioned** flowchart in the preview matches its visual-editor layout; an **unpositioned** flowchart renders auto-laid-out; a **non-flowchart** diagram (e.g. sequence) renders via mermaid; light/dark theme both look correct.
5. Toggle `ceasg.previewRendering` to `off`, reload the preview → mermaid blocks fall back to plain code fences. Toggle back to `on`.

Record the result of each check. If a positioned flowchart does **not** match the editor, stop and debug before continuing (compare `renderFlowchartToSvg` output vs. the editor's `renderDiagram` usage).

- [ ] **Step 8: Commit**

```bash
git add src/preview/preview-inject.ts media/preview.css esbuild.js package.json src/extension.ts
git commit -m "feat: render mermaid in built-in markdown preview via ceasg"
```

---

### Task 6: Package the VSIX and document install

Produce the installable build and hand the user an install command that replaces their existing marketplace install.

**Files:**
- Modify: `.vscodeignore` (only if it excludes `media/` or `dist/` — verify)
- Create: `docs/INSTALL-DEV.md`

**Interfaces:** none (packaging + docs).

- [ ] **Step 1: Confirm packaged files include the preview assets.** Build first, then list the package contents:

```bash
pnpm run package
pnpm exec vsce ls
```

Expected: the listing includes `dist/preview.js`, `dist/diagram.css`, `media/diagram.css`, `media/preview.css`. If any are missing, check `.vscodeignore` and remove the offending exclusion, then re-run `vsce ls`.

- [ ] **Step 2: Build the VSIX.**

```bash
pnpm exec vsce package
```

Expected: `ceasg-0.2.0.vsix` is written to the extension folder.

- [ ] **Step 3: Write `docs/INSTALL-DEV.md`** with the install steps:

```markdown
# Installing the local dev build

The local build shares the extension id `ceasg.ceasg` with the published
version, so installing the VSIX **replaces** the marketplace copy.

1. Build the VSIX (from the `extension/` folder):

   pnpm run package
   pnpm exec vsce package

2. Install it, overwriting the installed version:

   code --install-extension ceasg-0.2.0.vsix --force

3. Reload VS Code (Command Palette → "Developer: Reload Window").

4. Disable or uninstall any separate Mermaid **Markdown preview** extension so
   ceasg is the sole renderer, then open a Markdown preview (Ctrl+Shift+V).

To go back to the published version: uninstall ceasg, then reinstall it from the
Marketplace.
```

- [ ] **Step 4: Commit**

```bash
git add docs/INSTALL-DEV.md .vscodeignore
git commit -m "chore: package dev VSIX and document install"
```

Note: leave `ceasg-0.2.0.vsix` out of git (build artifact) unless it is already tracked.

---

## Self-Review

**Spec coverage:**
- Full replacement / sole renderer → Tasks 3, 5 (fence override for all mermaid blocks, no delegation to another extension).
- Flowcharts (positioned + unpositioned via dagre) → ceasg → Task 2 (`layoutMissing` + `renderDiagram`).
- Non-flowchart → bundled mermaid.js → Tasks 4, 5.
- markdown-it plugin + previewScripts/previewStyles architecture → Tasks 3, 5.
- SVG sizing via `computeContentBounds` → Task 2.
- Shared CSS partial (no editor/preview drift) → Task 1.
- Theming (light/dark) → Task 1 (VS Code vars for ceasg SVG) + Task 5 (mermaid theme from `vscode-dark`).
- Per-diagram error isolation → Task 4.
- `ceasg.previewRendering` setting, default on → Task 5.
- Unit + manual acceptance testing → Tasks 2–5.
- VSIX build + install command → Task 6.

**Placeholder scan:** No TBD/TODO; every code and test step has concrete content. The one guarded uncertainty (pos-comment coordinate format) has an explicit resolution step (Task 2 Step 5) pointing at existing specs, not a hand-wave.

**Type consistency:** `MermaidRender` defined in Task 4 and consumed in Task 5. `installMermaidFence`/`encodeSource` names consistent across Tasks 3–5. `isFlowchartSource`/`renderFlowchartToSvg` consistent across Tasks 2 and 4. `computeContentBounds` return shape matches its source. `activate` returns the `{ extendMarkdownIt }` object VS Code expects.
