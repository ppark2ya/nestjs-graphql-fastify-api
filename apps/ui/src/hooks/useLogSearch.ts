import { useState, useMemo, useCallback, useEffect } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

export type SearchMode = 'filter' | 'find';

interface MatchInfo {
  logIndex: number;
  matchCount: number;
}

export interface UseLogSearchReturn<T> {
  // common
  query: string;
  setQuery: (q: string) => void;
  debouncedQuery: string;
  mode: SearchMode;
  setMode: (m: SearchMode) => void;
  isSearching: boolean;

  // filter mode
  filteredLogs: T[];

  // find mode
  matches: MatchInfo[];
  currentMatchIndex: number;
  totalMatches: number;
  next: () => void;
  prev: () => void;
  currentMatchLogIndex: number | null;
  currentMatchPositionInLine: number | undefined;
}

/**
 * Count case-insensitive occurrences of `query` in `text`.
 */
function countMatches(text: string, query: string): number {
  if (!query) return 0;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
    count++;
    pos += lowerQuery.length;
  }
  return count;
}

export function useLogSearch<T extends { message: string }>(
  logs: T[],
  delay: number = 300,
): UseLogSearchReturn<T> {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('filter');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const debouncedQuery = useDebouncedValue(query, delay);
  const trimmedQuery = debouncedQuery.trim();
  const isSearching = trimmedQuery.length > 0;

  // Reset current match index when query or mode changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [trimmedQuery, mode]);

  // --- filter mode ---
  const filteredLogs = useMemo(() => {
    if (mode !== 'filter' || !isSearching) return logs;
    const lower = trimmedQuery.toLowerCase();
    return logs.filter((log) => log.message.toLowerCase().includes(lower));
  }, [logs, mode, isSearching, trimmedQuery]);

  // --- find mode: compute matches ---
  const matches = useMemo<MatchInfo[]>(() => {
    if (mode !== 'find' || !isSearching) return [];
    const result: MatchInfo[] = [];
    for (let i = 0; i < logs.length; i++) {
      const mc = countMatches(logs[i].message, trimmedQuery);
      if (mc > 0) {
        result.push({ logIndex: i, matchCount: mc });
      }
    }
    return result;
  }, [logs, mode, isSearching, trimmedQuery]);

  const totalMatches = useMemo(
    () => matches.reduce((sum, m) => sum + m.matchCount, 0),
    [matches],
  );

  // Clamp index to valid range
  const clampedIndex =
    totalMatches > 0 ? Math.min(currentMatchIndex, totalMatches - 1) : 0;

  // Derive which log line and which position within that line
  const { currentMatchLogIndex, currentMatchPositionInLine } = useMemo(() => {
    if (totalMatches === 0 || matches.length === 0) {
      return {
        currentMatchLogIndex: null,
        currentMatchPositionInLine: undefined,
      };
    }
    let remaining = clampedIndex;
    for (const m of matches) {
      if (remaining < m.matchCount) {
        return {
          currentMatchLogIndex: m.logIndex,
          currentMatchPositionInLine: remaining,
        };
      }
      remaining -= m.matchCount;
    }
    // fallback
    const last = matches[matches.length - 1];
    return {
      currentMatchLogIndex: last.logIndex,
      currentMatchPositionInLine: last.matchCount - 1,
    };
  }, [matches, totalMatches, clampedIndex]);

  const next = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % totalMatches);
  }, [totalMatches]);

  const prev = useCallback(() => {
    if (totalMatches === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  return {
    query,
    setQuery,
    debouncedQuery: trimmedQuery,
    mode,
    setMode,
    isSearching,
    filteredLogs: mode === 'find' ? logs : filteredLogs,
    matches,
    currentMatchIndex: clampedIndex,
    totalMatches,
    next,
    prev,
    currentMatchLogIndex,
    currentMatchPositionInLine,
  };
}
