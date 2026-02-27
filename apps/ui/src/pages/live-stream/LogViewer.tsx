import { useSubscription } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry, MAX_LOG_LINES } from './graphql';
import { AnsiText } from '@/components/AnsiText';
import { formatTime } from '@/lib/utils';
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isGrepping = grepQuery.trim().length > 0;

  const filteredLogs = useMemo(() => {
    if (!isGrepping) return logs;
    const q = grepQuery.trim().toLowerCase();
    return logs.filter((log) => log.message.toLowerCase().includes(q));
  }, [logs, grepQuery, isGrepping]);

  const { error } = useSubscription<{ containerLog: LogEntry }>(
    CONTAINER_LOG_SUBSCRIPTION,
    {
      variables: { containerId },
      onData: ({ data }) => {
        if (data.data?.containerLog) {
          setLogs((prev) => {
            const next = [...prev, data.data!.containerLog];
            return next.length > MAX_LOG_LINES
              ? next.slice(-MAX_LOG_LINES)
              : next;
          });
        }
      },
    },
  );

  useEffect(() => {
    if (autoScroll && !isGrepping) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
