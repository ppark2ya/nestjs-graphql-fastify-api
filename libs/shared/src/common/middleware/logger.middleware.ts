import { Injectable, NestMiddleware } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile = require('winston-daily-rotate-file');
import { CORRELATION_HEADER } from './correlation-id.middleware';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
      }),
      new DailyRotateFile({
        filename: 'logs/info-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '10m',
        maxFiles: '14d',
        level: 'info',
      }),
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '10m',
        maxFiles: '14d',
        level: 'error',
      }),
    ],
  });

  use(req: any, res: any, next: (error?: any) => void) {
    const { method, originalUrl, headers } = req;
    const userAgent = headers['user-agent'] || '';
    const correlationId = headers[CORRELATION_HEADER] || '';
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;

      const logMessage = `${method} ${originalUrl} ${statusCode} - ${userAgent} +${duration}ms`;
      const meta = {
        correlationId,
        method,
        url: originalUrl,
        statusCode,
        userAgent,
        duration,
      };

      if (statusCode >= 400) {
        this.logger.error(logMessage, meta);
      } else {
        this.logger.info(logMessage, meta);
      }
    });

    next();
  }
}
