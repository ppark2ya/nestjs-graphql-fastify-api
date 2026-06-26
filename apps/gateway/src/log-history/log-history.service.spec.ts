import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { discoverLogStreamers } from '../common/discover-log-streamers';
import { LogHistoryService } from './log-history.service';

jest.mock('../common/discover-log-streamers', () => ({
  discoverLogStreamers: jest.fn(),
}));

describe('LogHistoryService', () => {
  let service: LogHistoryService;
  let httpService: { get: jest.Mock };

  beforeEach(() => {
    httpService = {
      get: jest.fn(),
    };

    const circuitBreaker = {
      fire: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()),
    } as unknown as CircuitBreakerService;

    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'LOG_STREAMER_PORT') return 4003;
        if (key === 'LOG_STREAMER_URL') return 'http://localhost:4003';
        throw new Error(`unexpected config key: ${key}`);
      }),
    } as unknown as ConfigService;

    (discoverLogStreamers as jest.Mock).mockResolvedValue(['node-a']);
    service = new LogHistoryService(
      httpService as unknown as HttpService,
      circuitBreaker,
      configService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passes kind=ecs to search and stats by default', async () => {
    httpService.get.mockImplementation((url: string) => {
      if (url.endsWith('/api/logs/search')) {
        return of({ data: { node: 'node-a', lines: [], hasMore: false } });
      }
      if (url.endsWith('/api/logs/stats')) {
        return of({
          data: {
            node: 'node-a',
            totalLines: 0,
            errorCount: 0,
            warnCount: 0,
            infoCount: 0,
            fileCount: 0,
          },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    await service.search({
      app: 'lottecard-admin-api',
      from: '2026-02-01',
      to: '2026-02-28',
    });

    expect(httpService.get).toHaveBeenCalledWith(
      'http://node-a:4003/api/logs/search',
      expect.objectContaining({
        params: expect.objectContaining({ kind: 'ecs' }),
      }),
    );
    expect(httpService.get).toHaveBeenCalledWith(
      'http://node-a:4003/api/logs/stats',
      expect.objectContaining({
        params: expect.objectContaining({ kind: 'ecs' }),
      }),
    );
  });

  it('merges SQL buffer results with node filter and limit', async () => {
    (discoverLogStreamers as jest.Mock).mockResolvedValue(['node-a', 'node-b']);
    httpService.get.mockImplementation((url: string) => {
      if (url === 'http://node-a:4003/api/logs/sql-buffer') {
        return of({
          data: {
            node: 'node-a',
            hasMore: false,
            lines: [
              {
                timestamp: '2026-02-26 10:00:01.000',
                level: 'INFO',
                message: 'select 1',
                file: 'app-sql.log',
                lineNo: 1,
              },
            ],
          },
        });
      }
      if (url === 'http://node-b:4003/api/logs/sql-buffer') {
        return of({
          data: {
            node: 'node-b',
            hasMore: false,
            lines: [
              {
                timestamp: '2026-02-26 10:00:00.000',
                level: 'INFO',
                message: 'select 0',
                file: 'app-sql.log',
                lineNo: 1,
              },
            ],
          },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const result = await service.sqlBuffer({
      app: 'lottecard-admin-api',
      from: '2026-02-01',
      to: '2026-02-28',
      node: 'node-a',
      keyword: 'select',
      limit: 1,
    });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      node: 'node-a',
      message: 'select 1',
    });
    expect(httpService.get).toHaveBeenCalledWith(
      'http://node-a:4003/api/logs/sql-buffer',
      expect.objectContaining({
        params: expect.objectContaining({
          app: 'lottecard-admin-api',
          keyword: 'select',
          limit: 1,
        }),
      }),
    );
  });
});
