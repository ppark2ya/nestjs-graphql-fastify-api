import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile = require('winston-daily-rotate-file');

const nestLikeConsoleFormat = winston.format.printf(
  ({ level, message, timestamp, context, ...meta }) => {
    const pid = process.pid;
    const formattedLevel = level.toUpperCase().padEnd(7);
    const contextStr = context ? `[${context}] ` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';

    // NestJS 스타일: [Nest] PID - TIMESTAMP LOG [Context] Message
    return `[Nest] ${pid} - ${timestamp} ${formattedLevel} ${contextStr}${message}${metaStr}`;
  },
);

const koreaTimestamp = winston.format.timestamp({
  format: () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }),
});

@Injectable()
export class WinstonLoggerService implements LoggerService {
  private logger: winston.Logger;
  private context?: string;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      transports: [
        // 콘솔: NestJS 스타일 포맷
        new winston.transports.Console({
          format: winston.format.combine(
            koreaTimestamp,
            winston.format.colorize({ all: true }),
            nestLikeConsoleFormat,
          ),
        }),
        // 파일: JSON 포맷
        new DailyRotateFile({
          filename: 'logs/app-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '10m',
          maxFiles: '14d',
          format: winston.format.combine(koreaTimestamp, winston.format.json()),
        }),
      ],
    });
  }

  setContext(context: string) {
    this.context = context;
    return this;
  }

  log(message: any, context?: string): void {
    this.logger.info(message, { context: context || this.context });
  }

  error(message: any, trace?: string, context?: string): void {
    this.logger.error(message, {
      context: context || this.context,
      trace,
    });
  }

  warn(message: any, context?: string): void {
    this.logger.warn(message, { context: context || this.context });
  }

  debug(message: any, context?: string): void {
    this.logger.debug(message, { context: context || this.context });
  }

  verbose(message: any, context?: string): void {
    this.logger.verbose(message, { context: context || this.context });
  }

  /**
   * 메타데이터와 함께 로깅 (HTTP 요청 등)
   */
  logWithMeta(
    level: 'info' | 'error' | 'warn' | 'debug',
    message: string,
    meta: Record<string, any>,
    context?: string,
  ): void {
    this.logger.log(level, message, {
      context: context || this.context,
      ...meta,
    });
  }
}
