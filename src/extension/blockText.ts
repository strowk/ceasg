import { MermaidBlock } from './blockLocator';

const ID_PRESENT = /%%\s*ceasg:\{[\s\S]*?\}\s*%%/;

function ensureTrailingNewline(s: string): string { return s.endsWith('\n') ? s : s + '\n'; }

export function replaceBlockInner(text: string, block: MermaidBlock, newInner: string): string {
  return text.slice(0, block.innerStart) + ensureTrailingNewline(newInner) + text.slice(block.innerEnd);
}

export function ensureBlockId(source: string, id: string): string {
  if (ID_PRESENT.test(source)) { return source; }
  return `%% ceasg:${JSON.stringify({ id })} %%\n${source}`;
}
