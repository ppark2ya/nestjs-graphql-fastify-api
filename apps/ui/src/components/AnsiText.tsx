import Convert from 'ansi-to-html';

const convert = new Convert({ escapeXML: true });

interface Props {
  text: string;
  className?: string;
}

export function AnsiText({ text, className }: Props) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: convert.toHtml(text) }}
    />
  );
}
