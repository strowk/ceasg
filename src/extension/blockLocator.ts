import { PaneMode } from '../shared/messages';

export interface MermaidBlock {
  id: string | null;
  fenceStart: number;
  innerStart: number;
  innerEnd: number;
  source: string;
  type: string;
}

export function modeForType(type: string): PaneMode {
  return type === 'flowchart' ? 'wysiwyg' : 'preview';
}

const FENCE_OPEN = /^[ \t]*```mermaid[ \t\r]*$/;
const FENCE_CLOSE = /^[ \t]*```[ \t\r]*$/;
const ID_RE = /%%\s*ceasg:(\{[\s\S]*?\})\s*%%/;

export function findMermaidBlocks(text: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  const lines = text.split('\n');
  let offset = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (FENCE_OPEN.test(line)) {
      const fenceStart = offset;
      const innerStart = offset + line.length + 1;
      let scan = innerStart;
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (FENCE_CLOSE.test(lines[j])) { closed = true; break; }
        scan += lines[j].length + 1;
        j++;
      }
      if (closed) {
        const innerEnd = scan;
        const source = text.slice(innerStart, innerEnd);
        blocks.push({ id: extractId(source), fenceStart, innerStart, innerEnd, source, type: sniffType(source) });
        offset = scan + lines[j].length + 1;
        i = j + 1;
        continue;
      }
    }
    offset += line.length + 1;
    i++;
  }
  return blocks;
}

export function extractId(source: string): string | null {
  const m = source.match(ID_RE);
  if (!m) { return null; }
  try {
    const data = JSON.parse(m[1]) as { id?: unknown };
    return typeof data.id === 'string' ? data.id : null;
  } catch { return null; }
}

export function sniffType(source: string): string {
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('%%')) { continue; }
    const kw = line.split(/[\s({]/)[0].toLowerCase();
    if (kw === 'graph' || kw === 'flowchart') { return 'flowchart'; }
    if (kw === 'sequencediagram') { return 'sequence'; }
    if (kw === 'classdiagram') { return 'class'; }
    if (kw === 'statediagram' || kw === 'statediagram-v2') { return 'state'; }
    if (kw === 'erdiagram') { return 'er'; }
    return kw || 'unknown';
  }
  return 'unknown';
}
