import type { WysiwygEditor } from './editor';
import { PALETTE_GROUPS, PaletteGroup, createPaletteItemButton } from './paletteModel';

/** Persistent left palette: shapes in collapsible groups, alongside (not
 *  replacing) the toolbar dropdown. Open/collapsed state is per webview
 *  session — it lives on this instance and is not persisted. */
export class ShapeSidebar {
  private open = true;

  constructor(private readonly host: HTMLElement, private readonly editor: WysiwygEditor) {
    // Class goes on the host so the host itself is the flex item in
    // .ceasg-body and `display: none` collapses it without leaving a gap.
    this.host.classList.add('ceasg-sidebar');
    for (const group of PALETTE_GROUPS) {
      this.host.appendChild(this.buildGroup(group));
    }
  }

  private buildGroup(group: PaletteGroup): HTMLElement {
    const section = document.createElement('div');
    section.className = 'ceasg-sidebar-group';
    section.dataset.groupId = group.id;

    const header = document.createElement('button');
    header.className = 'ceasg-sidebar-group-header';
    header.type = 'button';
    header.setAttribute('aria-expanded', 'true');
    const chevron = document.createElement('span');
    chevron.className = 'ceasg-chevron';
    chevron.textContent = '▾';
    header.appendChild(chevron);
    header.appendChild(document.createTextNode(group.title));
    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'ceasg-sidebar-group-body';
    for (const item of group.items) {
      body.appendChild(createPaletteItemButton(item, (it) => it.add(this.editor)));
    }
    section.appendChild(body);
    return section;
  }

  get isOpen(): boolean { return this.open; }

  /** Show or hide the sidebar. Returns the resulting open state. */
  toggle(force?: boolean): boolean {
    this.open = force ?? !this.open;
    this.host.style.display = this.open ? '' : 'none';
    return this.open;
  }
}
