import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';

const AUTH_SERVER_URL =
  process.env.AUTH_SERVER_URL ?? 'http://localhost:4001';

@Injectable()
export class AuthProxyService {
  constructor(
    private readonly httpService: HttpService,
    private readonly cbService: CircuitBreakerService,
  ) {}

  async login(username: string, password: string): Promise<AuthResponse> {
    return this.cbService.fire('auth-server', async () => {
      const { data } = await firstValueFrom(
        this.httpService.post<AuthResponse>(`${AUTH_SERVER_URL}/auth/login`, {
          username,
          password,
        }),
      );
      return data;
    });
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
  ): Promise<AuthTokens> {
    return this.cbService.fire('auth-server', async () => {
      const { data } = await firstValueFrom(
        this.httpService.post<AuthTokens>(
          `${AUTH_SERVER_URL}/auth/2fa/verify`,
          { twoFactorToken, totpCode },
        ),
      );
      return data;
    });
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.cbService.fire('auth-server', async () => {
      const { data } = await firstValueFrom(
        this.httpService.post<AuthTokens>(`${AUTH_SERVER_URL}/auth/refresh`, {
          refreshToken,
        }),
      );
      return data;
    });
  }

  async logout(refreshToken: string): Promise<boolean> {
    return this.cbService.fire('auth-server', async () => {
      await firstValueFrom(
        this.httpService.post(`${AUTH_SERVER_URL}/auth/logout`, {
          refreshToken,
        }),
      );
      return true;
    });
  }
}
