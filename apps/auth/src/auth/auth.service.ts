import { Injectable } from '@nestjs/common';
import * as bcryptjs from 'bcryptjs';
import { AccountService } from '../account/account.service';
import { JwtTokenService } from './jwt.service';
import { TotpService } from './totp.service';
import { AUTH_CONSTANTS } from '@monorepo/shared';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';
import { AccountStatus } from './enums';
import { TWO_FACTOR_REQUIRED_TYPES } from './enums/user-type.enum';
import { AUTH_ERROR } from './constants/auth-error';
import { AuthErrorException } from './filters/auth-error.filter';

@Injectable()
export class AuthService {
  constructor(
    private readonly accountService: AccountService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly totpService: TotpService,
  ) {}

  async login(
    loginId: string,
    password: string,
    userType: string,
  ): Promise<AuthResponse> {
    const account = await this.accountService.findByLoginIdAndUserType(
      loginId,
      userType,
    );
    if (!account) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    this.validateAccountStatus(account.status);

    const isPasswordValid = await this.verifyPassword(
      password,
      account.password,
    );
    if (!isPasswordValid) {
      await this.handleFailedLogin(account.id, (account.failCount ?? 0) + 1);
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    await this.accountService.resetFailCountAndUpdateLoginAt(account.id);

    this.validatePasswordExpiry(account.lastPasswordChangedAt);

    if (TWO_FACTOR_REQUIRED_TYPES.has(userType)) {
      const twoFactorToken = await this.jwtTokenService.signTwoFactorToken(
        String(account.id),
        userType,
      );
      return { requiresTwoFactor: true, twoFactorToken };
    }

    const tokens = await this.issueTokens(account);
    return { requiresTwoFactor: false, tokens };
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
  ): Promise<AuthTokens> {
    const { sub } = await this.jwtTokenService
      .verifyTwoFactorToken(twoFactorToken)
      .catch(() => {
        this.throwAuthError('TOKEN_EXPIRED');
      });

    const account = await this.accountService.findById(Number(sub));
    if (!account || !account.otpSecretKey) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    const isValid = this.totpService.verify(totpCode, account.otpSecretKey);
    if (!isValid) {
      this.throwAuthError('INVALID_OTP');
    }

    return this.issueTokens(account);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.jwtTokenService
      .verifyToken(refreshToken)
      .catch(() => {
        this.throwAuthError('TOKEN_EXPIRED');
      });

    const account = await this.accountService.findById(Number(payload.sub));
    if (!account) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    return this.issueTokens(account);
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const account = await this.accountService.findById(userId);
    if (!account) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    const isCurrentValid = await this.verifyPassword(
      currentPassword,
      account.password,
    );
    if (!isCurrentValid) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    const hashedPassword = this.hashPassword(newPassword);
    await this.accountService.updatePassword(account.id, hashedPassword);

    return { success: true };
  }

  private validateAccountStatus(status: string | null): void {
    if (!status || status === (AccountStatus.ACTIVE as string)) return;

    const statusErrorMap: Record<string, keyof typeof AUTH_ERROR> = {
      [AccountStatus.PENDING]: 'ACCOUNT_PENDING',
      [AccountStatus.IN_ACTIVE]: 'ACCOUNT_INACTIVE',
      [AccountStatus.DELETE]: 'ACCOUNT_DELETED',
      [AccountStatus.LOCKED]: 'ACCOUNT_LOCKED',
    };

    const errorKey = statusErrorMap[status];
    if (errorKey) {
      this.throwAuthError(errorKey);
    }
  }

  private validatePasswordExpiry(lastChanged: Date | null): void {
    if (!lastChanged) return;

    const daysSinceChange = Math.floor(
      (Date.now() - new Date(lastChanged).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceChange >= AUTH_CONSTANTS.PASSWORD_EXPIRY_DAYS) {
      this.throwAuthError('PASSWORD_EXPIRED');
    }
  }

  private async handleFailedLogin(
    accountId: number,
    newFailCount: number,
  ): Promise<void> {
    await this.accountService.incrementFailCount(accountId);
    if (newFailCount >= AUTH_CONSTANTS.MAX_FAIL_COUNT) {
      await this.accountService.lockAccount(accountId);
    }
  }

  private async verifyPassword(
    plain: string,
    stored: string | null,
  ): Promise<boolean> {
    if (!stored) return false;
    const hash = stored.replace(/^\{bcrypt\}/, '');
    return bcryptjs.compare(plain, hash);
  }

  private hashPassword(plain: string): string {
    const hash = bcryptjs.hashSync(plain, 10);
    return `{bcrypt}${hash}`;
  }

  private async issueTokens(account: {
    id: number;
    loginId: Buffer | string;
    name: string | null;
    userType: string;
    roleType: string | null;
    customerNo: string | null;
  }): Promise<AuthTokens> {
    const sub = String(account.id);
    const loginId =
      account.loginId instanceof Buffer
        ? account.loginId.toString('utf8')
        : String(account.loginId);

    const [accessResult, refreshResult] = await Promise.all([
      this.jwtTokenService.signAccessToken({
        sub,
        loginId,
        name: account.name ?? '',
        userType: account.userType,
        roleType: account.roleType ?? '',
        customerNo: account.customerNo ?? '',
      }),
      this.jwtTokenService.signRefreshToken(sub, account.userType),
    ]);

    return {
      accessToken: accessResult.token,
      refreshToken: refreshResult.token,
      expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY_SECONDS,
    };
  }

  private throwAuthError(key: keyof typeof AUTH_ERROR): never {
    const error = AUTH_ERROR[key];
    throw new AuthErrorException(error.code, error.message, error.status);
  }
}
