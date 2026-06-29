import { z } from 'zod';

const requiredString = (message: string) =>
  z.string({ required_error: message }).min(1, message);

export const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  AUTH_HTTP_PORT: z.coerce.number().default(4001),

  // Database
  DB_HOST: requiredString('DB_HOST is required'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USERNAME: requiredString('DB_USERNAME is required'),
  DB_PASSWORD: requiredString('DB_PASSWORD is required'),
  DB_DATABASE: requiredString('DB_DATABASE is required'),

  // JWT
  JWT_PUBLIC_KEY_PATH: requiredString('JWT_PUBLIC_KEY_PATH is required'),
  JWT_PRIVATE_KEY_PATH: requiredString('JWT_PRIVATE_KEY_PATH is required'),
});

export type Env = z.infer<typeof envSchema>;
