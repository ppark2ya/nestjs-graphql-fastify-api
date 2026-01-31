import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';

const TCP_TIMEOUT = 5000; // 5초 타임아웃

@Injectable()
export class AuthProxyService implements OnModuleInit {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  async onModuleInit() {
    // TCP 클라이언트 연결 시도 (실패해도 앱은 시작됨)
    try {
      await this.authClient.connect();
    } catch (error) {
      console.warn('⚠️ Auth service not available yet. Will retry on first request.');
    }
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    return this.sendMessage<AuthResponse>('auth.login', { username, password });
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
  ): Promise<AuthTokens> {
    return this.sendMessage<AuthTokens>('auth.2fa.verify', {
      twoFactorToken,
      totpCode,
    });
  }

  async setupTwoFactor(
    userId: number,
    totpCode: string,
  ): Promise<{ secret?: string; keyUri?: string; enabled?: boolean }> {
    return this.sendMessage('auth.2fa.setup', { userId, totpCode });
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.sendMessage<AuthTokens>('auth.refresh', { refreshToken });
  }

  async logout(refreshToken: string): Promise<boolean> {
    await this.sendMessage('auth.logout', { refreshToken });
    return true;
  }

  /**
   * TCP 메시지 전송 헬퍼 (타임아웃 및 에러 처리 포함)
   */
  private async sendMessage<T>(pattern: string, data: any): Promise<T> {
    return firstValueFrom(
      this.authClient.send<T>(pattern, data).pipe(
        timeout(TCP_TIMEOUT),
        catchError((error) => {
          // RPC 에러를 적절한 HTTP 에러로 변환
          throw error;
        }),
      ),
    );
  }
}

