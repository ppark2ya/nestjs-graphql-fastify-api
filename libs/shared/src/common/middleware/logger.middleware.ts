import { Injectable, NestMiddleware } from '@nestjs/common';
import { WinstonLoggerService } from '../logger/winston-logger.service';
import { CORRELATION_HEADER } from './correlation-id.middleware';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new WinstonLoggerService().setContext('HTTP');

  use(req: any, res: any, next: (error?: any) => void) {
    const method = req.method;
    const url = req.originalUrl || req.url;
    const userAgent = req.headers['user-agent'] || '';
    const correlationId = req.headers[CORRELATION_HEADER] || '';
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;

      const logMessage = `${method} ${url} ${statusCode} - ${userAgent} +${duration}ms`;
      const meta = {
        correlationId,
        method,
        url,
        statusCode,
        userAgent,
        duration,
      };

      if (statusCode >= 400) {
        this.logger.logWithMeta('error', logMessage, meta);
      } else {
        this.logger.logWithMeta('info', logMessage, meta);
      }
    });

    next();
  }
}
