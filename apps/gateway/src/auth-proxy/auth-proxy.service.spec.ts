import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { of, throwError } from 'rxjs';
import { AuthProxyService } from './auth-proxy.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

function createAuthAxiosError(): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    { url: 'http://auth:4001/auth/login' } as InternalAxiosRequestConfig,
    undefined,
    {
      data: {
        code: '11004',
        message:
          '마지막 패스워드 변경 후 90일이 지났습니다. 패스워드를 변경해주세요.',
        timestamp: '2026-05-20 17:00:00',
      },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {
        url: 'http://auth:4001/auth/login',
      } as InternalAxiosRequestConfig,
    },
  );
}

describe('AuthProxyService', () => {
  let service: AuthProxyService;
  let httpService: { post: jest.Mock };
  let circuitBreaker: { fire: jest.Mock };

  beforeEach(() => {
    httpService = {
      post: jest.fn(),
    };
    circuitBreaker = {
      fire: jest.fn((_domain: string, action: () => Promise<unknown>) =>
        action(),
      ),
    };

    service = new AuthProxyService(
      httpService as unknown as HttpService,
      circuitBreaker as unknown as CircuitBreakerService,
      {
        getOrThrow: jest.fn().mockReturnValue('http://auth:4001'),
      } as unknown as ConfigService,
    );
  });

  it('propagates structured auth AxiosError without wrapping it', async () => {
    const axiosError = createAuthAxiosError();
    httpService.post.mockReturnValue(throwError(() => axiosError));

    await expect(
      service.login('expired', 'password123', 'ADMIN'),
    ).rejects.toBe(axiosError);
    expect(circuitBreaker.fire).toHaveBeenCalledWith(
      'auth-server',
      expect.any(Function),
    );
  });

  it('throws BadGatewayException only when a successful response has no data', async () => {
    httpService.post.mockReturnValue(of({ data: undefined }));
    const promise = service.login('admin', 'password123', 'ADMIN');

    await expect(promise).rejects.toThrow(BadGatewayException);
    await expect(promise).rejects.toThrow(
      '인증 서버 응답이 올바르지 않습니다.',
    );
  });
});
