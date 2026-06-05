import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { CircuitBreakerService } from './circuit-breaker.service';

function createStructuredAxiosError(
  url = 'http://auth:4001/auth/2fa/verify',
  code = '11011',
  codeField: 'code' | 'errorCode' = 'code',
): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    { url } as InternalAxiosRequestConfig,
    undefined,
    {
      data: {
        [codeField]: code,
        message: 'OTP 코드가 올바르지 않습니다.',
      },
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: {
        url,
      } as InternalAxiosRequestConfig,
    },
  );
}

function createFetchAdapterWrappedStructuredAxiosError(): AxiosError {
  const cause = createStructuredAxiosError(
    'http://auth:4001/auth/login',
    '11004',
  );
  return AxiosError.from(
    cause,
    cause.code,
    cause.config,
    cause.request,
  ) as AxiosError;
}

describe('CircuitBreakerService', () => {
  it('does not open auth-server breaker for structured auth errors', async () => {
    const service = new CircuitBreakerService();

    for (let i = 0; i < 8; i += 1) {
      await expect(
        service.fire('auth-server', async () => {
          throw createStructuredAxiosError();
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

  it('does not open any downstream breaker for structured downstream errors', async () => {
    const service = new CircuitBreakerService();

    for (let i = 0; i < 8; i += 1) {
      await expect(
        service.fire('log-history', async () => {
          throw createStructuredAxiosError(
            'http://log-streamer:4003/api/logs/search',
            'LS400',
            'errorCode',
          );
        }),
      ).rejects.toMatchObject({
        response: {
          data: {
            errorCode: 'LS400',
          },
        },
      });
    }
  });

  it('does not open the breaker for structured errors nested in fetch adapter causes', async () => {
    const service = new CircuitBreakerService();

    for (let i = 0; i < 8; i += 1) {
      await expect(
        service.fire('auth-server', async () => {
          throw createFetchAdapterWrappedStructuredAxiosError();
        }),
      ).rejects.toMatchObject({
        cause: {
          response: {
            data: {
              code: '11004',
            },
          },
        },
      });
    }
  });
});
