import { z } from 'zod';

const useMockAuth = process.env.USE_MOCK_AUTH === 'true';

const requiredString = (message: string) =>
  useMockAuth
    ? z.string().optional().default('')
    : z.string({ required_error: message });

export const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  AUTH_HTTP_PORT: z.coerce.number().default(4001),

  // Database (USE_MOCK_AUTH=true 시 불필요)
  DB_HOST: requiredString('DB_HOST is required'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USERNAME: requiredString('DB_USERNAME is required'),
  DB_PASSWORD: requiredString('DB_PASSWORD is required'),
  DB_DATABASE: requiredString('DB_DATABASE is required'),

  // JWT (USE_MOCK_AUTH=true 시 불필요)
  JWT_PUBLIC_KEY_PATH: requiredString('JWT_PUBLIC_KEY_PATH is required'),
  JWT_PRIVATE_KEY_PATH: requiredString('JWT_PRIVATE_KEY_PATH is required'),
});

export type Env = z.infer<typeof envSchema>;
