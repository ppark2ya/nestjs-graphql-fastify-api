import { useRef, useState, useCallback } from 'react';
import { useSubscription } from '@apollo/client/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  SERVICE_LOG_SUBSCRIPTION,
  ServiceLogEntry,
  ServiceGroup,
} from '../graphql';
import { ServiceLogRow, ServiceEventRow } from './LogRow';
import { useLogBuffer } from '@/hooks/useLogBuffer';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useLogFilter } from '@/hooks/useLogFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';

interface Props {
  service: ServiceGroup;
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
  const { logs, addLog, clearLogs, lineCount, batchStartIndex } =
    useLogBuffer<ServiceLogEntry>({
      sortByTimestamp: true,
    });
  const { grepQuery, setGrepQuery, filteredLogs, isGrepping } =
    useLogFilter(logs);

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

      {/* Replica legend — dynamically reflects active containers */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card/50 flex-wrap">
        {[...activeContainers.entries()].map(([id, info]) => (
          <span key={id} className={`text-xs ${getContainerColor(id)}`}>
            {id.slice(0, 8)}
            {info.nodeName && (
              <span className="text-muted-foreground ml-1">
                @{info.nodeName}
              </span>
            )}
          </span>
        ))}
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
