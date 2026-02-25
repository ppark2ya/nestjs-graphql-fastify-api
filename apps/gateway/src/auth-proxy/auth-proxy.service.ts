import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { Env } from '../env.schema';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';

@Injectable()
export class AuthProxyService {
  private readonly authBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly configService: ConfigService<Env>,
  ) {
    this.authBaseUrl = this.configService.getOrThrow('AUTH_SERVICE_URL', {
      infer: true,
    });
  }

  async login(
    loginId: string,
    password: string,
    userType: string,
  ): Promise<AuthResponse> {
    return this.post<AuthResponse>(
      '/auth/login',
      { loginId, password },
      { 'X-User-Type': userType },
    );
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
  ): Promise<AuthTokens> {
    return this.post<AuthTokens>(
      '/auth/2fa/verify',
      { totpCode },
      { 'X-2FA-Token': twoFactorToken },
    );
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.post<AuthTokens>('/auth/refresh', { refreshToken });
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    return this.post<{ success: boolean }>('/auth/password', {
      currentPassword,
      newPassword,
    });
  }

  private async post<T>(
    path: string,
    data: any,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.circuitBreaker.fire('auth-server', async () => {
      const res = await firstValueFrom(
        this.httpService.post<T>(`${this.authBaseUrl}${path}`, data, {
          headers,
        }),
      );
      return res.data;
    });
  }
}
