import { describe, it, expect } from 'vitest';
import { isUpdateMessage, isReadyMessage, isDiagnosticMessage } from '../shared/messages';

describe('message guards', () => {
  it('accepts a well-formed update', () => {
    expect(isUpdateMessage({ type: 'update', source: 'graph TD', version: 3 })).toBe(true);
  });
  it('rejects bad version', () => {
    expect(isUpdateMessage({ type: 'update', source: 'x', version: '3' })).toBe(false);
  });
  it('rejects other shapes', () => {
    expect(isUpdateMessage({ type: 'init' })).toBe(false);
    expect(isUpdateMessage(null)).toBe(false);
  });
  it('recognises ready', () => {
    expect(isReadyMessage({ type: 'ready' })).toBe(true);
    expect(isReadyMessage({ type: 'update' })).toBe(false);
  });
});

describe('isDiagnosticMessage', () => {
  it('accepts a well-formed diagnostic', () => {
    expect(isDiagnosticMessage({
      type: 'diagnostic', code: 'unknown-shape', key: 'clod', message: 'x',
    })).toBe(true);
  });

  it('rejects other message types and malformed payloads', () => {
    expect(isDiagnosticMessage({ type: 'ready' })).toBe(false);
    expect(isDiagnosticMessage({ type: 'diagnostic', code: 'x' })).toBe(false);
    expect(isDiagnosticMessage(null)).toBe(false);
  });
});
