import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  AxiosExceptionFilter,
  HttpExceptionFilter,
} from './http-exception.filter';

function createAxiosError(
  data: unknown,
  status = 401,
  url = 'http://auth:4001/auth/2fa/verify',
): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    { url } as InternalAxiosRequestConfig,
    undefined,
    {
      data,
      status,
      statusText: 'Unauthorized',
      headers: {},
      config: {
        url,
      } as InternalAxiosRequestConfig,
    },
  );
}

function createFetchAdapterWrappedAxiosError(
  data: unknown,
  status = 400,
  url = 'http://auth:4001/auth/login',
): AxiosError {
  const cause = createAxiosError(JSON.stringify(data), status, url);
  return AxiosError.from(
    cause,
    cause.code,
    cause.config,
    cause.request,
  ) as AxiosError;
}

describe('AxiosExceptionFilter', () => {
  const filter = new AxiosExceptionFilter();

  it.each([
    [
      400,
      'BAD_REQUEST',
      '11004',
      '마지막 패스워드 변경 후 90일이 지났습니다. 패스워드를 변경해주세요.',
    ],
    [
      403,
      'FORBIDDEN',
      '11005',
      '5회 이상 로그인이 실패하여 계정이 잠겼습니다. 관리자에게 문의하세요.',
    ],
    [
      401,
      'UNAUTHENTICATED',
      '11010',
      '아이디와 패스워드를 확인해주세요.',
    ],
  ])(
    'propagates auth error %s/%s as a standard downstream error',
    (status, gqlCode, errorCode, message) => {
      const error = filter.catch(
        createAxiosError(
          {
            code: errorCode,
            message,
            timestamp: '2026-05-20 17:00:00',
          },
          status,
          'http://auth:4001/auth/login',
        ),
      );

      expect(error.message).toBe(message);
      expect(error.extensions).toMatchObject({
        code: gqlCode,
        statusCode: status,
        errorCode,
        downstreamService: 'auth',
        timestamp: '2026-05-20 17:00:00',
      });
      expect(error.extensions).not.toHaveProperty('authErrorCode');
    },
  );

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
      errorCode: '11011',
      downstreamService: 'auth',
      timestamp: '2026-05-18 10:00:00',
    });
    expect(error.extensions).not.toHaveProperty('authErrorCode');
  });

  it('propagates password change token from auth errors', () => {
    const error = filter.catch(
      createAxiosError(
        {
          code: '11004',
          message: '비밀번호 변경 후 90일이 경과되었습니다.',
          passwordChangeToken: 'password-change-token',
        },
        400,
      ),
    );

    expect(error.message).toBe('비밀번호 변경 후 90일이 경과되었습니다.');
    expect(error.extensions).toMatchObject({
      code: 'BAD_REQUEST',
      statusCode: 400,
      errorCode: '11004',
      downstreamService: 'auth',
      passwordChangeToken: 'password-change-token',
    });
    expect(error.extensions).not.toHaveProperty('authErrorCode');
  });

  it('propagates structured auth error JSON string data', () => {
    const error = filter.catch(
      createAxiosError(
        JSON.stringify({
          errorCode: '11013',
          message: '계정 인증 정보가 올바르지 않습니다. 관리자에게 문의하세요.',
          timestamp: '2026-05-18 10:00:00',
        }),
        500,
      ),
    );

    expect(error.message).toBe(
      '계정 인증 정보가 올바르지 않습니다. 관리자에게 문의하세요.',
    );
    expect(error.extensions).toMatchObject({
      statusCode: 500,
      errorCode: '11013',
      downstreamService: 'auth',
      timestamp: '2026-05-18 10:00:00',
    });
    expect(error.extensions).not.toHaveProperty('authErrorCode');
  });

  it('propagates non-auth downstream errors with the same contract', () => {
    const error = filter.catch(
      createAxiosError(
        {
          code: 'LS400',
          message: '로그 검색 조건이 올바르지 않습니다.',
          timestamp: '2026-05-20 17:10:00',
        },
        400,
        'http://log-streamer:4003/api/logs/search',
      ),
    );

    expect(error.message).toBe('로그 검색 조건이 올바르지 않습니다.');
    expect(error.extensions).toMatchObject({
      code: 'BAD_REQUEST',
      statusCode: 400,
      errorCode: 'LS400',
      downstreamService: 'log-streamer',
      timestamp: '2026-05-20 17:10:00',
    });
    expect(error.extensions).not.toHaveProperty('authErrorCode');
  });

  it('unwraps fetch adapter AxiosError cause response data', () => {
    const error = filter.catch(
      createFetchAdapterWrappedAxiosError({
        code: '11004',
        message:
          '마지막 패스워드 변경 후 90일이 지났습니다. 패스워드를 변경해주세요.',
        timestamp: '2026-05-20 17:00:00',
      }),
    );

    expect(error.message).toBe(
      '마지막 패스워드 변경 후 90일이 지났습니다. 패스워드를 변경해주세요.',
    );
    expect(error.extensions).toMatchObject({
      code: 'BAD_REQUEST',
      statusCode: 400,
      errorCode: '11004',
      downstreamService: 'auth',
      timestamp: '2026-05-20 17:00:00',
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

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('handles AxiosError-like exceptions when they reach the HTTP filter', () => {
    const error = filter.catch(
      createFetchAdapterWrappedAxiosError(
        {
          code: '11005',
          message:
            '5회 이상 로그인이 실패하여 계정이 잠겼습니다. 관리자에게 문의하세요.',
          timestamp: '2026-05-20 17:00:00',
        },
        403,
      ),
    );

    expect(error.message).toBe(
      '5회 이상 로그인이 실패하여 계정이 잠겼습니다. 관리자에게 문의하세요.',
    );
    expect(error.extensions).toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
      errorCode: '11005',
      downstreamService: 'auth',
      timestamp: '2026-05-20 17:00:00',
    });
    expect(error.extensions).not.toHaveProperty('authErrorCode');
  });
});
