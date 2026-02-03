import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  AUTH_HTTP_PORT: z.coerce.number().default(4001),
  AUTH_TCP_PORT: z.coerce.number().default(4002),

  // Database
  DB_HOST: z.string({ required_error: 'DB_HOST is required' }),
  DB_PORT: z.coerce.number().default(3306),
  DB_USERNAME: z.string({ required_error: 'DB_USERNAME is required' }),
  DB_PASSWORD: z.string({ required_error: 'DB_PASSWORD is required' }),
  DB_DATABASE: z.string({ required_error: 'DB_DATABASE is required' }),

  // JWT
  JWT_PUBLIC_KEY_PATH: z.string({ required_error: 'JWT_PUBLIC_KEY_PATH is required' }),
  JWT_PRIVATE_KEY_PATH: z.string({ required_error: 'JWT_PRIVATE_KEY_PATH is required' }),
});

export type Env = z.infer<typeof envSchema>;
