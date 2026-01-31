import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';

/**
 * Mock AuthService - DB 연결 없이 테스트용 하드코딩 데이터 사용
 * 환경변수 USE_MOCK_AUTH=true 로 활성화
 */

// Mock 사용자 데이터
const MOCK_USERS = [
  {
    id: 1,
    username: 'admin',
    password: 'admin123',
    roles: 'admin',
    twoFactorEnabled: false,
    twoFactorSecret: null,
  },
  {
    id: 2,
    username: 'user',
    password: 'user123',
    roles: 'user',
    twoFactorEnabled: true,
    twoFactorSecret: 'JBSWY3DPEHPK3PXP', // Base32 encoded secret
  },
  {
    id: 3,
    username: 'test',
    password: 'test123',
    roles: 'user',
    twoFactorEnabled: false,
    twoFactorSecret: null,
  },
];

// Mock 토큰 생성 (간단한 Base64)
const generateMockToken = (payload: object, prefix: string): string => {
  const data = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64');
  return `${prefix}.${data}.mock`;
};

@Injectable()
export class MockAuthService {
  async login(username: string, password: string): Promise<AuthResponse> {
    const user = MOCK_USERS.find(u => u.username === username);
    
    if (!user || user.password !== password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.twoFactorEnabled) {
      const twoFactorToken = generateMockToken({ sub: user.id, type: '2fa' }, 'mock2fa');
      return {
        requiresTwoFactor: true,
        twoFactorToken,
      };
    }

    const tokens = this.generateTokens(user);
    return {
      requiresTwoFactor: false,
      tokens,
    };
  }

  async verifyTwoFactor(twoFactorToken: string, totpCode: string): Promise<AuthTokens> {
    // Mock: 토큰에서 사용자 ID 추출 (실제로는 JWT 검증 필요)
    if (!twoFactorToken.startsWith('mock2fa.')) {
      throw new UnauthorizedException('Invalid or expired 2FA token');
    }

    // Mock: 아무 6자리 코드나 허용 (테스트 용도)
    if (!/^\d{6}$/.test(totpCode)) {
      throw new UnauthorizedException('Invalid TOTP code format');
    }

    // 2FA 활성화된 사용자 찾기
    const user = MOCK_USERS.find(u => u.twoFactorEnabled);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateTokens(user);
  }

  async setupTwoFactor(userId: number, totpCode: string) {
    const user = MOCK_USERS.find(u => u.id === userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    // Mock: TOTP 코드가 비어있으면 secret 반환, 있으면 활성화
    if (!totpCode) {
      const secret = 'MOCK_SECRET_' + Date.now();
      return {
        secret,
        keyUri: `otpauth://totp/AuthApp:${user.username}?secret=${secret}&issuer=AuthApp`,
      };
    }

    // Mock: 아무 6자리 코드나 허용
    if (!/^\d{6}$/.test(totpCode)) {
      throw new BadRequestException('Invalid TOTP code');
    }

    return { enabled: true };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    // Mock: refresh 토큰 형식 검증
    if (!refreshToken.startsWith('mockRefresh.')) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 첫 번째 사용자 토큰 반환 (테스트용)
    const user = MOCK_USERS[0];
    return this.generateTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    // Mock: 항상 성공
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // 실제로는 토큰 무효화 처리
  }

  private generateTokens(user: typeof MOCK_USERS[0]): AuthTokens {
    return {
      accessToken: generateMockToken(
        { sub: user.id, username: user.username, roles: user.roles.split(',') },
        'mockAccess'
      ),
      refreshToken: generateMockToken({ sub: user.id }, 'mockRefresh'),
      expiresIn: 3600,
    };
  }
}
