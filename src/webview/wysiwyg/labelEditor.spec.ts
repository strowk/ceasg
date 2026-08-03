import { describe, it, expect, afterEach } from 'vitest';
import { openLabelEditor, isLabelEditorOpen } from './labelEditor';
import { Viewport } from './viewport';

function vp() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  const host = {
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLElement;
  return { v: new Viewport(svg, host), host };
}

describe('labelEditor', () => {
  afterEach(() => {
    // Clean up any leftover textareas between tests
    document.querySelectorAll('.ceasg-label-editor').forEach((el) => el.remove());
  });

  it('isLabelEditorOpen returns false initially', () => {
    expect(isLabelEditorOpen()).toBe(false);
  });

  it('Escape key closes without committing', () => {
    const { v, host } = vp();
    let committed = false;
    openLabelEditor(host, v, { x: 0, y: 0, text: 'original' }, () => {
      committed = true;
    });
    expect(isLabelEditorOpen()).toBe(true);

    const ta = document.querySelector('.ceasg-label-editor') as HTMLTextAreaElement;
    ta.value = 'modified';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(isLabelEditorOpen()).toBe(false);
    expect(committed).toBe(false);
  });

  it('Enter key closes and commits the edited value', () => {
    const { v, host } = vp();
    let committed = '';
    openLabelEditor(host, v, { x: 0, y: 0, text: 'original' }, (text) => {
      committed = text;
    });
    expect(isLabelEditorOpen()).toBe(true);

    const ta = document.querySelector('.ceasg-label-editor') as HTMLTextAreaElement;
    ta.value = 'modified';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(isLabelEditorOpen()).toBe(false);
    expect(committed).toBe('modified');
  });

  it('blur event closes and commits', () => {
    const { v, host } = vp();
    let committed = '';
    openLabelEditor(host, v, { x: 0, y: 0, text: 'original' }, (text) => {
      committed = text;
    });
    expect(isLabelEditorOpen()).toBe(true);

    const ta = document.querySelector('.ceasg-label-editor') as HTMLTextAreaElement;
    ta.value = 'blurred';
    ta.dispatchEvent(new FocusEvent('blur'));

    expect(isLabelEditorOpen()).toBe(false);
    expect(committed).toBe('blurred');
  });

  it('opening a second editor while one is open closes the first via blur', () => {
    const { v, host } = vp();
    let first_committed = '';
    let second_committed = '';

    // Open first editor
    openLabelEditor(host, v, { x: 0, y: 0, text: 'first' }, (text) => {
      first_committed = text;
    });
    expect(isLabelEditorOpen()).toBe(true);

    // Open second editor; focus() on it blurs the first, triggering its close
    openLabelEditor(host, v, { x: 100, y: 100, text: 'second' }, (text) => {
      second_committed = text;
    });

    // The first editor's onCommit should have fired due to blur from focus()
    expect(first_committed).toBe('first');

    // After the second open, count reflects: first closed (by blur), second open
    expect(isLabelEditorOpen()).toBe(true);

    // Close the second one
    const tas = document.querySelectorAll('.ceasg-label-editor');
    const secondTa = tas[tas.length - 1] as HTMLTextAreaElement;
    secondTa.value = 'modified second';
    secondTa.dispatchEvent(new FocusEvent('blur'));

    expect(isLabelEditorOpen()).toBe(false);
    expect(second_committed).toBe('modified second');
  });

  it('finish is idempotent via the done flag', () => {
    const { v, host } = vp();
    let callCount = 0;
    openLabelEditor(host, v, { x: 0, y: 0, text: 'test' }, () => {
      callCount += 1;
    });
    expect(isLabelEditorOpen()).toBe(true);

    const ta = document.querySelector('.ceasg-label-editor') as HTMLTextAreaElement;

    // First Enter closes it and commits
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false, bubbles: true }));
    expect(isLabelEditorOpen()).toBe(false);
    expect(callCount).toBe(1); // Commit on Enter

    // Second Enter does nothing (done flag prevents re-entry, element is removed)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false, bubbles: true }));
    expect(isLabelEditorOpen()).toBe(false);
    expect(callCount).toBe(1); // Still only 1 call, no double-commit, no count leak
  });
});
