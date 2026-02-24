import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { promises as dns } from 'dns';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { Env } from '../env.schema';
import { LogSearchInput } from './dto/log-search.input';
import { LogSearchResult } from './models/log-search-result.model';
import { LogApp } from './models/log-app.model';
import { LogLine } from './models/log-line.model';
import { LogSummary } from './models/log-summary.model';

@Injectable()
export class LogHistoryService {
  private readonly logger = new Logger(LogHistoryService.name);
  private readonly logStreamerPort: number;
  private readonly logStreamerBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly configService: ConfigService<Env>,
  ) {
    this.logStreamerPort = this.configService.getOrThrow('LOG_STREAMER_PORT', {
      infer: true,
    });
    this.logStreamerBaseUrl = this.configService.getOrThrow('LOG_STREAMER_URL', {
      infer: true,
    });
  }

  async listApps(): Promise<LogApp[]> {
    const hosts = await this.discoverLogStreamers();
    const results = await Promise.allSettled(
      hosts.map((host) =>
        this.circuitBreaker.fire('log-history', async () => {
          const res = await firstValueFrom(
            this.httpService.get(`${host}/api/logs/apps`),
          );
          return res.data;
        }),
      ),
    );

    const appMap = new Map<string, LogApp>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { apps, node } = result.value as {
        apps: { name: string }[];
        node: string;
      };
      for (const app of apps ?? []) {
        const key = `${app.name}@${node}`;
        if (!appMap.has(key)) {
          appMap.set(key, { name: app.name, node });
        }
      }
    }

    return Array.from(appMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async search(input: LogSearchInput): Promise<LogSearchResult> {
    const hosts = await this.discoverLogStreamers();

    const searchPromises = hosts.map((host) =>
      this.circuitBreaker.fire('log-history', async () => {
        const res = await firstValueFrom(
          this.httpService.get(`${host}/api/logs/search`, {
            params: {
              app: input.app,
              from: input.from,
              to: input.to,
              level: input.level,
              keyword: input.keyword,
              after: input.after,
              limit: input.limit ?? 100,
            },
            timeout: 30000,
          }),
        );
        return res.data;
      }),
    );

    const statsPromises = hosts.map((host) =>
      this.circuitBreaker.fire('log-history', async () => {
        const res = await firstValueFrom(
          this.httpService.get(`${host}/api/logs/stats`, {
            params: {
              app: input.app,
              from: input.from,
              to: input.to,
            },
            timeout: 30000,
          }),
        );
        return res.data;
      }),
    );

    const [searchResults, statsResults] = await Promise.all([
      Promise.allSettled(searchPromises),
      Promise.allSettled(statsPromises),
    ]);

    let allLines: LogLine[] = [];
    let hasMore = false;

    for (const result of searchResults) {
      if (result.status !== 'fulfilled') continue;
      const data = result.value as {
        lines: LogLine[];
        node: string;
        hasMore: boolean;
      };

      if (input.node && data.node !== input.node) continue;

      const linesWithNode = (data.lines ?? []).map((line) => ({
        ...line,
        node: data.node,
      }));
      allLines = allLines.concat(linesWithNode);
      if (data.hasMore) hasMore = true;
    }

    allLines.sort((a, b) => {
      const ta = a.timestamp ?? '';
      const tb = b.timestamp ?? '';
      return ta.localeCompare(tb);
    });

    const limit = input.limit ?? 100;
    if (allLines.length > limit) {
      allLines = allLines.slice(0, limit);
      hasMore = true;
    }

    const summary = this.mergeStats(statsResults, input.node);

    return { lines: allLines, hasMore, summary };
  }

  private async discoverLogStreamers(): Promise<string[]> {
    try {
      const addresses = await dns.resolve4('tasks.log-streamer');
      this.logger.debug(
        `Discovered ${addresses.length} log-streamer instances`,
      );
      return addresses.map(
        (ip) => `http://${ip}:${this.logStreamerPort}`,
      );
    } catch {
      return [this.logStreamerBaseUrl];
    }
  }

  private mergeStats(
    results: PromiseSettledResult<unknown>[],
    nodeFilter?: string,
  ): LogSummary {
    const summary: LogSummary = {
      totalLines: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      fileCount: 0,
    };

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const data = result.value as {
        node: string;
        totalLines: number;
        errorCount: number;
        warnCount: number;
        infoCount: number;
        fileCount: number;
      };

      if (nodeFilter && data.node !== nodeFilter) continue;

      summary.totalLines += data.totalLines;
      summary.errorCount += data.errorCount;
      summary.warnCount += data.warnCount;
      summary.infoCount += data.infoCount;
      summary.fileCount += data.fileCount;
    }

    return summary;
  }
}
