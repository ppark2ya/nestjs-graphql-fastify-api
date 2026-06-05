import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { tbAccount, tbLoginHistory } from '../database/schema';

export interface LoginRequestMeta {
  clientIp: string;
  accessChannel?: string | null;
}

type Account = typeof tbAccount.$inferSelect;

@Injectable()
export class LoginHistoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async recordSuccess(
    account: Account,
    meta: LoginRequestMeta,
    loginAt = new Date(),
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(tbAccount)
        .set({ failCount: 0, lastLoginAt: loginAt })
        .where(eq(tbAccount.id, account.id));

      await tx.insert(tbLoginHistory).values({
        loginId: this.normalizeLoginId(account.loginId),
        accountId: account.id,
        addrIp: this.normalizeClientIp(meta.clientIp),
        failCount: 0,
        status: account.status,
        accessChannel: meta.accessChannel ?? null,
        loginAt,
        failedAt: null,
      });
    });
  }

  async recordFailure(
    account: Account,
    meta: LoginRequestMeta,
    failCount: number,
    status: string | null,
    failedAt = new Date(),
  ): Promise<void> {
    await this.db.insert(tbLoginHistory).values({
      loginId: this.normalizeLoginId(account.loginId),
      accountId: account.id,
      addrIp: this.normalizeClientIp(meta.clientIp),
      failCount,
      status,
      accessChannel: meta.accessChannel ?? null,
      loginAt: null,
      failedAt,
    });
  }

  private normalizeLoginId(loginId: Buffer | string): string {
    return typeof loginId === 'string' ? loginId : loginId.toString('utf8');
  }

  private normalizeClientIp(clientIp: string | null | undefined): string {
    return clientIp?.trim() || 'unknown';
  }
}
