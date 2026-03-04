import { useEffect, useRef, useState } from 'react';

interface UseLogBufferOptions {
  maxLines?: number;
  sortByTimestamp?: boolean;
}

export function useLogBuffer<T extends { timestamp: string }>(
  options: UseLogBufferOptions = {},
) {
  const { maxLines = 5000, sortByTimestamp = false } = options;
  const [logs, setLogs] = useState<T[]>([]);

  const batchRef = useRef<T[]>([]);
  const rafRef = useRef(0);

  const flushBatch = () => {
    rafRef.current = 0;
    const batch = batchRef.current;
    if (batch.length === 0) return;
    batchRef.current = [];
    setLogs((prev) => {
      const next = prev.concat(batch);
      if (
        sortByTimestamp &&
        prev.length > 0 &&
        batch.some((e) => e.timestamp < prev[prev.length - 1].timestamp)
      ) {
        next.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      return next.length > maxLines ? next.slice(-maxLines) : next;
    });
  };

  const addLog = (log: T) => {
    batchRef.current.push(log);
    if (rafRef.current === 0) {
      rafRef.current = requestAnimationFrame(flushBatch);
    }
  };

  const clearLogs = () => {
    batchRef.current = [];
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setLogs([]);
  };

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return { logs, addLog, clearLogs, lineCount: logs.length };
}
