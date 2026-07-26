import { describe, it, expect } from 'vitest';
import { isUpdateMessage, isReadyMessage } from '../shared/messages';

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
