import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useSubscription, useQuery } from '@apollo/client/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  SERVICE_LOG_SUBSCRIPTION,
  CONTAINER_STATS_QUERY,
  ServiceLogEntry,
  ServiceGroup,
  ContainerStatsData,
} from '../graphql';
import { formatBytes } from '@/lib/utils';
import { ServiceLogRow, ServiceEventRow } from './LogRow';
import { useLogBuffer } from '@/hooks/useLogBuffer';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useLogSearch } from '@/hooks/useLogSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, X, ListFilter } from 'lucide-react';

interface Props {
  service: ServiceGroup;
  isActive?: boolean;
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

export default function ServiceLogViewer({ service, isActive = true }: Props) {
  const { logs, addLog, clearLogs, lineCount, batchStartIndex } =
    useLogBuffer<ServiceLogEntry>({
      sortByTimestamp: true,
    });
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

  // Track active containers dynamically via service events
  const [activeContainers, setActiveContainers] = useState<
    Map<string, { nodeName?: string }>
  >(() => {
    const initial = new Map<string, { nodeName?: string }>();
    for (const c of service.containers) {
      initial.set(c.id, { nodeName: c.nodeName });
    }
    return initial;
  });

  // Stable color assignment: use ref so new containers get next color
  const containerColorMapRef = useRef(
    new Map(
      service.containers.map((c, i) => [
        c.id,
        REPLICA_COLORS[i % REPLICA_COLORS.length],
      ]),
    ),
  );
  const colorIndexRef = useRef(service.containers.length);

  const getContainerColor = useCallback((containerId: string) => {
    const map = containerColorMapRef.current;
    if (!map.has(containerId)) {
      map.set(
        containerId,
        REPLICA_COLORS[colorIndexRef.current % REPLICA_COLORS.length],
      );
      colorIndexRef.current++;
    }
    return map.get(containerId)!;
  }, []);

  const containerIds = useMemo(
    () => Array.from(activeContainers.keys()),
    [activeContainers],
  );
  const { data: statsData } = useQuery<{
    containerStats: ContainerStatsData[];
  }>(CONTAINER_STATS_QUERY, {
    variables: { containerIds },
    pollInterval: isActive && containerIds.length > 0 ? 10_000 : 0,
    skip: !isActive || containerIds.length === 0,
  });
  const statsMap = useMemo(() => {
    const map = new Map<string, ContainerStatsData>();
    if (statsData?.containerStats) {
      for (const s of statsData.containerStats) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [statsData]);

  useSubscription<{ serviceLog: ServiceLogEntry }>(
    SERVICE_LOG_SUBSCRIPTION,
    {
      variables: { serviceName: service.serviceName },
      onData: ({ data }) => {
        const entry = data.data?.serviceLog;
        if (!entry) return;

        if (entry.event === 'container_started') {
          setActiveContainers((prev) => {
            const next = new Map(prev);
            next.set(entry.containerId, {});
            return next;
          });
          // Ensure color is assigned
          getContainerColor(entry.containerId);
        } else if (entry.event === 'container_stopped') {
          setActiveContainers((prev) => {
            const next = new Map(prev);
            next.delete(entry.containerId);
            return next;
          });
        }

        addLog(entry);
      },
    },
  );

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

  // Scroll to current match in find mode
  useEffect(() => {
    if (isFindMode && currentMatchLogIndex !== null) {
      virtualizer.scrollToIndex(currentMatchLogIndex, { align: 'center' });
    }
  }, [isFindMode, currentMatchLogIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <span className="w-2 h-2 rounded-sm bg-purple-500" />
          <h2 className="text-sm font-medium text-secondary-foreground">
            {service.serviceName}
          </h2>
          <Badge variant="secondary" className="text-purple-400">
            {activeContainers.size} replicas
          </Badge>
          {statsMap.size > 0 && (
            <span className="text-xs text-muted-foreground font-mono ml-2">
              CPU{' '}
              {[...statsMap.values()]
                .reduce((sum, s) => sum + s.cpuPercent, 0)
                .toFixed(1)}
              % ·{' '}
              {formatBytes(
                [...statsMap.values()].reduce((sum, s) => sum + s.memUsage, 0),
              )}
              {[...statsMap.values()].reduce((sum, s) => sum + s.memLimit, 0) >
              0
                ? `/${formatBytes([...statsMap.values()].reduce((sum, s) => sum + s.memLimit, 0))}`
                : ''}
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

      {/* Replica legend — dynamically reflects active containers */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card/50 flex-wrap">
        {[...activeContainers.entries()].map(([id, info]) => {
          const s = statsMap.get(id);
          return (
            <span key={id} className={`text-xs ${getContainerColor(id)}`}>
              {id.slice(0, 8)}
              {info.nodeName && (
                <span className="text-muted-foreground ml-1">
                  @{info.nodeName}
                </span>
              )}
              {s && (
                <span className="text-muted-foreground/70 font-mono ml-1">
                  {s.cpuPercent.toFixed(1)}% ·{' '}
                  {formatBytes(s.memUsage)}
                  {s.memLimit > 0 ? `/${formatBytes(s.memLimit)}` : ''}
                </span>
              )}
            </span>
          );
        })}
        {activeContainers.size === 0 && (
          <span className="text-xs text-muted-foreground italic">
            No active replicas
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-muted-foreground p-2">
            {isGrepping
              ? 'No matching logs'
              : `Waiting for logs from ${service.serviceName}...`}
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
              const log = filteredLogs[virtualRow.index] as ServiceLogEntry;
              const isEvent = log.stream === 'event';
              return (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className={
                    isFollowing &&
                    !isGrepping &&
                    virtualRow.index >= batchStartIndex
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
                  {isEvent ? (
                    <ServiceEventRow log={log} />
                  ) : (
                    <ServiceLogRow
                      log={log}
                      replicaColor={
                        getContainerColor(log.containerId) ??
                        'text-muted-foreground'
                      }
                      nodeName={
                        activeContainers.get(log.containerId)?.nodeName ?? ''
                      }
                      query={isFindMode && isGrepping ? debouncedQuery : undefined}
                      currentMatchPositionInLine={getMatchPositionForLog(virtualRow.index)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
