import { Injectable, LoggerService } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
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
const KOREA_TIME_ZONE = 'Asia/Seoul';

const koreaDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: KOREA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hour12: false,
  hourCycle: 'h23',
});

function getDateTimePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return parts.find((part) => part.type === type)?.value ?? '';
}

function getKoreaIsoTimestamp(date: Date) {
  const parts = koreaDateTimeFormatter.formatToParts(date);
  const year = getDateTimePart(parts, 'year');
  const month = getDateTimePart(parts, 'month');
  const day = getDateTimePart(parts, 'day');
  const hour = getDateTimePart(parts, 'hour');
  const minute = getDateTimePart(parts, 'minute');
  const second = getDateTimePart(parts, 'second');
  const fractionalSecond = getDateTimePart(parts, 'fractionalSecond');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${fractionalSecond}+09:00`;
}

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
  format: () =>
    new Date().toLocaleString('sv-SE', { timeZone: KOREA_TIME_ZONE }),
});

// Winston info에서 제외할 내부 키
const INTERNAL_KEYS = new Set([
  'level',
  'message',
  'splat',
  'context',
  'trace',
]);

/**
 * ECS JSON 포맷 (UTC @timestamp)
 * @elastic/ecs-winston-format은 info 객체를 변형하여 후속 로그 기록을 깨뜨리므로 직접 구현
 */
const ecsJsonFormat = winston.format.printf((info) => {
  const { level, message, context, trace, ...rest } = info;
  const now = new Date();

  const ecs: Record<string, unknown> = {
    '@timestamp': now.toISOString(),
    'event.created_kst': getKoreaIsoTimestamp(now),
    'event.timezone': KOREA_TIME_ZONE,
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

const LOG_DIR = 'logs';
const ARCHIVE_DIR = 'archive';

function getAppName() {
  return process.env.SERVICE_NAME || 'app';
}

function getLogLevel() {
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function ensureLogDirectories() {
  for (const directory of [LOG_DIR, ARCHIVE_DIR]) {
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
  }
}

@Injectable()
export class WinstonLoggerService implements LoggerService {
  private logger: winston.Logger;
  private context?: string;

  constructor() {
    this.logger = winston.createLogger({
      level: getLogLevel(),
      transports: [
        // 콘솔: NestJS 스타일 포맷
        new winston.transports.Console({
          format: winston.format.combine(koreaTimestamp, nestLikeConsoleFormat),
        }),
        // 파일: JSON 포맷
        this.createActiveFileTransport(),
        this.createArchiveFileTransport(),
      ],
    });
  }

  private createActiveFileTransport() {
    ensureLogDirectories();

    const transport = new winston.transports.File({
      dirname: LOG_DIR,
      filename: `${getAppName()}.log`,
      format: ecsJsonFormat,
    });

    transport.on('error', (error: Error) => {
      console.error('Winston file transport error:', error);
    });

    return transport;
  }

  private createArchiveFileTransport() {
    ensureLogDirectories();

    const transport = new DailyRotateFile({
      dirname: ARCHIVE_DIR,
      filename: `${getAppName()}.%DATE%`,
      datePattern: 'YYYY-MM-DD',
      extension: '.log',
      zippedArchive: true,
      maxSize: '10m',
      format: ecsJsonFormat,
    });

    transport.on('error', (error: Error) => {
      console.error('Winston daily rotate file transport error:', error);
    });

    return transport;
  }

  setContext(context: string) {
    this.context = context;
    return this;
  }

  private getRequestMeta(): Record<string, unknown> {
    const store = requestContext.getStore();
    return store?.correlationId ? { correlationId: store.correlationId } : {};
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
