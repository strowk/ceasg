import { HostToWebview } from '../shared/messages';
import { mountPreview } from './preview/preview';

const api = acquireVsCodeApi();
const root = document.getElementById('app') as HTMLElement;

let mounted = false;
window.addEventListener('message', (ev: MessageEvent<HostToWebview>) => {
  const msg = ev.data;
  if (msg.type === 'init' && !mounted) {
    mounted = true;
    // Phase 3 adds: if (msg.mode === 'wysiwyg') mountWysiwyg(root, api); else ...
    mountPreview(root, api);
    // Re-dispatch init so the mounted view initialises its state.
    window.dispatchEvent(new MessageEvent('message', { data: msg }));
  }
});

api.postMessage({ type: 'ready' });
