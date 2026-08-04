import type { WysiwygEditor } from './editor';
import { PALETTE_GROUPS, PaletteGroup, createPaletteItemButton } from './paletteModel';

/** Groups collapsed on first open. Basic stays expanded; 48 shapes expanded at
 *  once is an unusable sidebar. */
const DEFAULT_COLLAPSED = ['process', 'data', 'documents', 'flow', 'annotations'];

interface SidebarState { collapsedGroups?: string[] }

/** Persistent left palette: shapes in collapsible groups, alongside (not
 *  replacing) the toolbar dropdown. Which groups are collapsed persists
 *  through webview state, so it survives the panel being hidden/reopened. */
export class ShapeSidebar {
  private open = true;
  private collapsed: Set<string>;

  constructor(
    private readonly host: HTMLElement,
    private readonly editor: WysiwygEditor,
    private readonly api: VsCodeApi,
  ) {
    const saved = (this.api.getState() as SidebarState | undefined)?.collapsedGroups;
    this.collapsed = new Set(saved ?? DEFAULT_COLLAPSED);
    // Class goes on the host so the host itself is the flex item in
    // .ceasg-body and `display: none` collapses it without leaving a gap.
    this.host.classList.add('ceasg-sidebar');
    for (const group of PALETTE_GROUPS) {
      this.host.appendChild(this.buildGroup(group));
    }
  }

  private persist(): void {
    const state = (this.api.getState() as Record<string, unknown> | undefined) ?? {};
    this.api.setState({ ...state, collapsedGroups: Array.from(this.collapsed) });
  }

  private buildGroup(group: PaletteGroup): HTMLElement {
    const section = document.createElement('div');
    section.className = 'ceasg-sidebar-group';
    section.dataset.groupId = group.id;

    const header = document.createElement('button');
    header.className = 'ceasg-sidebar-group-header';
    header.type = 'button';
    const chevron = document.createElement('span');
    chevron.className = 'ceasg-chevron';
    chevron.textContent = '▾';
    header.appendChild(chevron);
    header.appendChild(document.createTextNode(group.title));

    const startCollapsed = this.collapsed.has(group.id);
    if (startCollapsed) { section.classList.add('is-collapsed'); }
    header.setAttribute('aria-expanded', startCollapsed ? 'false' : 'true');
    header.addEventListener('click', () => {
      const collapsed = section.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (collapsed) { this.collapsed.add(group.id); } else { this.collapsed.delete(group.id); }
      this.persist();
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
