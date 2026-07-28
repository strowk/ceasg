import { NODE_SHAPES, NodeShape, SHAPE_LABELS, createShapeIcon } from '../../core';
import type { WysiwygEditor } from './editor';

/** dataTransfer type for a shape dragged from any palette onto the canvas.
 *  The canvas drop handler in editor.ts reads this exact string. */
export const SHAPE_DRAG_TYPE = 'text/ceasg-shape';

export interface PaletteItem {
  /** Namespaced so future groups (images, icon packs) cannot collide. */
  id: string;
  title: string;
  createIcon(): SVGElement;
  dragType: string;
  dragData: string;
  /** Insert this item into the diagram. Given `at`, place it there (a drop);
   *  otherwise let the editor pick a free spot near the canvas centre.
   *  Lives on the item so a future image group can add itself differently
   *  without either palette UI having to know about it. */
  add(editor: WysiwygEditor, at?: { clientX: number; clientY: number }): void;
}

export interface PaletteGroup {
  id: string;
  title: string;
  items: PaletteItem[];
}

function shapeItem(shape: NodeShape): PaletteItem {
  return {
    id: `shape:${shape}`,
    title: SHAPE_LABELS[shape],
    createIcon: () => createShapeIcon(shape),
    dragType: SHAPE_DRAG_TYPE,
    dragData: shape,
    add: (editor, at) => {
      if (at) { editor.addNodeOfShape(shape, at.clientX, at.clientY); }
      else { editor.addNodeAtFreeSpot(shape); }
    },
  };
}

/** Every palette group, in display order. Both the toolbar dropdown and the
 *  sidebar render from this; adding a group is one entry here. */
export const PALETTE_GROUPS: PaletteGroup[] = [
  { id: 'basic', title: 'Basic', items: NODE_SHAPES.map(shapeItem) },
];

/** The single definition of a palette item button, so the dropdown and the
 *  sidebar stay pixel-identical and the drag payload is written in one place. */
export function createPaletteItemButton(
  item: PaletteItem,
  onActivate: (item: PaletteItem) => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'ceasg-palette-item';
  btn.title = item.title;
  btn.draggable = true;
  btn.appendChild(item.createIcon());
  btn.addEventListener('click', () => onActivate(item));
  btn.addEventListener('dragstart', (e) => {
    (e as DragEvent).dataTransfer?.setData(item.dragType, item.dragData);
  });
  return btn;
}
