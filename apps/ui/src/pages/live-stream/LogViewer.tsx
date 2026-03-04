import { useSubscription } from '@apollo/client/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry, MAX_LOG_LINES } from './graphql';
import { LogRow } from './LogRow';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

interface Props {
  containerId: string;
  containerName: string;
}

export default function LogViewer({ containerId, containerName }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [grepQuery, setGrepQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const batchRef = useRef<LogEntry[]>([]);
  const rafRef = useRef(0);

  const debouncedGrep = useDebouncedValue(grepQuery, 300);
  const isGrepping = debouncedGrep.trim().length > 0;

  const filteredLogs = useMemo(() => {
    if (!isGrepping) return logs;
    const q = debouncedGrep.trim().toLowerCase();
    return logs.filter((log) => log.message.toLowerCase().includes(q));
  }, [logs, debouncedGrep, isGrepping]);

  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
    overscan: 20,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const flushBatch = useCallback(() => {
    rafRef.current = 0;
    const batch = batchRef.current;
    if (batch.length === 0) return;
    batchRef.current = [];
    setLogs((prev) => {
      const next = prev.concat(batch);
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  }, []);

  const { error } = useSubscription<{ containerLog: LogEntry }>(
    CONTAINER_LOG_SUBSCRIPTION,
    {
      variables: { containerId },
      onData: ({ data }) => {
        if (data.data?.containerLog) {
          batchRef.current.push(data.data.containerLog);
          if (rafRef.current === 0) {
            rafRef.current = requestAnimationFrame(flushBatch);
          }
        }
      },
    },
  );

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
          <h2 className="text-sm font-medium text-secondary-foreground">
            {containerName}
          </h2>
          <span className="text-xs text-muted-foreground">
            {containerId.slice(0, 12)}
          </span>
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

      {error && (
        <div className="px-4 py-2 bg-red-900/30 text-red-400 text-xs">
          Subscription error: {error.message}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-muted-foreground p-2">
            {isGrepping ? 'No matching logs' : 'Waiting for logs...'}
          </p>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
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
                <LogRow
                  log={filteredLogs[virtualRow.index]}
                  measureRef={virtualizer.measureElement}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
