import { useSubscription, useQuery } from '@apollo/client/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CONTAINER_LOG_SUBSCRIPTION,
  CONTAINER_STATS_QUERY,
  LogEntry,
  ContainerStatsData,
} from '../graphql';
import { formatBytes } from '@/lib/utils';
import { LogRow } from './LogRow';
import { useLogBuffer } from '@/hooks/useLogBuffer';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useLogFilter } from '@/hooks/useLogFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

interface Props {
  containerId: string;
  containerName: string;
}

export default function LogViewer({ containerId, containerName }: Props) {
  const { logs, addLog, clearLogs, lineCount, batchStartIndex } = useLogBuffer<LogEntry>();
  const { grepQuery, setGrepQuery, filteredLogs, isGrepping } =
    useLogFilter(logs);

  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
    overscan: 20,
  });

  const { scrollRef, isFollowing, handleScroll, scrollToBottom } =
    useAutoScroll({
      virtualizer,
      itemCount: filteredLogs.length,
      enabled: !isGrepping,
    });

  const { data: statsData } = useQuery<{
    containerStats: ContainerStatsData[];
  }>(CONTAINER_STATS_QUERY, {
    variables: { containerIds: [containerId] },
    pollInterval: 10_000,
  });
  const stats = statsData?.containerStats?.[0];

  const { error } = useSubscription<{ containerLog: LogEntry }>(
    CONTAINER_LOG_SUBSCRIPTION,
    {
      variables: { containerId },
      onData: ({ data }) => {
        if (data.data?.containerLog) {
          addLog(data.data.containerLog);
        }
      },
    },
  );

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
          {stats && (
            <span className="text-xs text-muted-foreground font-mono ml-2">
              CPU {stats.cpuPercent.toFixed(1)}% ·{' '}
              {formatBytes(stats.memUsage)}
              {stats.memLimit > 0 ? `/${formatBytes(stats.memLimit)}` : ''}
            </span>
          )}
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
              ? `${filteredLogs.length}/${lineCount} lines`
              : `${lineCount} lines`}
          </span>
          {!isFollowing && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={scrollToBottom}
            >
              Follow
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0"
            onClick={clearLogs}
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
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className={
                  isFollowing && !isGrepping && virtualRow.index >= batchStartIndex
                    ? 'animate-log-enter'
                    : undefined
                }
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <LogRow log={filteredLogs[virtualRow.index]} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
