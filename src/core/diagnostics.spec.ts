import { describe, it, expect, beforeEach } from 'vitest';
import {
  warn, setDiagnosticSink, setDiagnosticScope, clearDiagnostics, DEDUPE_LIMIT,
  formatDiagnostic,
} from './diagnostics';
import type { Diagnostic } from './diagnostics';

describe('diagnostics', () => {
  let seen: Diagnostic[];

  beforeEach(() => {
    seen = [];
    setDiagnosticSink((d) => seen.push(d));
    setDiagnosticScope('doc-a');
    clearDiagnostics();
  });

  it('forwards a warning to the sink', () => {
    warn('unknown-shape', 'clod', 'Unknown Mermaid shape "clod".');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ code: 'unknown-shape', key: 'clod' });
  });

  it('suppresses a repeat with the same code, key and scope', () => {
    for (let i = 0; i < 50; i++) { warn('unknown-shape', 'clod', 'x'); }
    expect(seen).toHaveLength(1);
  });

  it('does not suppress a different key under the same code', () => {
    warn('unknown-shape', 'clod', 'x');
    warn('unknown-shape', 'bogus', 'x');
    expect(seen).toHaveLength(2);
  });

  it('does not suppress the same key under a different scope', () => {
    warn('unknown-shape', 'clod', 'x');
    setDiagnosticScope('doc-b');
    warn('unknown-shape', 'clod', 'x');
    expect(seen).toHaveLength(2);
  });

  it('clearing a scope lets its warnings report again', () => {
    warn('unknown-shape', 'clod', 'x');
    clearDiagnostics('doc-a');
    warn('unknown-shape', 'clod', 'x');
    expect(seen).toHaveLength(2);
  });

  it('clearing one scope leaves another suppressed', () => {
    warn('unknown-shape', 'clod', 'x');
    setDiagnosticScope('doc-b');
    warn('unknown-shape', 'clod', 'x');
    clearDiagnostics('doc-b');
    setDiagnosticScope('doc-a');
    warn('unknown-shape', 'clod', 'x');
    expect(seen).toHaveLength(2);
  });

  it('drops oldest entries past the cap so the set cannot grow unbounded', () => {
    for (let i = 0; i < DEDUPE_LIMIT + 5; i++) { warn('unknown-shape', `k${i}`, 'x'); }
    expect(seen).toHaveLength(DEDUPE_LIMIT + 5);
    // k0 was evicted by the cap, so it reports a second time.
    warn('unknown-shape', 'k0', 'x');
    expect(seen).toHaveLength(DEDUPE_LIMIT + 6);
  });

  it('never throws when the sink itself throws', () => {
    setDiagnosticSink(() => { throw new Error('sink exploded'); });
    expect(() => warn('unknown-shape', 'x', 'y')).not.toThrow();
  });
});

describe('formatDiagnostic', () => {
  it('renders code and message on one line', () => {
    expect(formatDiagnostic({ code: 'unknown-shape', key: 'clod', message: 'Unknown shape "clod".' }))
      .toBe('[unknown-shape] Unknown shape "clod".');
  });

  it('appends detail when present', () => {
    expect(formatDiagnostic({
      code: 'layout-failed', key: 'e', message: 'Auto layout failed.', detail: 'boom',
    })).toBe('[layout-failed] Auto layout failed. — boom');
  });
});
