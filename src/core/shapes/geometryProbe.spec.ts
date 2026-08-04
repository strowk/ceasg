import { describe, it, expect } from 'vitest';
import { probeBounds } from './geometryProbe';
import { path } from './primitives';

describe('probeBounds', () => {
  it('rejects a relative path command rather than silently treating it as absolute', () => {
    // `l` (relative line) after an absolute `M` should never appear in output
    // the primitives emit — pathPoints only understands absolute commands.
    // Mis-parsing it as `L` would silently read wrong coordinates instead of
    // flagging the shape that produced it.
    const el = path('M 100,100 l 50,0');
    expect(() => probeBounds([el])).toThrow(/relative.*l/i);
  });

  it('still parses absolute commands correctly (control case)', () => {
    const el = path('M 100,100 L 150,100');
    expect(probeBounds([el])).toEqual({ minX: 100, minY: 100, maxX: 150, maxY: 100 });
  });
});
