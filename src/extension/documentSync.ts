import { findMermaidBlocks, MermaidBlock } from './blockLocator';

function ensureTrailingNewline(s: string): string { return s.endsWith('\n') ? s : s + '\n'; }

export function locateById(text: string, id: string): MermaidBlock | undefined {
  return findMermaidBlocks(text).find((b) => b.id === id);
}

export function computeInnerEdit(
  text: string, id: string, newSource: string,
): { start: number; end: number; replacement: string } | null {
  const block = locateById(text, id);
  if (!block) { return null; }
  const replacement = ensureTrailingNewline(newSource);
  if (block.source === replacement) { return null; }
  return { start: block.innerStart, end: block.innerEnd, replacement };
}
