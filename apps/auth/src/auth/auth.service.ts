import { Injectable } from '@nestjs/common';
import * as bcryptjs from 'bcryptjs';
import { AccountService } from '../account/account.service';
import { JwtTokenService } from './jwt.service';
import { TotpService } from './totp.service';
import { AUTH_CONSTANTS } from '@monorepo/shared';
import type { AuthResponse, AuthTokens, JwtPayload } from '@monorepo/shared';
import { AccountStatus } from './enums';
import { TWO_FACTOR_REQUIRED_TYPES } from './enums/user-type.enum';
import { AUTH_ERROR } from './constants/auth-error';
import { AuthErrorException } from './filters/auth-error.filter';

type AccessTokenPayload = Omit<JwtPayload, 'iat' | 'exp' | 'jti'>;
const SPRING_COMPATIBLE_ROLE_TYPES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'MEMBER',
]);

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

    this.validatePasswordExpiry(account.lastPasswordChangedAt);

    if (TWO_FACTOR_REQUIRED_TYPES.has(userType)) {
      await this.accountService.resetFailCount(account.id);
      const twoFactorToken = await this.jwtTokenService.signTwoFactorToken(
        String(account.id),
        userType,
      );
      const tOtpUrl = await this.createTotpRegistrationUrlIfRequired(account);
      return { requiresTwoFactor: true, twoFactorToken, tOtpUrl };
    }

    await this.accountService.resetFailCountAndUpdateLoginAt(account.id);
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

    await this.accountService.resetFailCountAndUpdateLoginAt(account.id);
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

  private async createTotpRegistrationUrlIfRequired(account: {
    id: number;
    loginId: Buffer | string;
    otpSecretKey: string | null;
    lastLoginAt: Date | null;
  }): Promise<string | null> {
    if (account.otpSecretKey !== null && account.lastLoginAt !== null) {
      return null;
    }

    const otpSecretKey = this.totpService.generateSecret();
    await this.accountService.updateOtpSecretKey(account.id, otpSecretKey);

    return this.totpService.generateKeyUri(
      this.normalizeLoginId(account.loginId),
      otpSecretKey,
    );
  }

  private async issueTokens(account: {
    id: number;
    loginId: Buffer | string;
    name: string | null;
    userType: string;
    roleType: string | null;
    customerNo: string | null;
  }): Promise<AuthTokens> {
    const accessTokenPayload = this.buildAccessTokenPayload(account);

    const [accessResult, refreshResult] = await Promise.all([
      this.jwtTokenService.signAccessToken(accessTokenPayload),
      this.jwtTokenService.signRefreshToken(
        accessTokenPayload.sub,
        accessTokenPayload.userType,
      ),
    ]);

    if (!accessResult.jti.trim() || !refreshResult.jti.trim()) {
      this.throwAuthError('INVALID_TOKEN_CLAIMS');
    }

    return {
      accessToken: accessResult.token,
      refreshToken: refreshResult.token,
      expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY_SECONDS,
    };
  }

  private buildAccessTokenPayload(account: {
    id: number;
    loginId: Buffer | string;
    name: string | null;
    userType: string;
    roleType: string | null;
    customerNo: string | null;
  }): AccessTokenPayload {
    const payload: AccessTokenPayload = {
      sub: this.requireNonBlank(String(account.id), 'sub'),
      loginId: this.requireNonBlank(
        this.normalizeLoginId(account.loginId),
        'loginId',
      ),
      name: this.requireNonBlank(account.name, 'name'),
      userType: this.requireNonBlank(account.userType, 'userType'),
      customerNo: this.normalizeOptionalClaim(account.customerNo),
    };
    const roleType = this.normalizeRoleTypeClaim(account.roleType);
    if (roleType) {
      payload.roleType = roleType;
    }

    return payload;
  }

  private normalizeLoginId(loginId: Buffer | string): string {
    return typeof loginId === 'string' ? loginId : loginId.toString('utf8');
  }

  private requireNonBlank(
    value: string | null | undefined,
    _claimName: string,
  ): string {
    const normalized = value?.trim();
    if (!normalized) {
      this.throwAuthError('INVALID_TOKEN_CLAIMS');
    }
    return normalized;
  }

  private normalizeOptionalClaim(value: string | null | undefined): string {
    return value?.trim() ?? '';
  }

  private normalizeRoleTypeClaim(
    value: string | null | undefined,
  ): string | undefined {
    const roleType = value?.trim();
    if (!roleType) {
      return undefined;
    }

    return SPRING_COMPATIBLE_ROLE_TYPES.has(roleType) ? roleType : undefined;
  }

  private throwAuthError(key: keyof typeof AUTH_ERROR): never {
    const error = AUTH_ERROR[key];
    throw new AuthErrorException(error.code, error.message, error.status);
  }
}
