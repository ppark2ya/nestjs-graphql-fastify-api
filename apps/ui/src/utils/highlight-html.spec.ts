import { highlightHtml } from './highlight-html';

describe('highlightHtml', () => {
  it('returns unchanged HTML when query is empty', () => {
    const input = '<span>hello world</span>';
    const result = highlightHtml(input, '');
    expect(result.html).toBe(input);
    expect(result.matchCount).toBe(0);
  });

  it('returns unchanged HTML when query is undefined-ish empty string', () => {
    const result = highlightHtml('some text', '');
    expect(result.html).toBe('some text');
    expect(result.matchCount).toBe(0);
  });

  it('highlights a simple text match with no HTML tags', () => {
    const result = highlightHtml('hello world', 'world');
    expect(result.html).toBe(
      'hello <mark class="match-highlight">world</mark>',
    );
    expect(result.matchCount).toBe(1);
  });

  it('highlights multiple matches in the same string', () => {
    const result = highlightHtml('foo bar foo baz foo', 'foo');
    expect(result.matchCount).toBe(3);
    expect(result.html).toBe(
      '<mark class="match-highlight">foo</mark> bar <mark class="match-highlight">foo</mark> baz <mark class="match-highlight">foo</mark>',
    );
  });

  it('does NOT match inside HTML tag attributes', () => {
    const input = '<span class="test">test</span>';
    const result = highlightHtml(input, 'test');
    expect(result.html).toBe(
      '<span class="test"><mark class="match-highlight">test</mark></span>',
    );
    expect(result.matchCount).toBe(1);
  });

  it('performs case-insensitive matching', () => {
    const result = highlightHtml('Hello HELLO hello', 'hello');
    expect(result.matchCount).toBe(3);
    // Each original casing should be preserved inside the mark tag
    expect(result.html).toContain(
      '<mark class="match-highlight">Hello</mark>',
    );
    expect(result.html).toContain(
      '<mark class="match-highlight">HELLO</mark>',
    );
    expect(result.html).toContain(
      '<mark class="match-highlight">hello</mark>',
    );
  });

  it('handles regex special characters in query (literal match)', () => {
    const result = highlightHtml('value is a.b and a-b', 'a.b');
    expect(result.matchCount).toBe(1);
    expect(result.html).toBe(
      'value is <mark class="match-highlight">a.b</mark> and a-b',
    );
  });

  it('escapes other regex special chars like parentheses', () => {
    const result = highlightHtml('call fn(x) now', 'fn(x)');
    expect(result.matchCount).toBe(1);
    expect(result.html).toContain(
      '<mark class="match-highlight">fn(x)</mark>',
    );
  });

  it('marks only one specific match as current via currentPosition', () => {
    const result = highlightHtml('foo bar foo baz foo', 'foo', 1);
    expect(result.matchCount).toBe(3);
    // First match: normal highlight
    expect(result.html).toContain(
      '<mark class="match-highlight">foo</mark> bar',
    );
    // Second match (index 1): current highlight
    expect(result.html).toContain(
      '<mark class="match-highlight-current">foo</mark> baz',
    );
    // Third match: normal highlight
    expect(result.html).toMatch(
      /baz <mark class="match-highlight">foo<\/mark>$/,
    );
  });

  it('marks the first match as current when currentPosition is 0', () => {
    const result = highlightHtml('aa aa', 'aa', 0);
    expect(result.matchCount).toBe(2);
    expect(result.html).toMatch(
      /^<mark class="match-highlight-current">aa<\/mark>/,
    );
  });

  it('returns correct matchCount', () => {
    const result = highlightHtml(
      'the quick brown fox jumps over the lazy dog',
      'the',
    );
    expect(result.matchCount).toBe(2);
  });

  it('handles empty string input', () => {
    const result = highlightHtml('', 'search');
    expect(result.html).toBe('');
    expect(result.matchCount).toBe(0);
  });

  it('handles ANSI-converted HTML with span style tags', () => {
    // Simulates output from ansi-to-html: colored text with <span style="...">
    const ansiHtml =
      '<span style="color:#00ff00">INFO</span> server started on <span style="color:#ff0000">port</span> 4000';
    const result = highlightHtml(ansiHtml, 'port');

    // Should highlight "port" in text node, not in style attribute
    expect(result.matchCount).toBe(1);
    expect(result.html).toBe(
      '<span style="color:#00ff00">INFO</span> server started on <span style="color:#ff0000"><mark class="match-highlight">port</mark></span> 4000',
    );
  });

  it('handles ANSI HTML where query appears in both attribute and text', () => {
    // "color" appears in style attribute and as text content
    const ansiHtml = '<span style="color:red">color is red</span>';
    const result = highlightHtml(ansiHtml, 'color');

    // Only the text node "color" should be highlighted, not the attribute
    expect(result.matchCount).toBe(1);
    expect(result.html).toBe(
      '<span style="color:red"><mark class="match-highlight">color</mark> is red</span>',
    );
  });

  it('returns no matches when query is not found', () => {
    const result = highlightHtml('hello world', 'xyz');
    expect(result.html).toBe('hello world');
    expect(result.matchCount).toBe(0);
  });

  it('does not apply current class when currentPosition exceeds matchCount', () => {
    const result = highlightHtml('one match', 'match', 5);
    expect(result.matchCount).toBe(1);
    // The single match should get normal highlight since index 5 != 0
    expect(result.html).toBe('one <mark class="match-highlight">match</mark>');
  });
});
