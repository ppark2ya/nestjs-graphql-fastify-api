import { useSubscription } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry, ServiceGroup } from './graphql';
import { AnsiText } from '@/components/AnsiText';
import { formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  service: ServiceGroup;
}

function ContainerSubscription({
  containerId,
  onLog,
}: {
  containerId: string;
  onLog: (entry: LogEntry) => void;
}) {
  useSubscription<{ containerLog: LogEntry }>(CONTAINER_LOG_SUBSCRIPTION, {
    variables: { containerId },
    onData: ({ data }) => {
      if (data.data?.containerLog) {
        onLog(data.data.containerLog);
      }
    },
  });
  return null;
}

// Short container ID → color mapping for visual distinction
const REPLICA_COLORS = [
  'text-cyan-400',
  'text-yellow-400',
  'text-green-400',
  'text-pink-400',
  'text-orange-400',
  'text-indigo-400',
];

export default function ServiceLogViewer({ service }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const containerIds = service.containers.map((c) => c.id);
  const containerColorMap = new Map(
    service.containers.map((c, i) => [
      c.id,
      REPLICA_COLORS[i % REPLICA_COLORS.length],
    ]),
  );
  const containerNodeMap = new Map(
    service.containers.map((c) => [c.id, c.nodeName ?? '']),
  );

  // Reset logs when service changes
  useEffect(() => {
    setLogs([]);
    setAutoScroll(true);
  }, [service.serviceName]);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const handleLog = (entry: LogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry];
      const len = next.length;
      if (len > 1 && next[len - 1].timestamp < next[len - 2].timestamp) {
        next.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm bg-purple-500" />
          <h2 className="text-sm font-medium text-secondary-foreground">
            {service.serviceName}
          </h2>
          <Badge variant="secondary" className="text-purple-400">
            {containerIds.length} replicas
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {logs.length} lines
          </span>
          {!autoScroll && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Follow
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0"
            onClick={() => setLogs([])}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Replica legend */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card/50 flex-wrap">
        {service.containers.map((c) => (
          <span key={c.id} className={`text-xs ${containerColorMap.get(c.id)}`}>
            {c.id.slice(0, 8)}
            {c.nodeName && (
              <span className="text-muted-foreground ml-1">@{c.nodeName}</span>
            )}
          </span>
        ))}
      </div>

      {/* Hidden subscription components */}
      {containerIds.map((id) => (
        <ContainerSubscription key={id} containerId={id} onLog={handleLog} />
      ))}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <p className="text-muted-foreground p-2">
            Waiting for logs from {containerIds.length} replicas...
          </p>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`flex gap-2 py-0.5 px-2 hover:bg-secondary/50 ${
                log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
              }`}
            >
              <span className="text-muted-foreground shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span
                className={`shrink-0 truncate ${containerColorMap.get(log.containerId) ?? 'text-muted-foreground'}`}
              >
                {log.containerId.slice(0, 8)}
                {containerNodeMap.get(log.containerId) && (
                  <span className="text-muted-foreground">
                    @{containerNodeMap.get(log.containerId)}
                  </span>
                )}
              </span>
              <span
                className={`shrink-0 w-12 ${
                  log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
                }`}
              >
                {log.stream}
              </span>
              <AnsiText
                text={log.message}
                className="whitespace-pre-wrap break-all"
              />
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
