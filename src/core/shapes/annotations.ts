import { polygon } from './primitives';
import type { ShapeDef } from './types';

/** Spike count for the bang starburst. Even, so spikes alternate in and out. */
const BANG_SPIKES = 12;

export const ANNOTATION_SHAPES: ShapeDef[] = [
  {
    name: 'bang',
    label: 'Bang',
    group: 'annotations',
    aliases: ['explosion'],
    size: (b) => ({ w: b.w + 40, h: b.h + 30 }),
    render: (g) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < BANG_SPIKES; i++) {
        // Outer radius reaches the box edge exactly; inner pulls back to 0.32.
        const r = i % 2 === 0 ? 0.5 : 0.32;
        const angle = (i * 2 * Math.PI) / BANG_SPIKES;
        pts.push([g.cx + r * g.w * Math.cos(angle), g.cy + r * g.h * Math.sin(angle)]);
      }
      return [polygon(pts)];
    },
  },
];
