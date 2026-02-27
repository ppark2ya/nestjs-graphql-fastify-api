import { useSubscription } from '@apollo/client/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTAINER_LOG_SUBSCRIPTION,
  LogEntry,
  MAX_LOG_LINES,
  ServiceGroup,
} from './graphql';
import { AnsiText } from '@/components/AnsiText';
import { formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';

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
  const [grepQuery, setGrepQuery] = useState('');
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

  const batchRef = useRef<LogEntry[]>([]);
  const rafRef = useRef(0);

  const isGrepping = grepQuery.trim().length > 0;

  const filteredLogs = useMemo(() => {
    if (!isGrepping) return logs;
    const q = grepQuery.trim().toLowerCase();
    return logs.filter((log) => log.message.toLowerCase().includes(q));
  }, [logs, grepQuery, isGrepping]);

  const flushBatch = useCallback(() => {
    rafRef.current = 0;
    const batch = batchRef.current;
    if (batch.length === 0) return;
    batchRef.current = [];
    setLogs((prev) => {
      const next = prev.concat(batch);
      if (
        prev.length > 0 &&
        batch.some((e) => e.timestamp < prev[prev.length - 1].timestamp)
      ) {
        next.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  }, []);

  const handleLog = useCallback(
    (entry: LogEntry) => {
      batchRef.current.push(entry);
      if (rafRef.current === 0) {
        rafRef.current = requestAnimationFrame(flushBatch);
      }
    },
    [flushBatch],
  );

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  useEffect(() => {
    if (autoScroll && !isGrepping) {
      bottomRef.current?.scrollIntoView();
    }
  }, [logs, autoScroll, isGrepping]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);
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
        <div className="relative flex items-center">
          <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={grepQuery}
            onChange={(e) => setGrepQuery(e.target.value)}
            placeholder="grep..."
            className="h-7 w-40 pl-7 pr-7 text-xs font-mono"
          />
          {grepQuery && (
            <button
              onClick={() => setGrepQuery('')}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {isGrepping
              ? `${filteredLogs.length}/${logs.length} lines`
              : `${logs.length} lines`}
          </span>
          {!autoScroll && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView();
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
        {filteredLogs.length === 0 ? (
          <p className="text-muted-foreground p-2">
            {isGrepping
              ? 'No matching logs'
              : `Waiting for logs from ${containerIds.length} replicas...`}
          </p>
        ) : (
          filteredLogs.map((log, i) => (
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
