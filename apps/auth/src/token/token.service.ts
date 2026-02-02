import { Inject, Injectable } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { createHash } from 'crypto';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { refreshTokens } from '../database/schema';

@Injectable()
export class TokenService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async saveRefreshToken(
    userId: number,
    token: string,
    jti: string,
    expiresAt: Date,
  ) {
    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash: this.hashToken(token),
      jti,
      expiresAt,
    });
  }

  async findValidRefreshToken(jti: string) {
    const [token] = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(eq(refreshTokens.jti, jti), isNull(refreshTokens.revokedAt)),
      )
      .limit(1);
    return token ?? null;
  }

  async revokeRefreshToken(jti: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.jti, jti));
  }

  async revokeAllUserTokens(userId: number) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }
}
