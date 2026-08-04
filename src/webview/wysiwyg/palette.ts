import type { WysiwygEditor } from './editor';
import { PALETTE_GROUPS, createPaletteItemButton } from './paletteModel';

export class ShapePalette {
  private popover: HTMLElement;
  private open = false;
  constructor(private readonly editor: WysiwygEditor, private readonly anchor: HTMLElement) {
    this.popover = document.createElement('div');
    this.popover.className = 'ceasg-palette';
    this.popover.style.display = 'none';
    for (const group of PALETTE_GROUPS) {
      const heading = document.createElement('div');
      heading.className = 'ceasg-palette-heading';
      heading.textContent = group.title;
      this.popover.appendChild(heading);
      for (const item of group.items) {
        this.popover.appendChild(createPaletteItemButton(item, (it) => {
          it.add(this.editor);
          this.toggle(false);
        }));
      }
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
