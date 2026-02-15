import { useSubscription } from '@apollo/client/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry, ServiceGroup } from './graphql';

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
    service.containers.map((c, i) => [c.id, REPLICA_COLORS[i % REPLICA_COLORS.length]]),
  );
  const containerNameMap = new Map(service.containers.map((c) => [c.id, c.name]));

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

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const handleLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry];
      // Keep sorted by timestamp (insertion sort since mostly in order)
      const len = next.length;
      if (len > 1 && next[len - 1].timestamp < next[len - 2].timestamp) {
        next.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      return next;
    });
  }, []);

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('ko-KR', { hour12: false });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm bg-purple-500" />
          <h2 className="text-sm font-medium text-gray-200">{service.serviceName}</h2>
          <span className="text-xs text-purple-400">{containerIds.length} replicas</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{logs.length} lines</span>
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Follow
            </button>
          )}
          <button
            onClick={() => setLogs([])}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Replica legend */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-gray-800 bg-gray-900/50">
        {service.containers.map((c) => (
          <span key={c.id} className={`text-xs ${containerColorMap.get(c.id)}`}>
            {c.id.slice(0, 8)}
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
          <p className="text-gray-600 p-2">Waiting for logs from {containerIds.length} replicas...</p>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`flex gap-2 py-0.5 px-2 hover:bg-gray-800/50 ${
                log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
              }`}
            >
              <span className="text-gray-600 shrink-0">{formatTime(log.timestamp)}</span>
              <span className={`shrink-0 w-18 truncate ${containerColorMap.get(log.containerId) ?? 'text-gray-500'}`}>
                {log.containerId.slice(0, 8)}
              </span>
              <span
                className={`shrink-0 w-12 ${
                  log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
                }`}
              >
                {log.stream}
              </span>
              <span className="whitespace-pre-wrap break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
