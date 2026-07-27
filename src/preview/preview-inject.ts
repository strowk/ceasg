import mermaid from 'mermaid';
import { startPreview } from './previewHost';

const dark =
  document.body.classList.contains('vscode-dark') ||
  document.body.classList.contains('vscode-high-contrast');
mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });

// Contributed preview scripts run once at load; startPreview also re-renders on
// VS Code's `vscode.markdown.updateContent` event so diagrams survive edits.
startPreview((id, src) => mermaid.render(id, src));
