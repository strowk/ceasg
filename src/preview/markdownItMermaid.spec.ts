import { describe, it, expect } from 'vitest';
import { encodeSource, installMermaidFence } from './markdownItMermaid';

// Minimal fake markdown-it renderer sufficient for the fence rule.
function makeMd() {
  return {
    renderer: {
      rules: {
        fence: (tokens: any, i: number) => `<pre>${tokens[i].content}</pre>`,
      },
    },
  };
}
const self = { renderToken: () => '' };

describe('installMermaidFence', () => {
  it('emits a placeholder carrying the base64 source for mermaid blocks', () => {
    const md = makeMd();
    installMermaidFence(md as any, () => true);
    const tokens = [{ info: 'mermaid', content: 'flowchart LR\nA-->B' }];
    const html = md.renderer.rules.fence!(tokens as any, 0, {}, {}, self as any);
    expect(html).toContain('class="ceasg-diagram"');
    expect(html).toContain(`data-src="${encodeSource('flowchart LR\nA-->B')}"`);
  });

  it('delegates non-mermaid blocks to the previous rule', () => {
    const md = makeMd();
    installMermaidFence(md as any, () => true);
    const tokens = [{ info: 'ts', content: 'const x = 1;' }];
    const html = md.renderer.rules.fence!(tokens as any, 0, {}, {}, self as any);
    expect(html).toBe('<pre>const x = 1;</pre>');
  });

  it('delegates mermaid blocks to the previous rule when disabled', () => {
    const md = makeMd();
    installMermaidFence(md as any, () => false);
    const tokens = [{ info: 'mermaid', content: 'flowchart LR\nA-->B' }];
    const html = md.renderer.rules.fence!(tokens as any, 0, {}, {}, self as any);
    expect(html).toBe('<pre>flowchart LR\nA-->B</pre>');
  });
});
