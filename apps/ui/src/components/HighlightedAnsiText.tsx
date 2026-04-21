import { useMemo } from 'react';
import Convert from 'ansi-to-html';
import { highlightHtml } from '@/utils/highlight-html';

const convert = new Convert({ escapeXML: true });

interface Props {
  text: string;
  className?: string;
  query?: string;
  currentMatchPositionInLine?: number;
}

export function HighlightedAnsiText({
  text,
  className,
  query,
  currentMatchPositionInLine,
}: Props) {
  const html = useMemo(() => {
    const base = convert.toHtml(text);
    if (!query) return base;
    return highlightHtml(base, query, currentMatchPositionInLine).html;
  }, [text, query, currentMatchPositionInLine]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
