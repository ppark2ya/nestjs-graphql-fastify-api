import { Injectable } from '@nestjs/common';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';
import { AuthErrorException } from './filters/auth-error.filter';
import { AUTH_ERROR } from './constants/auth-error';

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
    roleType: 'VIEWER',
    customerNo: 'C002',
    status: 'ACTIVE',
    otpSecretKey: null,
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

@Injectable()
export class MockAuthService {
  async login(
    loginId: string,
    password: string,
    userType: string,
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
      'ADMIN_BO',
      'CUSTOMER_BO',
      'PARTNER_BO',
    ].includes(userType);
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

    const account = MOCK_ACCOUNTS[0];
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
    return this.generateTokens(MOCK_ACCOUNTS[0]);
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    _newPassword: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{ success: boolean }> {
    const account = MOCK_ACCOUNTS.find((a) => a.id === userId);
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
    return {
      accessToken: generateMockToken(
        {
          sub: account.id,
          loginId: account.loginId,
          name: account.name,
          userType: account.userType,
          roleType: account.roleType,
          customerNo: account.customerNo,
        },
        'mockAccess',
      ),
      refreshToken: generateMockToken(
        { sub: account.id, userType: account.userType },
        'mockRefresh',
      ),
      expiresIn: 3600,
    };
  }
}
