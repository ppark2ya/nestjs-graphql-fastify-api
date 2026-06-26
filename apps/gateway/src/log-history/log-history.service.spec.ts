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
  let circuitBreaker: { fire: jest.Mock };

  beforeEach(() => {
    httpService = {
      get: jest.fn((url: string) => {
        if (url.endsWith('/api/logs/search')) {
          return of({
            data: {
              lines: [
                {
                  timestamp: '2024-01-15 10:30:00.000',
                  level: 'INFO',
                  message: 'in range',
                  file: 'app.2024-01-15.log',
                  lineNo: 1,
                },
              ],
              node: 'node-a',
              hasMore: false,
            },
          });
        }

        return of({
          data: {
            node: 'node-a',
            totalLines: 1,
            errorCount: 0,
            warnCount: 0,
            infoCount: 1,
            fileCount: 1,
          },
        });
      }),
    };
    circuitBreaker = {
      fire: jest.fn((_domain: string, action: () => Promise<unknown>) =>
        action(),
      ),
    };
    (discoverLogStreamers as jest.Mock).mockResolvedValue(['10.0.0.11']);

    service = new LogHistoryService(
      httpService as unknown as HttpService,
      circuitBreaker as unknown as CircuitBreakerService,
      {
        getOrThrow: jest.fn((key: string) => {
          if (key === 'LOG_STREAMER_PORT') return 4003;
          if (key === 'LOG_STREAMER_URL') return 'http://log-streamer:4003';
          throw new Error(`unexpected config key ${key}`);
        }),
      } as unknown as ConfigService,
    );
  });

  it('passes time range params to log-streamer search and stats requests', async () => {
    await service.search({
      app: 'order-service',
      from: '2024-01-15',
      to: '2024-01-15',
      fromTime: '10:00',
      toTime: '10:30',
      limit: 100,
    });

    expect(httpService.get).toHaveBeenCalledWith(
      'http://10.0.0.11:4003/api/logs/search',
      expect.objectContaining({
        params: expect.objectContaining({
          app: 'order-service',
          from: '2024-01-15',
          to: '2024-01-15',
          fromTime: '10:00',
          toTime: '10:30',
          limit: 100,
        }),
      }),
    );
    expect(httpService.get).toHaveBeenCalledWith(
      'http://10.0.0.11:4003/api/logs/stats',
      expect.objectContaining({
        params: expect.objectContaining({
          app: 'order-service',
          from: '2024-01-15',
          to: '2024-01-15',
          fromTime: '10:00',
          toTime: '10:30',
        }),
      }),
    );
  });

  it('keeps date-only params compatible when time range is omitted', async () => {
    await service.search({
      app: 'order-service',
      from: '2024-01-15',
      to: '2024-01-15',
      limit: 100,
    });

    const [, searchOptions] = httpService.get.mock.calls.find(
      ([url]) => url === 'http://10.0.0.11:4003/api/logs/search',
    )!;
    expect(searchOptions.params).not.toHaveProperty('fromTime');
    expect(searchOptions.params).not.toHaveProperty('toTime');
  });
});
