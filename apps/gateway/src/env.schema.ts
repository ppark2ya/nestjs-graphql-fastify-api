import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  AUTH_SERVICE_HOST: z.string().default('localhost'),
  AUTH_TCP_PORT: z.coerce.number().default(4002),
  GW_URL: z.string().url().default('http://localhost:4000'),
});

export type Env = z.infer<typeof envSchema>;
