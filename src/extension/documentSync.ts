import { findMermaidBlocks, MermaidBlock } from './blockLocator';
import { ensureTrailingNewline } from './blockText';

export function locateById(text: string, id: string): MermaidBlock | undefined {
  return findMermaidBlocks(text).find((b) => b.id === id);
}

export function computeInnerEdit(
  text: string, id: string, newSource: string,
): { start: number; end: number; replacement: string } | null {
  const block = locateById(text, id);
  if (!block) { return null; }
  const replacement = ensureTrailingNewline(newSource);
  const normalizedCurrent = block.source.replace(/\r\n/g, '\n');
  const normalizedReplacement = replacement.replace(/\r\n/g, '\n');
  if (normalizedCurrent === normalizedReplacement) { return null; }
  return { start: block.innerStart, end: block.innerEnd, replacement };
}

export function sameMermaidSource(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
}
