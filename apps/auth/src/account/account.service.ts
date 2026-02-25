import { Inject, Injectable } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { tbAccount } from '../database/schema';
import { AccountStatus } from '../auth/enums';

@Injectable()
export class AccountService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByLoginIdAndUserType(loginId: string, userType: string) {
    const [account] = await this.db
      .select()
      .from(tbAccount)
      .where(
        and(
          sql`${tbAccount.loginId} = ${loginId}`,
          eq(tbAccount.userType, userType),
        ),
      )
      .limit(1);
    return account ?? null;
  }

  async findById(id: number) {
    const [account] = await this.db
      .select()
      .from(tbAccount)
      .where(eq(tbAccount.id, id))
      .limit(1);
    return account ?? null;
  }

  async incrementFailCount(id: number) {
    await this.db
      .update(tbAccount)
      .set({ failCount: sql`${tbAccount.failCount} + 1` })
      .where(eq(tbAccount.id, id));
  }

  async lockAccount(id: number) {
    await this.db
      .update(tbAccount)
      .set({ status: AccountStatus.LOCKED })
      .where(eq(tbAccount.id, id));
  }

  async resetFailCountAndUpdateLoginAt(id: number) {
    await this.db
      .update(tbAccount)
      .set({ failCount: 0, lastLoginAt: new Date() })
      .where(eq(tbAccount.id, id));
  }

  async updatePassword(id: number, hashedPassword: string) {
    await this.db
      .update(tbAccount)
      .set({
        password: hashedPassword,
        lastPasswordChangedAt: new Date(),
      })
      .where(eq(tbAccount.id, id));
  }
}
