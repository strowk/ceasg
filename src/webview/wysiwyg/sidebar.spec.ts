import { describe, it, expect, vi } from 'vitest';
import { NODE_SHAPES } from '../../core';
import type { WysiwygEditor } from './editor';
import { ShapeSidebar } from './sidebar';

function make() {
  const host = document.createElement('div');
  const addNodeAtFreeSpot = vi.fn();
  const editor = { addNodeAtFreeSpot } as unknown as WysiwygEditor;
  const sidebar = new ShapeSidebar(host, editor);
  return { host, sidebar, addNodeAtFreeSpot };
}

describe('ShapeSidebar', () => {
  it('renders a group header and one button per shape, expanded by default', () => {
    const { host } = make();
    expect(host.classList.contains('ceasg-sidebar')).toBe(true);
    expect(host.querySelectorAll('.ceasg-sidebar-group')).toHaveLength(1);
    expect(host.querySelectorAll('.ceasg-palette-item')).toHaveLength(NODE_SHAPES.length);
    const header = host.querySelector('.ceasg-sidebar-group-header') as HTMLButtonElement;
    expect(header.textContent).toContain('Basic');
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses and re-expands a group when its header is clicked', () => {
    const { host } = make();
    const header = host.querySelector('.ceasg-sidebar-group-header') as HTMLButtonElement;
    const group = host.querySelector('.ceasg-sidebar-group') as HTMLElement;

    header.click();
    expect(group.classList.contains('is-collapsed')).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('false');

    header.click();
    expect(group.classList.contains('is-collapsed')).toBe(false);
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('adds a node at a free spot when an item is clicked', () => {
    const { host, addNodeAtFreeSpot } = make();
    const first = host.querySelector('.ceasg-palette-item') as HTMLButtonElement;
    first.click();
    expect(addNodeAtFreeSpot).toHaveBeenCalledWith(NODE_SHAPES[0]);
  });

  it('toggle() hides and shows the whole sidebar and reports the new state', () => {
    const { host, sidebar } = make();
    expect(sidebar.isOpen).toBe(true);

    expect(sidebar.toggle()).toBe(false);
    expect(host.style.display).toBe('none');

    expect(sidebar.toggle()).toBe(true);
    expect(host.style.display).toBe('');

    expect(sidebar.toggle(true)).toBe(true);
    expect(host.style.display).toBe('');
  });
});
