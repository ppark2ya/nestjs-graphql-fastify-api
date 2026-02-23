import { useSubscription } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry } from './graphql';
import { AnsiText } from './components/AnsiText';
import { formatTime } from './utils';

interface Props {
  containerId: string;
  containerName: string;
}

export default function LogViewer({ containerId, containerName }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { error } = useSubscription<{ containerLog: LogEntry }>(
    CONTAINER_LOG_SUBSCRIPTION,
    {
      variables: { containerId },
      onData: ({ data }) => {
        if (data.data?.containerLog) {
          setLogs((prev) => [...prev, data.data!.containerLog]);
        }
      },
    },
  );

  useEffect(() => {
    setLogs([]);
    setAutoScroll(true);
  }, [containerId]);

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-gray-200">{containerName}</h2>
          <span className="text-xs text-gray-500">{containerId.slice(0, 12)}</span>
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
        {logs.length === 0 ? (
          <p className="text-gray-600 p-2">Waiting for logs...</p>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`flex gap-2 py-0.5 px-2 hover:bg-gray-800/50 ${
                log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
              }`}
            >
              <span className="text-gray-600 shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span
                className={`shrink-0 w-12 ${
                  log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
                }`}
              >
                {log.stream}
              </span>
              <AnsiText text={log.message} className="whitespace-pre-wrap break-all" />
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
