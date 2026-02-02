import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './apps/auth/src/database/schema.ts',
  out: './apps/auth/drizzle',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'auth',
  },
});
