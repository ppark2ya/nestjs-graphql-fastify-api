import { useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

export function useLogFilter<T extends { message: string }>(
  logs: T[],
  delay: number = 300,
) {
  const [grepQuery, setGrepQuery] = useState('');
  const debouncedGrep = useDebouncedValue(grepQuery, delay);
  const isGrepping = debouncedGrep.trim().length > 0;

  const filteredLogs = isGrepping
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(debouncedGrep.trim().toLowerCase()),
      )
    : logs;

  return { grepQuery, setGrepQuery, filteredLogs, isGrepping };
}
