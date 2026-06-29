import {
  mysqlTable,
  varchar,
  int,
  bigint,
  uniqueIndex,
  varbinary,
} from 'drizzle-orm/mysql-core';
import { kstDatetime } from './kst-datetime';

export const tbAccount = mysqlTable(
  'tb_account',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    createdAt: kstDatetime('created_at', { fsp: 6 }),
    email: varchar('email', { length: 64 }),
    failCount: int('fail_count').default(0),
    lastLoginAt: kstDatetime('last_login_at', { fsp: 6 }),
    loginId: varbinary('login_id', { length: 63 }).notNull(),
    name: varchar('name', { length: 255 }),
    userType: varchar('user_type', { length: 20 }).notNull(),
    password: varchar('password', { length: 255 }),
    status: varchar('status', { length: 255 }),
    otpSecretKey: varchar('otp_secret_key', { length: 20 }),
    customerNo: varchar('customer_no', { length: 40 }),
    lastPasswordChangedAt: kstDatetime('last_password_changed_at', { fsp: 6 }),
    updatedAt: kstDatetime('updated_at', { fsp: 6 }),
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
    createdAt: kstDatetime('created_at', { fsp: 6 }).notNull(),
    updatedAdm: varchar('updated_adm', { length: 50 }),
    updatedAt: kstDatetime('updated_at', { fsp: 6 }),
  },
  (table) => [uniqueIndex('ux_user_group_01').on(table.name, table.type)],
);

export const tbLoginHistory = mysqlTable('tb_login_history', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  loginId: varchar('login_id', { length: 63 }).notNull(),
  accountId: bigint('account_id', { mode: 'number' }),
  addrIp: varchar('addr_ip', { length: 255 }).notNull(),
  failCount: int('fail_count'),
  status: varchar('status', { length: 255 }),
  accessChannel: varchar('access_channel', { length: 50 }),
  loginAt: kstDatetime('login_at', { fsp: 6 }),
  failedAt: kstDatetime('falied_at', { fsp: 6 }),
});
