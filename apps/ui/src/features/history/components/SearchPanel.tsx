import { useState } from 'react';
import { useLazyQuery } from '@apollo/client/react';
import { AnsiText } from '@/components/AnsiText';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, ChevronRight, ChevronDown } from 'lucide-react';
import {
  LOG_SEARCH_QUERY,
  LogApp,
  HistoryLogLine,
  LogSearchResult,
} from '../graphql';

const LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'bg-red-900/50 text-red-300 border-red-700',
  WARN: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  INFO: 'bg-green-900/50 text-green-300 border-green-700',
  DEBUG: 'bg-secondary text-muted-foreground border-border',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SearchPanelProps {
  appsData: LogApp[];
  onLabelChange: (label: string) => void;
}

export default function SearchPanel({
  appsData,
  onLabelChange,
}: SearchPanelProps) {
  const [app, setApp] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [level, setLevel] = useState('');
  const [keyword, setKeyword] = useState('');
  const [node, setNode] = useState('');
  const [afterCursor, setAfterCursor] = useState<string | null>(null);

  const [executeSearch, { data: searchData, loading }] = useLazyQuery<{
    logSearch: LogSearchResult;
  }>(LOG_SEARCH_QUERY, { fetchPolicy: 'network-only' });

  const result = searchData?.logSearch;

  const nodes = Array.from(new Set(appsData.map((a) => a.node)));
  const apps = Array.from(new Set(appsData.map((a) => a.name))).sort();

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

    const label = [app, level, from].filter(Boolean).join(' · ');
    onLabelChange(label || 'Search');
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
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">App</Label>
          <Select value={app || undefined} onValueChange={setApp}>
            <SelectTrigger className="bg-secondary h-8 text-sm min-w-[160px]">
              <SelectValue placeholder="Select app..." />
            </SelectTrigger>
            <SelectContent>
              {apps.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-secondary h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-secondary h-8 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Level</Label>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLevel('')}
              className={cn(
                'px-2 transition-colors',
                !level
                  ? 'bg-gray-600 text-white border-gray-500'
                  : 'bg-secondary text-muted-foreground border-border hover:bg-gray-700',
              )}
            >
              ALL
            </Button>
            {LEVELS.map((l) => (
              <Button
                key={l}
                variant="outline"
                size="sm"
                onClick={() => setLevel(level === l ? '' : l)}
                className={cn(
                  'px-2 transition-colors',
                  level === l
                    ? LEVEL_COLORS[l]
                    : 'bg-secondary text-muted-foreground border-border hover:bg-gray-700',
                )}
              >
                {l}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Keyword</Label>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search..."
            className="bg-secondary h-8 w-48"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Node</Label>
          <Select
            value={node || undefined}
            onValueChange={(val) => setNode(val === '__all__' ? '' : val)}
          >
            <SelectTrigger className="bg-secondary h-8 text-sm">
              <SelectValue placeholder="All nodes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All nodes</SelectItem>
              {nodes.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          onClick={() => handleSearch()}
          disabled={!app || loading}
        >
          <Search className="h-4 w-4" />
          {loading ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {/* Summary Bar */}
      {result && (
        <div className="px-4 py-2 border-b border-border flex gap-4 text-xs">
          <span className="text-muted-foreground">
            {result.summary.fileCount} files
          </span>
          <span className="text-muted-foreground">
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
          <span className="ml-auto text-muted-foreground">
            Showing {result.lines.length} lines
            {afterCursor && ' (paginated)'}
          </span>
        </div>
      )}

      {/* Log Table */}
      <div className="flex-1 overflow-y-auto">
        {!result && !loading && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Select an app and date range to search logs</p>
          </div>
        )}

        {result && result.lines.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No matching logs found</p>
          </div>
        )}

        {result && result.lines.length > 0 && (
          <Table className="text-xs">
            <TableHeader className="sticky top-0 bg-secondary">
              <TableRow>
                <TableHead className="px-3 py-2 w-44">Timestamp</TableHead>
                <TableHead className="px-2 py-2 w-16">Level</TableHead>
                <TableHead className="px-2 py-2 w-40">Source</TableHead>
                <TableHead className="px-3 py-2">Message</TableHead>
                <TableHead className="px-2 py-2 w-28">Node</TableHead>
                <TableHead className="px-2 py-2 w-36">File</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.lines.map((line, i) => (
                <LogRow key={`${line.file}:${line.lineNo}:${i}`} line={line} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {result?.hasMore && (
        <div className="px-4 py-2 border-t border-border flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleNextPage}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

function LogRow({ line }: { line: HistoryLogLine }) {
  const [expanded, setExpanded] = useState(false);
  const levelColor = line.level ? LEVEL_COLORS[line.level] : '';

  const parsedMetadata = (() => {
    if (!line.metadata) return null;
    try {
      return JSON.parse(line.metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();

  const hasMetadata = parsedMetadata !== null;

  return (
    <>
      <TableRow
        className={cn(hasMetadata && 'cursor-pointer hover:bg-muted/50')}
        onClick={() => hasMetadata && setExpanded(!expanded)}
      >
        <TableCell className="px-3 py-1 text-muted-foreground font-mono whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {hasMetadata && (
              expanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              )
            )}
            {line.timestamp ?? '-'}
          </span>
        </TableCell>
        <TableCell className="px-2 py-1">
          {line.level && (
            <Badge
              variant="outline"
              className={cn('px-1.5 py-0 text-[10px]', levelColor)}
            >
              {line.level}
            </Badge>
          )}
        </TableCell>
        <TableCell className="px-2 py-1 text-muted-foreground font-mono truncate max-w-[160px]">
          {line.source ?? ''}
        </TableCell>
        <TableCell className="px-3 py-1 text-secondary-foreground font-mono break-all">
          <AnsiText text={line.message} />
        </TableCell>
        <TableCell className="px-2 py-1 text-purple-400 text-[10px] whitespace-nowrap">
          {line.node}
        </TableCell>
        <TableCell className="px-2 py-1 text-muted-foreground text-[10px] truncate max-w-[140px]">
          {line.file}
        </TableCell>
      </TableRow>
      {expanded && parsedMetadata && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={6} className="px-6 py-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
              {Object.entries(parsedMetadata).map(([key, value]) => (
                <span key={key}>
                  <span className="text-blue-400">{key}</span>
                  <span className="text-muted-foreground">: </span>
                  <span className="text-secondary-foreground">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </span>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
