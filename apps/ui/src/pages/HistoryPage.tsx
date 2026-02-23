import { useState } from 'react';
import { useQuery, useLazyQuery } from '@apollo/client/react';
import { cn } from '../lib/utils';
import {
  LOG_APPS_QUERY,
  LOG_SEARCH_QUERY,
  LogApp,
  HistoryLogLine,
  LogSearchResult,
} from '../history-graphql';

const LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'bg-red-900/50 text-red-300 border-red-700',
  WARN: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  INFO: 'bg-green-900/50 text-green-300 border-green-700',
  DEBUG: 'bg-gray-800 text-gray-400 border-gray-600',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HistoryPage() {
  const [app, setApp] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [level, setLevel] = useState('');
  const [keyword, setKeyword] = useState('');
  const [node, setNode] = useState('');
  const [afterCursor, setAfterCursor] = useState<string | null>(null);

  const { data: appsData } = useQuery<{ logApps: LogApp[] }>(LOG_APPS_QUERY);

  const [executeSearch, { data: searchData, loading }] = useLazyQuery<{
    logSearch: LogSearchResult;
  }>(LOG_SEARCH_QUERY, { fetchPolicy: 'network-only' });

  const result = searchData?.logSearch;

  const nodes = Array.from(
    new Set((appsData?.logApps ?? []).map((a) => a.node)),
  );

  const apps = Array.from(
    new Set((appsData?.logApps ?? []).map((a) => a.name)),
  ).sort();

  const handleSearch = (cursor?: string) => {
    if (!app) return;
    executeSearch({
      variables: {
        input: {
          app,
          from,
          to,
          level: level || undefined,
          keyword: keyword || undefined,
          node: node || undefined,
          after: cursor || undefined,
          limit: 100,
        },
      },
    });
    setAfterCursor(cursor ?? null);
  };

  const handleNextPage = () => {
    if (!result?.lines.length) return;
    const lastLine = result.lines[result.lines.length - 1];
    if (lastLine.timestamp) {
      handleSearch(lastLine.timestamp);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filter Bar */}
      <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">App</label>
          <select
            value={app}
            onChange={(e) => setApp(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 min-w-[160px]"
          >
            <option value="">Select app...</option>
            {apps.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Level</label>
          <div className="flex gap-1">
            <button
              onClick={() => setLevel('')}
              className={cn(
                'px-2 py-1.5 rounded text-xs border transition-colors',
                !level
                  ? 'bg-gray-600 text-white border-gray-500'
                  : 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700',
              )}
            >
              ALL
            </button>
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(level === l ? '' : l)}
                className={cn(
                  'px-2 py-1.5 rounded text-xs border transition-colors',
                  level === l
                    ? LEVEL_COLORS[l]
                    : 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Keyword</label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search..."
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 w-48"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Node</label>
          <select
            value={node}
            onChange={(e) => setNode(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
          >
            <option value="">All nodes</option>
            {nodes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => handleSearch()}
          disabled={!app || loading}
          className={cn(
            'px-4 py-1.5 rounded text-sm font-medium transition-colors',
            app && !loading
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed',
          )}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Summary Bar */}
      {result && (
        <div className="px-4 py-2 border-b border-gray-700 flex gap-4 text-xs">
          <span className="text-gray-400">
            {result.summary.fileCount} files
          </span>
          <span className="text-gray-400">
            {result.summary.totalLines.toLocaleString()} total lines
          </span>
          <span className="text-red-400">
            {result.summary.errorCount.toLocaleString()} errors
          </span>
          <span className="text-yellow-400">
            {result.summary.warnCount.toLocaleString()} warnings
          </span>
          <span className="text-green-400">
            {result.summary.infoCount.toLocaleString()} info
          </span>
          <span className="ml-auto text-gray-500">
            Showing {result.lines.length} lines
            {afterCursor && ' (paginated)'}
          </span>
        </div>
      )}

      {/* Log Table */}
      <div className="flex-1 overflow-y-auto">
        {!result && !loading && (
          <div className="flex items-center justify-center h-full text-gray-600">
            <p>Select an app and date range to search logs</p>
          </div>
        )}

        {result && result.lines.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-600">
            <p>No matching logs found</p>
          </div>
        )}

        {result && result.lines.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-3 py-2 text-left text-gray-400 font-medium w-44">
                  Timestamp
                </th>
                <th className="px-2 py-2 text-left text-gray-400 font-medium w-16">
                  Level
                </th>
                <th className="px-2 py-2 text-left text-gray-400 font-medium w-40">
                  Source
                </th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">
                  Message
                </th>
                <th className="px-2 py-2 text-left text-gray-400 font-medium w-28">
                  Node
                </th>
                <th className="px-2 py-2 text-left text-gray-400 font-medium w-36">
                  File
                </th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line, i) => (
                <LogRow key={`${line.file}:${line.lineNo}:${i}`} line={line} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {result?.hasMore && (
        <div className="px-4 py-2 border-t border-gray-700 flex justify-center">
          <button
            onClick={handleNextPage}
            disabled={loading}
            className="px-4 py-1.5 rounded text-sm bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

function LogRow({ line }: { line: HistoryLogLine }) {
  const levelColor = line.level ? LEVEL_COLORS[line.level] : '';

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/50">
      <td className="px-3 py-1 text-gray-400 font-mono whitespace-nowrap">
        {line.timestamp ?? '-'}
      </td>
      <td className="px-2 py-1">
        {line.level && (
          <span
            className={cn(
              'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border',
              levelColor,
            )}
          >
            {line.level}
          </span>
        )}
      </td>
      <td className="px-2 py-1 text-gray-500 font-mono truncate max-w-[160px]">
        {line.source ?? ''}
      </td>
      <td className="px-3 py-1 text-gray-200 font-mono break-all">
        {line.message}
      </td>
      <td className="px-2 py-1 text-purple-400 text-[10px] whitespace-nowrap">
        {line.node}
      </td>
      <td className="px-2 py-1 text-gray-500 text-[10px] truncate max-w-[140px]">
        {line.file}
      </td>
    </tr>
  );
}
