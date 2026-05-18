import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { AxiosExceptionFilter } from './http-exception.filter';

function createAxiosError(data: unknown, status = 401): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    { url: 'http://auth:4001/auth/2fa/verify' } as InternalAxiosRequestConfig,
    undefined,
    {
      data,
      status,
      statusText: 'Unauthorized',
      headers: {},
      config: {
        url: 'http://auth:4001/auth/2fa/verify',
      } as InternalAxiosRequestConfig,
    },
  );
}

describe('AxiosExceptionFilter', () => {
  const filter = new AxiosExceptionFilter();

  it('propagates structured auth error object to GraphQL extensions', () => {
    const error = filter.catch(
      createAxiosError({
        code: '11011',
        message: 'OTP 코드가 올바르지 않습니다.',
        timestamp: '2026-05-18 10:00:00',
      }),
    );

    expect(error.message).toBe('OTP 코드가 올바르지 않습니다.');
    expect(error.extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
      statusCode: 401,
      authErrorCode: '11011',
      errorCode: '11011',
      downstreamService: 'auth',
    });
  });

  it('propagates structured auth error JSON string data', () => {
    const error = filter.catch(
      createAxiosError(
        JSON.stringify({
          code: '11013',
          message: '계정 인증 정보가 올바르지 않습니다. 관리자에게 문의하세요.',
        }),
        500,
      ),
    );

    expect(error.message).toBe(
      '계정 인증 정보가 올바르지 않습니다. 관리자에게 문의하세요.',
    );
    expect(error.extensions).toMatchObject({
      statusCode: 500,
      authErrorCode: '11013',
      downstreamService: 'auth',
    });
  });

  it('uses an auth-specific message when auth server is unreachable', () => {
    const error = filter.catch(
      new AxiosError('Network Error', 'ERR_NETWORK', {
        url: 'http://auth:4001/auth/login',
      } as InternalAxiosRequestConfig),
    );

    expect(error.message).toBe('인증 서버에 연결할 수 없습니다.');
    expect(error.extensions).toMatchObject({
      code: 'BAD_GATEWAY',
      statusCode: 502,
      downstreamService: 'auth',
    });
  });
});
