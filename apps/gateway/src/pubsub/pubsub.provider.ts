import { ConfigService } from '@nestjs/config';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';
import { Env } from '../env.schema';

export const PUB_SUB = 'PUB_SUB';

export const pubSubProvider = {
  provide: PUB_SUB,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<Env>) => {
    const options = {
      host: configService.getOrThrow('REDIS_HOST', { infer: true }),
      port: configService.getOrThrow('REDIS_PORT', { infer: true }),
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
    };
    return new RedisPubSub({
      publisher: new Redis(options),
      subscriber: new Redis(options),
    });
  },
};
