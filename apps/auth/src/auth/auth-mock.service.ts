import { Injectable } from '@nestjs/common';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';
import { AuthErrorException } from './filters/auth-error.filter';
import { AUTH_ERROR } from './constants/auth-error';
import { UserType } from './enums/user-type.enum';
import type { LoginRequestMeta } from '../login-history/login-history.service';

const SPRING_COMPATIBLE_ROLE_TYPES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'MEMBER',
]);

const MOCK_ACCOUNTS = [
  {
    id: 1,
    loginId: 'admin',
    password: 'admin123',
    name: '관리자',
    userType: 'ADMIN_BO',
    roleType: 'ADMIN',
    customerNo: 'C001',
    status: 'ACTIVE',
    otpSecretKey: 'JBSWY3DPEHPK3PXP',
    failCount: 0,
    lastPasswordChangedAt: new Date(),
  },
  {
    id: 2,
    loginId: 'dashboard',
    password: 'dash123',
    name: '대시보드',
    userType: 'DASHBOARD',
    roleType: 'MEMBER',
    customerNo: 'C002',
    status: 'ACTIVE',
    otpSecretKey: null,
    failCount: 0,
    lastPasswordChangedAt: new Date(),
  },
  {
    id: 3,
    loginId: 'lottecard',
    password: 'lotte123',
    name: '롯데카드',
    userType: 'LOTTE_CARD_BO',
    roleType: null,
    customerNo: 'LC001',
    status: 'ACTIVE',
    otpSecretKey: 'JBSWY3DPEHPK3PXP',
    failCount: 0,
    lastPasswordChangedAt: new Date(),
  },
];

const generateMockToken = (payload: object, prefix: string): string => {
  const data = Buffer.from(
    JSON.stringify({ ...payload, iat: Date.now() }),
  ).toString('base64');
  return `${prefix}.${data}.mock`;
};

const parseMockTokenPayload = (
  token: string,
): { sub?: number | string; type?: string } | null => {
  try {
    const [, data] = token.split('.');
    if (!data) return null;
    return JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as {
      sub?: number | string;
    };
  } catch {
    return null;
  }
};

@Injectable()
export class MockAuthService {
  async login(
    loginId: string,
    password: string,
    userType: string,
    _meta?: LoginRequestMeta,
  ): Promise<AuthResponse> {
    const account = MOCK_ACCOUNTS.find(
      (a) => a.loginId === loginId && a.userType === userType,
    );

    if (!account || account.password !== password) {
      throw new AuthErrorException(
        AUTH_ERROR.INVALID_CREDENTIALS.code,
        AUTH_ERROR.INVALID_CREDENTIALS.message,
        AUTH_ERROR.INVALID_CREDENTIALS.status,
      );
    }

    const requiresTwoFactor = [
      UserType.ADMIN_BO,
      UserType.CUSTOMER_BO,
      UserType.PARTNER_BO,
      UserType.LOTTE_CARD_BO,
    ].includes(userType as UserType);
    if (requiresTwoFactor) {
      const twoFactorToken = generateMockToken(
        { sub: account.id, type: '2fa', userType },
        'mock2fa',
      );
      return { requiresTwoFactor: true, twoFactorToken };
    }

    return { requiresTwoFactor: false, tokens: this.generateTokens(account) };
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
    _meta?: LoginRequestMeta,
  ): Promise<AuthTokens> {
    if (!twoFactorToken.startsWith('mock2fa.')) {
      throw new AuthErrorException(
        AUTH_ERROR.TOKEN_EXPIRED.code,
        AUTH_ERROR.TOKEN_EXPIRED.message,
        AUTH_ERROR.TOKEN_EXPIRED.status,
      );
    }
    if (!/^\d{6}$/.test(totpCode)) {
      throw new AuthErrorException(
        AUTH_ERROR.INVALID_OTP.code,
        AUTH_ERROR.INVALID_OTP.message,
        AUTH_ERROR.INVALID_OTP.status,
      );
    }

    const accountId = Number(parseMockTokenPayload(twoFactorToken)?.sub);
    const account = MOCK_ACCOUNTS.find((a) => a.id === accountId);
    if (!account) {
      throw new AuthErrorException(
        AUTH_ERROR.TOKEN_EXPIRED.code,
        AUTH_ERROR.TOKEN_EXPIRED.message,
        AUTH_ERROR.TOKEN_EXPIRED.status,
      );
    }

    return this.generateTokens(account);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken.startsWith('mockRefresh.')) {
      throw new AuthErrorException(
        AUTH_ERROR.TOKEN_EXPIRED.code,
        AUTH_ERROR.TOKEN_EXPIRED.message,
        AUTH_ERROR.TOKEN_EXPIRED.status,
      );
    }
    const accountId = Number(parseMockTokenPayload(refreshToken)?.sub);
    const account = MOCK_ACCOUNTS.find((a) => a.id === accountId);
    if (!account) {
      throw new AuthErrorException(
        AUTH_ERROR.TOKEN_EXPIRED.code,
        AUTH_ERROR.TOKEN_EXPIRED.message,
        AUTH_ERROR.TOKEN_EXPIRED.status,
      );
    }
    return this.generateTokens(account);
  }

  async changePassword(
    credential: { accessToken?: string; passwordChangeToken?: string },
    currentPassword: string,
    _newPassword: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{ success: boolean }> {
    const token = credential.passwordChangeToken ?? credential.accessToken;
    const payload = token ? parseMockTokenPayload(token) : null;
    const account = MOCK_ACCOUNTS.find((a) => a.id === Number(payload?.sub));
    if (!account || account.password !== currentPassword) {
      throw new AuthErrorException(
        AUTH_ERROR.INVALID_CREDENTIALS.code,
        AUTH_ERROR.INVALID_CREDENTIALS.message,
        AUTH_ERROR.INVALID_CREDENTIALS.status,
      );
    }
    return { success: true };
  }

  private generateTokens(account: (typeof MOCK_ACCOUNTS)[0]): AuthTokens {
    const accessPayload: Record<string, string | number> = {
      sub: account.id,
      loginId: account.loginId,
      name: account.name,
      userType: account.userType,
      customerNo: account.customerNo,
    };
    const roleType = account.roleType?.trim();
    if (roleType && SPRING_COMPATIBLE_ROLE_TYPES.has(roleType)) {
      accessPayload.roleType = roleType;
    }

    return {
      accessToken: generateMockToken(accessPayload, 'mockAccess'),
      refreshToken: generateMockToken(
        { sub: account.id, userType: account.userType },
        'mockRefresh',
      ),
      expiresIn: 3600,
    };
  }
}
