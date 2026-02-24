import Convert from 'ansi-to-html';
import { memo } from 'react';

const convert = new Convert({ escapeXML: true });

interface Props {
  text: string;
  className?: string;
}

export const AnsiText = memo(function AnsiText({ text, className }: Props) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: convert.toHtml(text) }}
    />
  );
});
