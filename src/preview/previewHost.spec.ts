import { describe, it, expect, vi } from 'vitest';
import { decodeSource, processElement, renderAll, renderAllFresh, startPreview } from './previewHost';
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

describe('renderAllFresh', () => {
  // VS Code's incremental preview update can leave a stale data-done marker on
  // an emptied placeholder; a fresh pass must clear markers and re-render.
  it('re-renders a placeholder even if it is already marked data-done', async () => {
    document.body.innerHTML = '';
    const el = placeholder('flowchart LR\nA-->B');
    el.setAttribute('data-done', '1'); // marker survived but content was blanked
    document.body.append(el);
    await renderAllFresh(noMermaid);
    expect(el.querySelector('svg[data-node-id], svg [data-node-id]')).toBeTruthy();
  });
});

describe('startPreview', () => {
  it('re-renders diagrams when the preview content updates', async () => {
    document.body.innerHTML = '';
    startPreview(noMermaid); // initial pass sees no placeholders
    // Simulate VS Code morphing new content into the existing preview DOM.
    document.body.append(placeholder('flowchart LR\nA-->B'));
    window.dispatchEvent(new Event('vscode.markdown.updateContent'));
    await new Promise((r) => setTimeout(r));
    expect(document.querySelector('.ceasg-diagram[data-done]')).toBeTruthy();
    expect(document.querySelector('.ceasg-diagram svg [data-node-id], .ceasg-diagram svg[data-node-id]')).toBeTruthy();
  });
});
