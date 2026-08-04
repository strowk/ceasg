import { writeFileSync } from 'node:fs';
import { ALL_SHAPES, buildGallery } from '../src/core';

writeFileSync('docs/shape-gallery.md', buildGallery(), 'utf8');
console.log(`wrote docs/shape-gallery.md (${ALL_SHAPES.length} shapes)`);
