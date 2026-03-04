import { useSubscription } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CONTAINER_LOG_SUBSCRIPTION,
  LogEntry,
  MAX_LOG_LINES,
  ServiceGroup,
} from './graphql';
import { ServiceLogRow } from './LogRow';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
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

  const debouncedGrep = useDebouncedValue(grepQuery, 300);
  const isGrepping = debouncedGrep.trim().length > 0;

  const filteredLogs = isGrepping
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(debouncedGrep.trim().toLowerCase()),
      )
    : logs;

  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
    overscan: 20,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const flushBatch = () => {
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
  };

  const handleLog = (entry: LogEntry) => {
    batchRef.current.push(entry);
    if (rafRef.current === 0) {
      rafRef.current = requestAnimationFrame(flushBatch);
    }
  };

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  useEffect(() => {
    if (autoScroll && !isGrepping && filteredLogs.length > 0) {
      virtualizer.scrollToIndex(filteredLogs.length - 1, { align: 'end' });
    }
  }, [filteredLogs.length, autoScroll, isGrepping, virtualizer]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll((prev) => (prev === isAtBottom ? prev : isAtBottom));
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
                virtualizer.scrollToIndex(filteredLogs.length - 1, {
                  align: 'end',
                });
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
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const log = filteredLogs[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ServiceLogRow
                    log={log}
                    replicaColor={
                      containerColorMap.get(log.containerId) ??
                      'text-muted-foreground'
                    }
                    nodeName={containerNodeMap.get(log.containerId) ?? ''}
                    measureRef={virtualizer.measureElement}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
