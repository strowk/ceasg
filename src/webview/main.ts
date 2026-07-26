import { HostToWebview } from '../shared/messages';
import { mountPreview } from './preview/preview';
import { WysiwygEditor } from './wysiwyg/editor';

const api = acquireVsCodeApi();
const root = document.getElementById('app') as HTMLElement;

let mounted = false;
let view: { applyExternal(s: string): void } | null = null;
window.addEventListener('message', (ev: MessageEvent<HostToWebview>) => {
  const msg = ev.data;
  if (msg.type === 'init' && !mounted) {
    mounted = true;
    if (msg.mode === 'wysiwyg') {
      const editor = new WysiwygEditor(root, api);
      editor.init(msg.source);
      view = editor;
    } else {
      mountPreview(root, api);
      window.dispatchEvent(new MessageEvent('message', { data: msg }));
    }
  } else if (msg.type === 'externalUpdate' && view) {
    view.applyExternal(msg.source);
  }
});
api.postMessage({ type: 'ready' });
