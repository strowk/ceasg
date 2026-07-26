import mermaid from 'mermaid';
import { HostToWebview, UpdateMessage } from '../../shared/messages';

export function mountPreview(root: HTMLElement, api: VsCodeApi): void {
  mermaid.initialize({ startOnLoad: false });
  root.innerHTML =
    '<div class="ceasg-preview"><div class="ceasg-render" id="render"></div>' +
    '<textarea class="ceasg-src" id="src" spellcheck="false"></textarea></div>';

  const renderEl = root.querySelector('#render') as HTMLDivElement;
  const srcEl = root.querySelector('#src') as HTMLTextAreaElement;

  let version = 0;
  let applyingExternal = false;
  let renderSeq = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const escapeHtml = (s: string): string =>
    s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

  async function render(source: string): Promise<void> {
    const seq = ++renderSeq;
    try {
      const { svg } = await mermaid.render(`ceasg-${seq}`, source);
      if (seq === renderSeq) { renderEl.innerHTML = svg; }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (seq === renderSeq) { renderEl.innerHTML = `<div class="ceasg-err">${escapeHtml(message)}</div>`; }
    }
  }

  srcEl.addEventListener('input', () => {
    if (applyingExternal) { return; }
    void render(srcEl.value);
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      version += 1;
      const msg: UpdateMessage = { type: 'update', source: srcEl.value, version };
      api.postMessage(msg);
    }, 150);
  });

  window.addEventListener('message', (ev: MessageEvent<HostToWebview>) => {
    const msg = ev.data;
    if (msg.type === 'init' || msg.type === 'externalUpdate') {
      applyingExternal = true;
      srcEl.value = msg.source;
      version = Math.max(version, msg.version);
      void render(msg.source);
      applyingExternal = false;
    }
  });
}
