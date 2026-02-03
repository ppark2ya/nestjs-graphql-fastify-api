import { Injectable, LoggerService } from '@nestjs/common';
import { existsSync, mkdirSync, renameSync } from 'fs';
import { basename, join } from 'path';
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

const ARCHIVE_DIR = 'logs/archive';

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
        this.createFileTransport(),
      ],
    });
  }

  private createFileTransport(): DailyRotateFile {
    // archive 디렉토리 생성
    if (!existsSync(ARCHIVE_DIR)) {
      mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    const transport = new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '14d',
      format: winston.format.combine(koreaTimestamp, winston.format.json()),
    });

    // 로테이션 시 archive 디렉토리로 이동
    transport.on('rotate', (oldFilename: string) => {
      const fileName = basename(oldFilename);
      const archivePath = join(ARCHIVE_DIR, fileName);
      try {
        renameSync(oldFilename, archivePath);
      } catch {
        // 파일이 이미 이동되었거나 존재하지 않을 경우 무시
      }
    });

    return transport;
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
