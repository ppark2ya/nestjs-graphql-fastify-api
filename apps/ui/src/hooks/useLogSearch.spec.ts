/**
 * Tests for useLogSearch hook.
 *
 * Requires: @testing-library/react (pnpm add -D @testing-library/react)
 *
 * The root jest config uses testEnvironment: "node". These tests require
 * jsdom. Run with: jest --testEnvironment=jsdom apps/ui/src/hooks/useLogSearch.spec.ts
 * Or add a jest config for UI tests with testEnvironment: "jsdom".
 */

import { renderHook, act } from '@testing-library/react';
import { useLogSearch } from './useLogSearch';

// Mock useDebouncedValue to return value immediately (no delay)
jest.mock('./useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T, _delay: number): T => value,
}));

interface LogEntry {
  message: string;
}

const sampleLogs: LogEntry[] = [
  { message: 'INFO server started' },
  { message: 'ERROR connection failed' },
  { message: 'INFO request received' },
  { message: 'ERROR timeout error' },
  { message: 'DEBUG foo bar' },
];

describe('useLogSearch', () => {
  describe('filter mode (default)', () => {
    it('returns all logs when query is empty', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      expect(result.current.mode).toBe('filter');
      expect(result.current.filteredLogs).toEqual(sampleLogs);
      expect(result.current.isSearching).toBe(false);
    });

    it('returns only matching logs', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setQuery('ERROR');
      });

      expect(result.current.filteredLogs).toEqual([
        { message: 'ERROR connection failed' },
        { message: 'ERROR timeout error' },
      ]);
      expect(result.current.isSearching).toBe(true);
    });

    it('performs case-insensitive matching in filter mode', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setQuery('error');
      });

      expect(result.current.filteredLogs).toHaveLength(2);
      expect(result.current.filteredLogs[0].message).toBe(
        'ERROR connection failed',
      );
      expect(result.current.filteredLogs[1].message).toBe(
        'ERROR timeout error',
      );
    });
  });

  describe('find mode', () => {
    it('returns ALL logs regardless of query', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('ERROR');
      });

      expect(result.current.filteredLogs).toEqual(sampleLogs);
    });

    it('computes correct matches array', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('ERROR');
      });

      // "ERROR connection failed" has 1 match, "ERROR timeout error" has 2 (case-insensitive)
      expect(result.current.matches).toEqual([
        { logIndex: 1, matchCount: 1 },
        { logIndex: 3, matchCount: 2 },
      ]);
      expect(result.current.totalMatches).toBe(3);
    });

    it('computes matches with multiple occurrences in one line', () => {
      const logs: LogEntry[] = [
        { message: 'foo bar foo baz foo' },
        { message: 'no match here' },
        { message: 'foo end' },
      ];
      const { result } = renderHook(() => useLogSearch(logs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('foo');
      });

      expect(result.current.matches).toEqual([
        { logIndex: 0, matchCount: 3 },
        { logIndex: 2, matchCount: 1 },
      ]);
      expect(result.current.totalMatches).toBe(4);
    });

    it('next() increments currentMatchIndex', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('ERROR');
      });

      expect(result.current.currentMatchIndex).toBe(0);

      act(() => {
        result.current.next();
      });

      expect(result.current.currentMatchIndex).toBe(1);
    });

    it('prev() decrements currentMatchIndex', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('ERROR');
      });

      // Move to index 1 first
      act(() => {
        result.current.next();
      });
      expect(result.current.currentMatchIndex).toBe(1);

      act(() => {
        result.current.prev();
      });

      expect(result.current.currentMatchIndex).toBe(0);
    });

    it('next() wraps around at end', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('ERROR');
      });

      // totalMatches = 3 ("ERROR connection failed" has 1, "ERROR timeout error" has 2)
      act(() => {
        result.current.next(); // 0 -> 1
      });
      act(() => {
        result.current.next(); // 1 -> 2
      });
      act(() => {
        result.current.next(); // 2 -> 0 (wrap)
      });

      expect(result.current.currentMatchIndex).toBe(0);
    });

    it('prev() wraps around at beginning', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('ERROR');
      });

      expect(result.current.currentMatchIndex).toBe(0);

      act(() => {
        result.current.prev(); // 0 -> 2 (wrap to end, totalMatches=3)
      });

      expect(result.current.currentMatchIndex).toBe(2);
    });

    it('currentMatchLogIndex points to correct log line', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('ERROR');
      });

      // First match is at logIndex 1
      expect(result.current.currentMatchLogIndex).toBe(1);

      act(() => {
        result.current.next();
      });

      // Second match is at logIndex 3
      expect(result.current.currentMatchLogIndex).toBe(3);
    });

    it('currentMatchPositionInLine tracks position within a multi-match line', () => {
      const logs: LogEntry[] = [
        { message: 'aaa bbb aaa ccc aaa' }, // 3 matches of "aaa"
        { message: 'aaa' }, // 1 match
      ];
      const { result } = renderHook(() => useLogSearch(logs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('aaa');
      });

      // totalMatches = 4
      expect(result.current.totalMatches).toBe(4);

      // Match 0: logIndex=0, positionInLine=0
      expect(result.current.currentMatchLogIndex).toBe(0);
      expect(result.current.currentMatchPositionInLine).toBe(0);

      act(() => {
        result.current.next();
      });
      // Match 1: logIndex=0, positionInLine=1
      expect(result.current.currentMatchLogIndex).toBe(0);
      expect(result.current.currentMatchPositionInLine).toBe(1);

      act(() => {
        result.current.next();
      });
      // Match 2: logIndex=0, positionInLine=2
      expect(result.current.currentMatchLogIndex).toBe(0);
      expect(result.current.currentMatchPositionInLine).toBe(2);

      act(() => {
        result.current.next();
      });
      // Match 3: logIndex=1, positionInLine=0
      expect(result.current.currentMatchLogIndex).toBe(1);
      expect(result.current.currentMatchPositionInLine).toBe(0);
    });
  });

  describe('mode toggle', () => {
    it('preserves query when switching modes', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setQuery('ERROR');
      });

      expect(result.current.query).toBe('ERROR');

      act(() => {
        result.current.setMode('find');
      });

      expect(result.current.query).toBe('ERROR');
      expect(result.current.mode).toBe('find');

      act(() => {
        result.current.setMode('filter');
      });

      expect(result.current.query).toBe('ERROR');
      expect(result.current.mode).toBe('filter');
    });

    it('resets currentMatchIndex when mode changes', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
        result.current.setQuery('ERROR');
      });

      act(() => {
        result.current.next();
      });
      expect(result.current.currentMatchIndex).toBe(1);

      act(() => {
        result.current.setMode('filter');
      });

      act(() => {
        result.current.setMode('find');
      });

      // After mode toggle, index should reset to 0
      expect(result.current.currentMatchIndex).toBe(0);
    });
  });

  describe('empty query', () => {
    it('returns all logs in filter mode with empty query', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      expect(result.current.filteredLogs).toEqual(sampleLogs);
      expect(result.current.matches).toEqual([]);
      expect(result.current.totalMatches).toBe(0);
    });

    it('returns all logs in find mode with empty query', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
      });

      expect(result.current.filteredLogs).toEqual(sampleLogs);
      expect(result.current.matches).toEqual([]);
      expect(result.current.totalMatches).toBe(0);
      expect(result.current.currentMatchLogIndex).toBeNull();
    });

    it('next() and prev() are no-ops when no matches', () => {
      const { result } = renderHook(() => useLogSearch(sampleLogs, 0));

      act(() => {
        result.current.setMode('find');
      });

      act(() => {
        result.current.next();
        result.current.prev();
      });

      expect(result.current.currentMatchIndex).toBe(0);
      expect(result.current.currentMatchLogIndex).toBeNull();
    });
  });
});
