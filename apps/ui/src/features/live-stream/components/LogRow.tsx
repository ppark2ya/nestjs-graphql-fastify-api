import { HighlightedAnsiText } from '@/components/HighlightedAnsiText';
import { formatTime } from '@/lib/utils';
import type { LogEntry, ServiceLogEntry } from '../graphql';

interface LogRowProps {
  log: LogEntry;
  query?: string;
  currentMatchPositionInLine?: number;
}

export function LogRow({ log, query, currentMatchPositionInLine }: LogRowProps) {
  return (
    <div
      className={`flex gap-2 py-0.5 px-2 hover:bg-secondary/50 ${
        log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
      }`}
    >
      <span className="text-muted-foreground shrink-0 select-none">
        {formatTime(log.timestamp)}
      </span>
      <span
        className={`shrink-0 w-12 select-none ${
          log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
        }`}
      >
        {log.stream}
      </span>
      <HighlightedAnsiText
        text={log.message}
        className="whitespace-pre-wrap break-all"
        query={query}
        currentMatchPositionInLine={currentMatchPositionInLine}
      />
    </div>
  );
}

interface ServiceLogRowProps {
  log: LogEntry;
  replicaColor: string;
  nodeName: string;
  query?: string;
  currentMatchPositionInLine?: number;
}

export function ServiceLogRow({
  log,
  replicaColor,
  nodeName,
  query,
  currentMatchPositionInLine,
}: ServiceLogRowProps) {
  return (
    <div
      className={`flex gap-2 py-0.5 px-2 hover:bg-secondary/50 ${
        log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
      }`}
    >
      <span className="text-muted-foreground shrink-0 select-none">
        {formatTime(log.timestamp)}
      </span>
      <span className={`shrink-0 truncate select-none ${replicaColor}`}>
        {log.containerId.slice(0, 8)}
        {nodeName && <span className="text-muted-foreground">@{nodeName}</span>}
      </span>
      <span
        className={`shrink-0 w-12 select-none ${
          log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
        }`}
      >
        {log.stream}
      </span>
      <HighlightedAnsiText
        text={log.message}
        className="whitespace-pre-wrap break-all"
        query={query}
        currentMatchPositionInLine={currentMatchPositionInLine}
      />
    </div>
  );
}

interface ServiceEventRowProps {
  log: ServiceLogEntry;
}

export function ServiceEventRow({ log }: ServiceEventRowProps) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 border-y border-yellow-500/20">
      <span className="text-muted-foreground shrink-0 text-xs select-none">
        {formatTime(log.timestamp)}
      </span>
      <span className="flex-1 text-center text-yellow-400 italic text-xs">
        --- {log.message} ---
      </span>
    </div>
  );
}
