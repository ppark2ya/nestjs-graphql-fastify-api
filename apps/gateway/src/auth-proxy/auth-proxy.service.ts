import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';

const TCP_TIMEOUT = 5000;

@Injectable()
export class AuthProxyService implements OnModuleInit {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  async onModuleInit() {
    try {
      await this.authClient.connect();
    } catch (error) {
      console.warn(
        '⚠️ Auth service not available yet. Will retry on first request.',
      );
    }
  }

  async login(
    loginId: string,
    password: string,
    userType: string,
  ): Promise<AuthResponse> {
    return this.sendMessage<AuthResponse>('auth.login', {
      loginId,
      password,
      userType,
    });
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

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.sendMessage<AuthTokens>('auth.refresh', { refreshToken });
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    return this.sendMessage('auth.password', {
      userId,
      currentPassword,
      newPassword,
    });
  }

  private async sendMessage<T>(pattern: string, data: any): Promise<T> {
    return firstValueFrom(
      this.authClient.send<T>(pattern, data).pipe(
        timeout(TCP_TIMEOUT),
        catchError((error) => {
          throw error;
        }),
      ),
    );
  }
}
