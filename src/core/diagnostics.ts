/*
 * Reporting seam for degraded rendering, mirroring the dom.ts accessor shim.
 *
 * Core runs in three runtimes: the extension host (which has the vscode API),
 * the WYSIWYG webview (which can postMessage to the host), and the Markdown
 * preview (which can do neither). Core code must never import vscode, so it
 * emits through this seam and each runtime installs the best sink it has.
 */

export type DiagnosticCode =
  | 'unknown-shape'
  | 'shape-lookup-miss'
  | 'alias-collision'
  | 'layout-failed';

export interface Diagnostic {
  code: DiagnosticCode;
  /** Identifies the specific occurrence: a shape name, an alias, an error text. */
  key: string;
  message: string;
  detail?: string;
}

export type DiagnosticSink = (d: Diagnostic) => void;

/**
 * Per-scope suppression cap. The realistic count is one or two; the cap exists
 * so a pathological generated file cannot grow the set without limit.
 */
export const DEDUPE_LIMIT = 200;

/** Works in all three runtimes; replaced by the host with an output channel. */
const consoleSink: DiagnosticSink = (d) => {
  console.warn(`[ceasg] ${d.code}: ${d.message}`, d.detail ?? '');
};

let sink: DiagnosticSink = consoleSink;
/** Document identity, so one file's warning cannot silence another's. */
let scope = 'default';
const seen = new Map<string, Set<string>>();

export function setDiagnosticSink(next: DiagnosticSink): void {
  sink = next;
}

export function setDiagnosticScope(next: string): void {
  scope = next;
}

/**
 * Forget suppressions. Called when a document closes or its panel is disposed,
 * so reopening a file reports its problems afresh. With no argument, clears all
 * scopes (used by tests and on deactivate).
 */
export function clearDiagnostics(target?: string): void {
  if (target === undefined) { seen.clear(); } else { seen.delete(target); }
}

/**
 * Report a degradation once per code+key+scope. Parsing and rendering both
 * re-run on every keystroke, so an un-deduped warning would flood the channel
 * within seconds.
 *
 * Never throws: this is called from render paths where an exception would blank
 * the whole diagram in the Markdown preview.
 */
export function warn(
  code: DiagnosticCode, key: string, message: string, detail?: string,
): void {
  try {
    let keys = seen.get(scope);
    if (!keys) { keys = new Set(); seen.set(scope, keys); }
    const id = `${code} ${key}`;
    if (keys.has(id)) { return; }
    if (keys.size >= DEDUPE_LIMIT) {
      // Sets iterate in insertion order, so the first entry is the oldest.
      const oldest = keys.values().next().value;
      if (oldest !== undefined) { keys.delete(oldest); }
    }
    keys.add(id);
    sink({ code, key, message, detail });
  } catch {
    // A broken sink must not take the renderer down with it.
  }
}
