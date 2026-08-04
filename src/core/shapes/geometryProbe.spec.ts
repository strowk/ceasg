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

  it('parses a scientific-notation coordinate rather than mistaking its exponent for a command', () => {
    // Number.prototype.toString() emits e.g. "1e-5" for near-zero residuals —
    // exactly what trig-based curve/arc math (Task 13) produces. The whole
    // token contains a lowercase "e", but it is one numeric token, not a
    // relative command letter.
    const el = path('M 1e-5,1e-5 L 100,100');
    expect(() => probeBounds([el])).not.toThrow();
    expect(probeBounds([el])).toEqual({ minX: 1e-5, minY: 1e-5, maxX: 100, maxY: 100 });
  });

  it('accepts lowercase z alongside Z, since closepath takes no coordinates', () => {
    const el = path('M 0,0 L 10,0 L 10,10 z');
    expect(() => probeBounds([el])).not.toThrow();
  });

  it('still rejects every other lowercase command', () => {
    for (const rel of ['m', 'l', 'h', 'v', 'c', 's', 'q', 't', 'a']) {
      const el = path(`M 0,0 ${rel} 1,1`);
      expect(() => probeBounds([el]), rel).toThrow(/relative/i);
    }
  });
});
