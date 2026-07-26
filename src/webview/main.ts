import { HostToWebview } from '../shared/messages';
import { mountPreview } from './preview/preview';
import { WysiwygEditor } from './wysiwyg/editor';

const api = acquireVsCodeApi();
const root = document.getElementById('app') as HTMLElement;

let mounted = false;
window.addEventListener('message', (ev: MessageEvent<HostToWebview>) => {
  const msg = ev.data;
  if (msg.type === 'init' && !mounted) {
    mounted = true;
    if (msg.mode === 'wysiwyg') {
      const editor = new WysiwygEditor(root, api);
      editor.init(msg.source);
    } else {
      mountPreview(root, api);
      window.dispatchEvent(new MessageEvent('message', { data: msg }));
    }
  }
});
api.postMessage({ type: 'ready' });
