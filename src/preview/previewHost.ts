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
