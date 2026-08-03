import { Viewport } from './viewport';

/** Number of in-place label editors currently open. The wheel handler stands
 *  down while one is up: the textarea is positioned from the viewport once and
 *  never repositioned, so panning would strand it over the wrong node. */
let openCount = 0;

export function isLabelEditorOpen(): boolean { return openCount > 0; }

/** Open an in-place textarea over a canvas point (node center or edge-label midpoint).
 *  `w`/`h` are the target size in canvas units (scaled to screen); `minW`/`minH`
 *  are absolute screen-px floors (default 120×28) so callers that already size to
 *  their content — e.g. a subgraph title — can shrink below the node default. */
export function openLabelEditor(
  host: HTMLElement, viewport: Viewport, at: { x: number; y: number; text: string; w?: number; h?: number; minW?: number; minH?: number }, onCommit: (text: string) => void,
): void {
  const ta = document.createElement('textarea');
  ta.className = 'ceasg-label-editor';
  ta.value = at.text;
  const rect = host.getBoundingClientRect();
  // canvas point in screen space
  const scale = viewport.scale;
  const svgToScreen = (x: number, y: number) => {
    const p = viewport.screenToSvg(rect.left, rect.top);
    return { sx: rect.left + (x - p.x) * scale, sy: rect.top + (y - p.y) * scale };
  };
  const { sx, sy } = svgToScreen(at.x, at.y);
  // Match the target on-screen size, with a minimum floor (node default 120×28).
  const w = Math.max(at.minW ?? 120, (at.w ?? 0) * scale);
  const h = Math.max(at.minH ?? 28, (at.h ?? 0) * scale);
  ta.style.position = 'fixed';
  ta.style.left = `${sx - w / 2}px`;
  ta.style.top = `${sy - h / 2}px`;
  ta.style.width = `${w}px`;
  ta.style.height = `${h}px`;
  document.body.appendChild(ta);
  openCount += 1;
  ta.focus(); ta.select();

  let done = false;
  const finish = (commit: boolean) => {
    if (done) { return; }
    done = true;
    openCount -= 1;
    if (commit) { onCommit(ta.value); }
    ta.remove();
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  ta.addEventListener('blur', () => finish(true));
}
