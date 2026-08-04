import { describe, it, expect, vi } from 'vitest';
import { NODE_SHAPES } from '../../core';
import type { WysiwygEditor } from './editor';
import { ShapeSidebar } from './sidebar';

function make() {
  const host = document.createElement('div');
  const addNodeAtFreeSpot = vi.fn();
  const editor = { addNodeAtFreeSpot } as unknown as WysiwygEditor;
  let state: unknown = undefined;
  const api = { postMessage() {}, getState: () => state, setState: (s: unknown) => { state = s; } };
  const sidebar = new ShapeSidebar(host, editor, api);
  return { host, sidebar, addNodeAtFreeSpot };
}

describe('ShapeSidebar', () => {
  it('renders six group headers and one button per shape overall, only Basic expanded', () => {
    const { host } = make();
    expect(host.classList.contains('ceasg-sidebar')).toBe(true);
    expect(host.querySelectorAll('.ceasg-sidebar-group')).toHaveLength(6);
    expect(host.querySelectorAll('.ceasg-palette-item')).toHaveLength(NODE_SHAPES.length);
    const headers = Array.from(host.querySelectorAll('.ceasg-sidebar-group-header'));
    expect(headers[0]!.textContent).toContain('Basic');
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('true');
    for (const header of headers.slice(1)) {
      expect(header.getAttribute('aria-expanded')).toBe('false');
    }
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

  it('toggle(force) overrides the current state rather than just flipping it', () => {
    const { host, sidebar } = make();
    expect(sidebar.isOpen).toBe(true);

    // From open, force-close: returns false and hides.
    expect(sidebar.toggle(false)).toBe(false);
    expect(host.style.display).toBe('none');

    // Force-close again from already-closed: stays false/hidden (idempotent,
    // not flipped back open — proves `force` is honored, not just !open).
    expect(sidebar.toggle(false)).toBe(false);
    expect(host.style.display).toBe('none');

    // From closed, force-open: returns true and shows.
    expect(sidebar.toggle(true)).toBe(true);
    expect(host.style.display).toBe('');
  });
});

describe('ShapeSidebar expansion state', () => {
  const fakeApi = () => {
    let state: unknown = undefined;
    return { postMessage() {}, getState: () => state, setState: (s: unknown) => { state = s; } };
  };

  it('opens Basic and collapses the rest by default', () => {
    const host = document.createElement('div');
    new ShapeSidebar(host, {} as never, fakeApi());
    const groups = Array.from(host.querySelectorAll('.ceasg-sidebar-group'));
    expect(groups).toHaveLength(6);
    expect(groups[0]!.classList.contains('is-collapsed')).toBe(false);
    for (const g of groups.slice(1)) {
      expect(g.classList.contains('is-collapsed')).toBe(true);
    }
  });

  it('persists a toggle through webview state', () => {
    const api = fakeApi();
    const first = document.createElement('div');
    new ShapeSidebar(first, {} as never, api);
    (first.querySelectorAll('.ceasg-sidebar-group-header')[2] as HTMLElement).click();

    const second = document.createElement('div');
    new ShapeSidebar(second, {} as never, api);
    const groups = Array.from(second.querySelectorAll('.ceasg-sidebar-group'));
    expect(groups[2]!.classList.contains('is-collapsed')).toBe(false);
  });
});
