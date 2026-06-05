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
import {
  LoginHistoryService,
  type LoginRequestMeta,
} from '../login-history/login-history.service';
import { tbAccount } from '../database/schema';

type AccessTokenPayload = Omit<JwtPayload, 'iat' | 'exp' | 'jti'>;
type ChangePasswordCredential = {
  accessToken?: string;
  passwordChangeToken?: string;
};
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
    private readonly loginHistoryService: LoginHistoryService,
  ) {}

  async login(
    loginId: string,
    password: string,
    userType: string,
    meta: LoginRequestMeta,
  ): Promise<AuthResponse> {
    const account = await this.accountService.findByLoginIdAndUserType(
      loginId,
      userType,
    );
    if (!account) {
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    if (
      account.status === (AccountStatus.LOCKED as string) ||
      (account.failCount ?? 0) >= AUTH_CONSTANTS.MAX_FAIL_COUNT
    ) {
      await this.handleLockedLogin(account, meta);
      this.throwAuthError('ACCOUNT_LOCKED');
    }

    this.validateAccountStatus(account.status);

    const isPasswordValid = await this.verifyPassword(
      password,
      account.password,
    );
    if (!isPasswordValid) {
      await this.handleFailedLogin(account, meta, (account.failCount ?? 0) + 1);
      this.throwAuthError('INVALID_CREDENTIALS');
    }

    await this.validatePasswordExpiry(account);

    if (TWO_FACTOR_REQUIRED_TYPES.has(userType)) {
      const twoFactorToken = await this.jwtTokenService.signTwoFactorToken(
        String(account.id),
        userType,
      );
      return { requiresTwoFactor: true, twoFactorToken };
    }

    const tokens = await this.issueTokens(account);
    await this.loginHistoryService.recordSuccess(account, meta);
    return { requiresTwoFactor: false, tokens };
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
    meta: LoginRequestMeta,
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

    const tokens = await this.issueTokens(account);
    await this.loginHistoryService.recordSuccess(account, meta);
    return tokens;
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
    credential: ChangePasswordCredential,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const accountId = await this.resolveChangePasswordAccountId(credential);
    const account = await this.accountService.findById(accountId);
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

  private async validatePasswordExpiry(
    account: typeof tbAccount.$inferSelect,
  ): Promise<void> {
    const lastChanged = account.lastPasswordChangedAt;
    if (!lastChanged) return;

    const daysSinceChange = Math.floor(
      (Date.now() - new Date(lastChanged).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceChange >= AUTH_CONSTANTS.PASSWORD_EXPIRY_DAYS) {
      const passwordChangeToken =
        await this.jwtTokenService.signPasswordChangeToken(
          String(account.id),
          account.userType,
        );
      this.throwAuthError('PASSWORD_EXPIRED', { passwordChangeToken });
    }
  }

  private async resolveChangePasswordAccountId({
    accessToken,
    passwordChangeToken,
  }: ChangePasswordCredential): Promise<number> {
    if (passwordChangeToken) {
      const payload = await this.jwtTokenService
        .verifyPasswordChangeToken(passwordChangeToken)
        .catch(() => {
          this.throwAuthError('TOKEN_EXPIRED');
        });
      return Number(payload.sub);
    }

    if (accessToken) {
      const payload = await this.jwtTokenService
        .verifyToken(accessToken)
        .catch(() => {
          this.throwAuthError('TOKEN_EXPIRED');
        });
      if ((payload as { type?: string }).type) {
        this.throwAuthError('TOKEN_EXPIRED');
      }
      return Number(payload.sub);
    }

    this.throwAuthError('TOKEN_EXPIRED');
  }

  private async handleFailedLogin(
    account: typeof tbAccount.$inferSelect,
    meta: LoginRequestMeta,
    newFailCount: number,
  ): Promise<void> {
    await this.accountService.incrementFailCount(account.id);
    const status =
      newFailCount >= AUTH_CONSTANTS.MAX_FAIL_COUNT
        ? AccountStatus.LOCKED
        : account.status;
    if (newFailCount >= AUTH_CONSTANTS.MAX_FAIL_COUNT) {
      await this.accountService.lockAccount(account.id);
    }
    await this.loginHistoryService.recordFailure(
      account,
      meta,
      newFailCount,
      status,
    );
  }

  private async handleLockedLogin(
    account: typeof tbAccount.$inferSelect,
    meta: LoginRequestMeta,
  ): Promise<void> {
    if (account.status !== (AccountStatus.LOCKED as string)) {
      await this.accountService.lockAccount(account.id);
    }
    await this.loginHistoryService.recordFailure(
      account,
      meta,
      account.failCount ?? AUTH_CONSTANTS.MAX_FAIL_COUNT,
      AccountStatus.LOCKED,
    );
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

  private throwAuthError(
    key: keyof typeof AUTH_ERROR,
    extensions?: Record<string, unknown>,
  ): never {
    const error = AUTH_ERROR[key];
    throw new AuthErrorException(
      error.code,
      error.message,
      error.status,
      extensions,
    );
  }
}
