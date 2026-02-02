import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { users } from '../database/schema';

@Injectable()
export class UserService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByUsername(username: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return user ?? null;
  }

  async findById(id: number) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  }

  async updateTwoFactorSecret(userId: number, secret: string) {
    await this.db
      .update(users)
      .set({ twoFactorSecret: secret })
      .where(eq(users.id, userId));
  }

  async enableTwoFactor(userId: number) {
    await this.db
      .update(users)
      .set({ twoFactorEnabled: true })
      .where(eq(users.id, userId));
  }
}
