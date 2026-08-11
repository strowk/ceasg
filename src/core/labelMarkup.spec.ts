import { describe, it, expect } from 'vitest';
import { parseLabelMarkup } from './labelMarkup';

describe('parseLabelMarkup — plain text', () => {
  it('returns a single unstyled run', () => {
    expect(parseLabelMarkup('Hello')).toEqual([[{ text: 'Hello' }]]);
  });
  it('splits on newlines', () => {
    expect(parseLabelMarkup('a\nb')).toEqual([[{ text: 'a' }], [{ text: 'b' }]]);
  });
  it('splits on <br/> in all its spellings', () => {
    expect(parseLabelMarkup('a<br>b<br/>c<br />d')).toEqual([
      [{ text: 'a' }], [{ text: 'b' }], [{ text: 'c' }], [{ text: 'd' }],
    ]);
  });
  it('returns one empty line for an empty label', () => {
    expect(parseLabelMarkup('')).toEqual([[]]);
  });
  it('leaves markdown delimiters literal when markdown is off', () => {
    expect(parseLabelMarkup('**Bold**')).toEqual([[{ text: '**Bold**' }]]);
  });
});

describe('parseLabelMarkup — HTML tags (both modes)', () => {
  it('renders <b> and <strong> as bold', () => {
    expect(parseLabelMarkup('a<b>B</b>c')).toEqual([
      [{ text: 'a' }, { text: 'B', bold: true }, { text: 'c' }],
    ]);
    expect(parseLabelMarkup('<strong>B</strong>')).toEqual([[{ text: 'B', bold: true }]]);
  });
  it('renders <i> and <em> as italic', () => {
    expect(parseLabelMarkup('<i>I</i>')).toEqual([[{ text: 'I', italic: true }]]);
    expect(parseLabelMarkup('<em>I</em>')).toEqual([[{ text: 'I', italic: true }]]);
  });
  it('is case-insensitive', () => {
    expect(parseLabelMarkup('<B>x</B>')).toEqual([[{ text: 'x', bold: true }]]);
  });
  it('nests bold and italic', () => {
    expect(parseLabelMarkup('<b>a<i>b</i></b>')).toEqual([
      [{ text: 'a', bold: true }, { text: 'b', bold: true, italic: true }],
    ]);
  });
  // Mermaid would eat an unknown tag as HTML, but silently deleting text the
  // user typed is worse than showing it — `A <B> C` must keep its `<B>`.
  it('leaves an unrecognized tag literal', () => {
    expect(parseLabelMarkup('a <span> b')).toEqual([[{ text: 'a <span> b' }]]);
  });
  it('leaves an unclosed recognized tag styling the rest of the line', () => {
    expect(parseLabelMarkup('a<b>B')).toEqual([
      [{ text: 'a' }, { text: 'B', bold: true }],
    ]);
  });
});

describe('parseLabelMarkup — entities', () => {
  it('decodes named entities', () => {
    expect(parseLabelMarkup('Tom &amp; Jerry')).toEqual([[{ text: 'Tom & Jerry' }]]);
    expect(parseLabelMarkup('&lt;tag&gt;')).toEqual([[{ text: '<tag>' }]]);
    expect(parseLabelMarkup('say &quot;hi&quot;')).toEqual([[{ text: 'say "hi"' }]]);
    expect(parseLabelMarkup('a&nbsp;b')).toEqual([[{ text: 'a b' }]]);
  });
  it('decodes decimal and hex numeric entities', () => {
    expect(parseLabelMarkup('&#169;')).toEqual([[{ text: '©' }]]);
    expect(parseLabelMarkup('&#x2764;')).toEqual([[{ text: '❤' }]]);
  });
  it('leaves an unknown entity literal', () => {
    expect(parseLabelMarkup('&foo;')).toEqual([[{ text: '&foo;' }]]);
  });
  // Entities are decoded after tag tokenization, so a decoded `<` can never
  // turn into markup on a second look.
  it('does not treat a decoded &lt;b&gt; as a tag', () => {
    expect(parseLabelMarkup('&lt;b&gt;x&lt;/b&gt;')).toEqual([[{ text: '<b>x</b>' }]]);
  });
});

describe('parseLabelMarkup — markdown mode', () => {
  it('renders ** and __ as bold', () => {
    expect(parseLabelMarkup('**B**', true)).toEqual([[{ text: 'B', bold: true }]]);
    expect(parseLabelMarkup('__B__', true)).toEqual([[{ text: 'B', bold: true }]]);
  });
  it('renders * and _ as italic', () => {
    expect(parseLabelMarkup('*I*', true)).toEqual([[{ text: 'I', italic: true }]]);
    expect(parseLabelMarkup('_I_', true)).toEqual([[{ text: 'I', italic: true }]]);
  });
  it('renders *** as bold italic', () => {
    expect(parseLabelMarkup('***X***', true)).toEqual([[{ text: 'X', bold: true, italic: true }]]);
  });
  it('keeps the surrounding spaces as their own run', () => {
    expect(parseLabelMarkup('**Bold** and _italic_', true)).toEqual([
      [{ text: 'Bold', bold: true }, { text: ' and ' }, { text: 'italic', italic: true }],
    ]);
  });
  it('nests emphasis', () => {
    expect(parseLabelMarkup('**bold with _it_**', true)).toEqual([
      [{ text: 'bold with ', bold: true }, { text: 'it', bold: true, italic: true }],
    ]);
  });
  it('leaves an unterminated delimiter literal', () => {
    expect(parseLabelMarkup('2 * 3 * 4', true)).toEqual([[{ text: '2 * 3 * 4' }]]);
    expect(parseLabelMarkup('**oops', true)).toEqual([[{ text: '**oops' }]]);
  });
  it('honours backslash escapes', () => {
    expect(parseLabelMarkup('a \\* b', true)).toEqual([[{ text: 'a * b' }]]);
    expect(parseLabelMarkup('a \\\\ b', true)).toEqual([[{ text: 'a \\ b' }]]);
  });
  it('still handles HTML tags and entities', () => {
    expect(parseLabelMarkup('**a** &amp; <i>b</i>', true)).toEqual([
      [{ text: 'a', bold: true }, { text: ' & ' }, { text: 'b', italic: true }],
    ]);
  });
});
