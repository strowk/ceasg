import { NODE_SHAPES, NodeShape, SHAPE_LABELS, createShapeIcon } from '../../core';
import type { WysiwygEditor } from './editor';

export class ShapePalette {
  private popover: HTMLElement;
  private open = false;
  constructor(private readonly editor: WysiwygEditor, private readonly anchor: HTMLElement) {
    this.popover = document.createElement('div');
    this.popover.className = 'ceasg-palette';
    this.popover.style.display = 'none';
    for (const shape of NODE_SHAPES) {
      const item = document.createElement('button');
      item.className = 'ceasg-palette-item';
      item.title = SHAPE_LABELS[shape];
      item.draggable = true;
      item.appendChild(createShapeIcon(shape));
      item.addEventListener('click', () => {
        this.editor.addNodeOfShape(shape, window.innerWidth / 2, window.innerHeight / 2);
        this.toggle(false);
      });
      item.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/ceasg-shape', shape); });
      this.popover.appendChild(item);
    }
    document.body.appendChild(this.popover);
  }
  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.popover.style.display = this.open ? 'grid' : 'none';
    if (this.open) {
      const r = this.anchor.getBoundingClientRect();
      this.popover.style.position = 'fixed';
      this.popover.style.left = `${r.left}px`;
      this.popover.style.top = `${r.bottom}px`;
    }
  }
}
