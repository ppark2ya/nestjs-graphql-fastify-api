import {
  mysqlTable,
  varchar,
  int,
  bigint,
  datetime,
  uniqueIndex,
  varbinary,
} from 'drizzle-orm/mysql-core';

export const tbAccount = mysqlTable(
  'tb_account',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    createdAt: datetime('created_at', { fsp: 6 }),
    email: varchar('email', { length: 64 }),
    failCount: int('fail_count').default(0),
    lastLoginAt: datetime('last_login_at', { fsp: 6 }),
    loginId: varbinary('login_id', { length: 63 }).notNull(),
    name: varchar('name', { length: 255 }),
    userType: varchar('user_type', { length: 20 }).notNull(),
    password: varchar('password', { length: 255 }),
    status: varchar('status', { length: 255 }),
    otpSecretKey: varchar('otp_secret_key', { length: 20 }),
    customerNo: varchar('customer_no', { length: 40 }),
    lastPasswordChangedAt: datetime('last_password_changed_at', { fsp: 6 }),
    updatedAt: datetime('updated_at', { fsp: 6 }),
    ktmsAccessYn: varchar('ktms_access_yn', { length: 2 }),
    userGroupId: bigint('user_group_id', { mode: 'number' }),
    roleType: varchar('role_type', { length: 20 }),
    menuGroupId: bigint('menu_group_id', { mode: 'number' }),
    cashCourierYn: varchar('cash_courier_yn', { length: 3 })
      .notNull()
      .default('N'),
  },
  (table) => [uniqueIndex('ux_account_01').on(table.loginId, table.userType)],
);

export const tbUserGroup = mysqlTable(
  'tb_user_group',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    name: varchar('name', { length: 30 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(),
    useYn: varchar('use_yn', { length: 2 }).notNull(),
    email: varchar('email', { length: 400 }),
    createdAdm: varchar('created_adm', { length: 50 }).notNull(),
    createdAt: datetime('created_at', { fsp: 6 }).notNull(),
    updatedAdm: varchar('updated_adm', { length: 50 }),
    updatedAt: datetime('updated_at', { fsp: 6 }),
  },
  (table) => [uniqueIndex('ux_user_group_01').on(table.name, table.type)],
);
