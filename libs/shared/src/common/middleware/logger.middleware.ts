import { Injectable, NestMiddleware } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { WinstonLoggerService } from '../logger/winston-logger.service';
import { CORRELATION_HEADER } from './correlation-id.middleware';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new WinstonLoggerService().setContext('HTTP');

  use(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const method = req.method ?? '';
    const url = req.url ?? '';
    const userAgent = (req.headers['user-agent'] as string) || '';
    const correlationId = (req.headers[CORRELATION_HEADER] as string) || '';
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '';
    const start = Date.now();

    res.on('finish', () => {
      const statusCode = res.statusCode;
      const duration = Date.now() - start;

      const logMessage = `${method} ${url} ${statusCode} - ${ip} ${userAgent} +${duration}ms`;
      const meta = {
        correlationId,
        method,
        url,
        statusCode,
        ip,
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
