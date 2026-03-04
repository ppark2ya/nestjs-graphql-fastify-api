import { AnsiText } from '@/components/AnsiText';
import { formatTime } from '@/lib/utils';
import type { LogEntry } from '../graphql';

interface LogRowProps {
  log: LogEntry;
  measureRef: (node: HTMLElement | null) => void;
}

export function LogRow({ log, measureRef }: LogRowProps) {
  return (
    <div
      ref={measureRef}
      className={`flex gap-2 py-0.5 px-2 hover:bg-secondary/50 ${
        log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
      }`}
    >
      <span className="text-muted-foreground shrink-0">
        {formatTime(log.timestamp)}
      </span>
      <span
        className={`shrink-0 w-12 ${
          log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
        }`}
      >
        {log.stream}
      </span>
      <AnsiText text={log.message} className="whitespace-pre-wrap break-all" />
    </div>
  );
}

interface ServiceLogRowProps {
  log: LogEntry;
  replicaColor: string;
  nodeName: string;
  measureRef: (node: HTMLElement | null) => void;
}

export function ServiceLogRow({
  log,
  replicaColor,
  nodeName,
  measureRef,
}: ServiceLogRowProps) {
  return (
    <div
      ref={measureRef}
      className={`flex gap-2 py-0.5 px-2 hover:bg-secondary/50 ${
        log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
      }`}
    >
      <span className="text-muted-foreground shrink-0">
        {formatTime(log.timestamp)}
      </span>
      <span className={`shrink-0 truncate ${replicaColor}`}>
        {log.containerId.slice(0, 8)}
        {nodeName && <span className="text-muted-foreground">@{nodeName}</span>}
      </span>
      <span
        className={`shrink-0 w-12 ${
          log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
        }`}
      >
        {log.stream}
      </span>
      <AnsiText text={log.message} className="whitespace-pre-wrap break-all" />
    </div>
  );
}
