/**
 * Highlight keyword matches in HTML string, targeting only text nodes
 * (not tag names or attributes).
 *
 * @param html - HTML string (e.g. from ansi-to-html)
 * @param query - Search keyword (case-insensitive)
 * @param currentPosition - Zero-based index of the "current" match to highlight differently
 * @returns Object with highlighted HTML and total match count
 */
export function highlightHtml(
  html: string,
  query: string,
  currentPosition?: number,
): { html: string; matchCount: number } {
  if (!query) {
    return { html, matchCount: 0 };
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');

  // Split HTML into tags and text segments.
  // Tags: <...>  Text: everything between tags
  const parts = html.split(/(<[^>]*>)/);
  let globalIndex = 0;

  const result = parts.map((part) => {
    // If it's an HTML tag, leave it untouched
    if (part.startsWith('<') && part.endsWith('>')) {
      return part;
    }

    // It's a text node — replace matches with <mark> wrappers
    return part.replace(regex, (match) => {
      const cls =
        currentPosition !== undefined && globalIndex === currentPosition
          ? 'match-highlight-current'
          : 'match-highlight';
      globalIndex++;
      return `<mark class="${cls}">${match}</mark>`;
    });
  });

  return { html: result.join(''), matchCount: globalIndex };
}
