import { gql } from '@apollo/client';

export const LOG_APPS_QUERY = gql`
  query LogApps {
    logApps {
      name
      node
    }
  }
`;

export const LOG_SEARCH_QUERY = gql`
  query LogSearch($input: LogSearchInput!) {
    logSearch(input: $input) {
      lines {
        timestamp
        level
        source
        message
        node
        file
        lineNo
      }
      hasMore
      summary {
        totalLines
        errorCount
        warnCount
        infoCount
        fileCount
      }
    }
  }
`;

export interface LogApp {
  name: string;
  node: string;
}

export interface HistoryLogLine {
  timestamp: string | null;
  level: string | null;
  source: string | null;
  message: string;
  node: string;
  file: string;
  lineNo: number;
}

export interface LogSummary {
  totalLines: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  fileCount: number;
}

export interface LogSearchResult {
  lines: HistoryLogLine[];
  hasMore: boolean;
  summary: LogSummary;
}
