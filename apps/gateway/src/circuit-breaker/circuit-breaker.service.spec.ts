import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { CircuitBreakerService } from './circuit-breaker.service';

function createAuthAxiosError(): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    { url: 'http://auth:4001/auth/2fa/verify' } as InternalAxiosRequestConfig,
    undefined,
    {
      data: {
        code: '11011',
        message: 'OTP 코드가 올바르지 않습니다.',
      },
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: {
        url: 'http://auth:4001/auth/2fa/verify',
      } as InternalAxiosRequestConfig,
    },
  );
}

describe('CircuitBreakerService', () => {
  it('does not open auth-server breaker for structured auth errors', async () => {
    const service = new CircuitBreakerService();

    for (let i = 0; i < 8; i += 1) {
      await expect(
        service.fire('auth-server', async () => {
          throw createAuthAxiosError();
        }),
      ).rejects.toMatchObject({
        response: {
          data: {
            code: '11011',
          },
        },
      });
    }
  });
});
