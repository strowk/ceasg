// Structural typing for the slice of markdown-it we use. VS Code provides the
// real instance at runtime; we never import the markdown-it package.
interface MdToken { info: string; content: string; }
interface MdSelf { renderToken(tokens: MdToken[], idx: number, options: unknown): string; }
type MdFenceRule = (tokens: MdToken[], idx: number, options: unknown, env: unknown, self: MdSelf) => string;
interface MarkdownIt { renderer: { rules: { fence?: MdFenceRule } }; }

/** Base64-encode UTF-8 source for safe embedding in an HTML attribute. */
export function encodeSource(src: string): string {
  return Buffer.from(src, 'utf8').toString('base64');
}

/**
 * Override the fenced-code renderer: mermaid blocks become a placeholder the
 * preview script fills in; everything else falls through to the prior rule.
 */
export function installMermaidFence(md: MarkdownIt, isEnabled: () => boolean): MarkdownIt {
  const prev: MdFenceRule =
    md.renderer.rules.fence ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = (token.info || '').trim().split(/\s+/)[0];
    if (lang === 'mermaid' && isEnabled()) {
      return `<div class="ceasg-diagram" data-src="${encodeSource(token.content)}"></div>`;
    }
    return prev(tokens, idx, options, env, self);
  };
  return md;
}
