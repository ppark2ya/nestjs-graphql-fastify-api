import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';
import { Env } from '../env.schema';

export const PUB_SUB = 'PUB_SUB';

const MAX_RETRIES = 10;

export const pubSubProvider = {
  provide: PUB_SUB,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<Env>) => {
    const logger = new Logger('RedisPubSub');

    const options: import('ioredis').RedisOptions = {
      host: configService.getOrThrow('REDIS_HOST', { infer: true }),
      port: configService.getOrThrow('REDIS_PORT', { infer: true }),
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: (times: number) => {
        if (times > MAX_RETRIES) {
          logger.error(
            `Redis 연결 재시도 ${MAX_RETRIES}회 초과 — 재연결을 중단합니다. 로그 스트리밍이 비활성화됩니다.`,
          );
          return null;
        }
        const delay = Math.min(times * 500, 5000);
        logger.warn(
          `Redis 연결 재시도 ${times}/${MAX_RETRIES} (${delay}ms 후)`,
        );
        return delay;
      },
    };

    const publisher = new Redis(options);
    const subscriber = new Redis(options);

    publisher.on('error', (err) =>
      logger.error(`Redis publisher 에러: ${err.message}`),
    );
    subscriber.on('error', (err) =>
      logger.error(`Redis subscriber 에러: ${err.message}`),
    );

    // lazyConnect 모드에서는 명시적으로 연결 시작해야 함
    publisher
      .connect()
      .catch((err: Error) =>
        logger.error(`Redis publisher 연결 실패: ${err.message}`),
      );
    subscriber
      .connect()
      .catch((err: Error) =>
        logger.error(`Redis subscriber 연결 실패: ${err.message}`),
      );

    return new RedisPubSub({ publisher, subscriber });
  },
};
