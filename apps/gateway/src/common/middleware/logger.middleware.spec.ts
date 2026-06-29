import { EventEmitter } from 'events';
import { IncomingMessage, ServerResponse } from 'http';
import { LoggerMiddleware } from '@monorepo/shared/common/middleware/logger.middleware';
import { WinstonLoggerService } from '@monorepo/shared/common/logger/winston-logger.service';

describe('LoggerMiddleware', () => {
  let logWithMetaSpy: jest.SpyInstance;

  beforeEach(() => {
    logWithMetaSpy = jest
      .spyOn(WinstonLoggerService.prototype, 'logWithMeta')
      .mockImplementation();
  });

  afterEach(() => {
    logWithMetaSpy.mockRestore();
  });

  it('logs the browser UI origin from forwarded headers', () => {
    const middleware = new LoggerMiddleware();
    const req = {
      method: 'POST',
      url: '/auth/login',
      headers: {
        'user-agent': 'Mozilla/5.0',
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'x-forwarded-host': 'abc.mx-dozn.co.kr',
        'x-forwarded-proto': 'https',
      },
      socket: {},
    } as IncomingMessage;
    const res = new EventEmitter() as ServerResponse;
    res.statusCode = 201;

    middleware.use(req, res, jest.fn());
    res.emit('finish');

    expect(logWithMetaSpy).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('https://abc.mx-dozn.co.kr'),
      expect.objectContaining({
        accessChannel: 'https://abc.mx-dozn.co.kr',
      }),
    );
  });
});
