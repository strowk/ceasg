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
