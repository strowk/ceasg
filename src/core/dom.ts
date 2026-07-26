/** Single seam replacing Obsidian's `activeDocument` global. In a VS Code webview
 *  the standard `document` is correct; under vitest, jsdom provides it. */
export function getDocument(): Document {
  if (typeof document !== 'undefined') { return document; }
  throw new Error('ceasg core: no document available in this environment');
}
