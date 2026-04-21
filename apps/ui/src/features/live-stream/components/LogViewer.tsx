import { useEffect, useCallback } from 'react';
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
import { useLogSearch } from '@/hooks/useLogSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, ListFilter } from 'lucide-react';

interface Props {
  containerId: string;
  containerName: string;
  isActive?: boolean;
}

export default function LogViewer({ containerId, containerName, isActive = true }: Props) {
  const { logs, addLog, clearLogs, lineCount, batchStartIndex } = useLogBuffer<LogEntry>();
  const {
    query: grepQuery,
    setQuery: setGrepQuery,
    debouncedQuery,
    mode,
    setMode,
    filteredLogs,
    isSearching: isGrepping,
    currentMatchIndex,
    totalMatches,
    next,
    prev,
    currentMatchLogIndex,
    currentMatchPositionInLine,
  } = useLogSearch(logs);

  const isFindMode = mode === 'find';

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
    pollInterval: isActive ? 10_000 : 0,
    skip: !isActive,
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

  // Scroll to current match in find mode
  useEffect(() => {
    if (isFindMode && currentMatchLogIndex !== null) {
      virtualizer.scrollToIndex(currentMatchLogIndex, { align: 'center' });
    }
  }, [isFindMode, currentMatchLogIndex, virtualizer]);

  // Keyboard navigation: n (next) / Shift+N (prev) in find mode
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isFindMode || !isGrepping) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        next();
      } else if (e.key === 'N' && e.shiftKey) {
        e.preventDefault();
        prev();
      }
    },
    [isFindMode, isGrepping, next, prev],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Build a lookup for which match position belongs to which log index
  const getMatchPositionForLog = useCallback(
    (logIndex: number): number | undefined => {
      if (!isFindMode || !isGrepping || currentMatchLogIndex === null) return undefined;
      if (logIndex !== currentMatchLogIndex) return undefined;
      return currentMatchPositionInLine;
    },
    [isFindMode, isGrepping, currentMatchLogIndex, currentMatchPositionInLine],
  );

  const toggleMode = () => setMode(isFindMode ? 'filter' : 'find');

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
        <div className="relative flex items-center gap-1">
          <button
            onClick={toggleMode}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            title={isFindMode ? 'Switch to filter mode' : 'Switch to find mode'}
          >
            {isFindMode ? (
              <Search className="h-3.5 w-3.5" />
            ) : (
              <ListFilter className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="relative flex items-center">
            <Input
              value={grepQuery}
              onChange={(e) => setGrepQuery(e.target.value)}
              placeholder={isFindMode ? 'find...' : 'grep...'}
              className="h-7 w-40 pl-2 pr-7 text-xs font-mono"
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
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {isFindMode && isGrepping
              ? `${totalMatches > 0 ? currentMatchIndex + 1 : 0}/${totalMatches} matches`
              : isGrepping
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
                <LogRow
                  log={filteredLogs[virtualRow.index]}
                  query={isFindMode && isGrepping ? debouncedQuery : undefined}
                  currentMatchPositionInLine={getMatchPositionForLog(virtualRow.index)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
