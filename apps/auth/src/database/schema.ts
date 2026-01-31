import {
  mysqlTable,
  varchar,
  int,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  roles: varchar('roles', { length: 1024 }).notNull().default('user'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorSecret: varchar('two_factor_secret', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const refreshTokens = mysqlTable(
  'refresh_tokens',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    jti: varchar('jti', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_refresh_tokens_user_id').on(table.userId),
    index('idx_refresh_tokens_jti').on(table.jti),
  ],
);
