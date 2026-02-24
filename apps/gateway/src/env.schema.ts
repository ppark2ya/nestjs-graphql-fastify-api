import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  API_KEYS: z.string().default('test-api-key-1,test-api-key-2'),
  AUTH_SERVICE_HOST: z.string().default('localhost'),
  AUTH_TCP_PORT: z.coerce.number().default(4002),
  GW_URL: z.string().url().default('http://localhost:4000'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  LOG_STREAMER_URL: z.string().url().default('http://localhost:4003'),
  LOG_STREAMER_WS_URL: z.string().url().default('ws://localhost:4003/ws/logs'),
  LOG_STREAMER_PORT: z.coerce.number().default(4003),
});

export type Env = z.infer<typeof envSchema>;
