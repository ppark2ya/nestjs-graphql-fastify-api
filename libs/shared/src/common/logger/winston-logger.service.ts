import { Injectable, LoggerService } from '@nestjs/common';
import { existsSync, mkdirSync, renameSync } from 'fs';
import { basename, join } from 'path';
import * as winston from 'winston';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import DailyRotateFile = require('winston-daily-rotate-file');
import { requestContext } from '../context/request-context';
// 레벨별 컬러 매핑
const levelColors: Record<string, string> = {
  error: '\x1b[31m', // red
  warn: '\x1b[33m', // yellow
  info: '\x1b[32m', // green
  debug: '\x1b[34m', // blue
  verbose: '\x1b[36m', // cyan
};
const resetColor = '\x1b[0m';

const nestLikeConsoleFormat = winston.format.printf((info) => {
  const { level, message, timestamp, context, ...meta } = info;
  const pid = process.pid;
  const color = levelColors[level] || '';
  const formattedLevel = `${color}${level.toUpperCase().padEnd(7)}${resetColor}`;
  const ctxLabel = typeof context === 'string' ? context : '';
  const contextStr = ctxLabel ? `\x1b[33m[${ctxLabel}]\x1b[0m ` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const ts = typeof timestamp === 'string' ? timestamp : '';

  // NestJS 스타일: [Nest] PID - TIMESTAMP LOG [Context] Message
  return `[Nest] ${pid} - ${ts} ${formattedLevel} ${contextStr}${String(message)}${metaStr}`;
});

const koreaTimestamp = winston.format.timestamp({
  format: () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }),
});

// Winston info에서 제외할 내부 키
const INTERNAL_KEYS = new Set(['level', 'message', 'splat', 'context', 'trace']);

/**
 * ECS JSON 포맷 (UTC @timestamp)
 * @elastic/ecs-winston-format은 info 객체를 변형하여 후속 로그 기록을 깨뜨리므로 직접 구현
 */
const ecsJsonFormat = winston.format.printf((info) => {
  const { level, message, context, trace, ...rest } = info;

  const ecs: Record<string, unknown> = {
    '@timestamp': new Date().toISOString(),
    'log.level': level,
    message: message as string,
    'ecs.version': '8.11.0',
    'process.pid': process.pid,
    'service.name': process.env.SERVICE_NAME || 'app',
  };

  if (context) {
    ecs['log.logger'] = context;
  }
  if (trace) {
    ecs['error.stack_trace'] = trace;
  }

  for (const [key, value] of Object.entries(rest)) {
    if (!INTERNAL_KEYS.has(key) && value !== undefined) {
      ecs[key] = value;
    }
  }

  return JSON.stringify(ecs);
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
          format: winston.format.combine(koreaTimestamp, nestLikeConsoleFormat),
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
      format: ecsJsonFormat,
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

  private getRequestMeta(): Record<string, unknown> {
    const store = requestContext.getStore();
    return store?.correlationId
      ? { correlationId: store.correlationId }
      : {};
  }

  log(message: any, context?: string): void {
    this.logger.info(message as string, {
      context: context || this.context,
      ...this.getRequestMeta(),
    });
  }

  error(message: any, trace?: string, context?: string): void {
    this.logger.error(message as string, {
      context: context || this.context,
      trace,
      ...this.getRequestMeta(),
    });
  }

  warn(message: any, context?: string): void {
    this.logger.warn(message as string, {
      context: context || this.context,
      ...this.getRequestMeta(),
    });
  }

  debug(message: any, context?: string): void {
    this.logger.debug(message as string, {
      context: context || this.context,
      ...this.getRequestMeta(),
    });
  }

  verbose(message: any, context?: string): void {
    this.logger.verbose(message as string, {
      context: context || this.context,
      ...this.getRequestMeta(),
    });
  }

  /**
   * 메타데이터와 함께 로깅 (HTTP 요청 등)
   */
  logWithMeta(
    level: 'info' | 'error' | 'warn' | 'debug',
    message: string,
    meta: Record<string, unknown>,
    context?: string,
  ): void {
    this.logger.log(level, message, {
      context: context || this.context,
      ...this.getRequestMeta(),
      ...meta,
    });
  }
}
