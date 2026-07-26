import { DiagramNode } from '../../core';
import { Viewport } from './viewport';

export function openLabelEditor(
  host: HTMLElement, viewport: Viewport, node: DiagramNode, onCommit: (text: string) => void,
): void {
  const ta = document.createElement('textarea');
  ta.className = 'ceasg-label-editor';
  ta.value = node.label;
  const rect = host.getBoundingClientRect();
  // node center in screen space
  const scale = viewport.scale;
  const svgToScreen = (x: number, y: number) => {
    const p = viewport.screenToSvg(rect.left, rect.top);
    return { sx: rect.left + (x - p.x) * scale, sy: rect.top + (y - p.y) * scale };
  };
  const { sx, sy } = svgToScreen(node.x, node.y);
  ta.style.position = 'fixed';
  ta.style.left = `${sx - 60}px`;
  ta.style.top = `${sy - 14}px`;
  ta.style.width = '120px';
  document.body.appendChild(ta);
  ta.focus(); ta.select();

  let done = false;
  const finish = (commit: boolean) => {
    if (done) { return; }
    done = true;
    if (commit) { onCommit(ta.value); }
    ta.remove();
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  ta.addEventListener('blur', () => finish(true));
}
