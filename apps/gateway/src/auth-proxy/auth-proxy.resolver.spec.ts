import { FastifyRequest } from 'fastify';
import { AuthProxyResolver } from './auth-proxy.resolver';
import { AuthProxyService } from './auth-proxy.service';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';

describe('AuthProxyResolver', () => {
  let resolver: AuthProxyResolver;
  let mockService: jest.Mocked<
    Pick<AuthProxyService, 'login' | 'verifyTwoFactor' | 'changePassword'>
  >;

  beforeEach(() => {
    mockService = {
      login: jest.fn(),
      verifyTwoFactor: jest.fn(),
      changePassword: jest.fn(),
    };
    resolver = new AuthProxyResolver(
      mockService as unknown as AuthProxyService,
    );
  });

  it('passes browser UI origin from forwarded headers to login proxy calls', async () => {
    mockService.login.mockResolvedValue({
      requiresTwoFactor: true,
      twoFactorToken: '2fa-token',
    });

    await resolver.login({ loginId: 'admin', password: 'password123' }, {
      req: {
        ip: '10.0.0.2',
        headers: {
          'x-user-type': 'PRIVATE_BO',
          'x-forwarded-for': '203.0.113.10, 10.0.0.2',
          'x-forwarded-host': 'abc.mx-dozn.co.kr',
          'x-forwarded-proto': 'https',
          'x-real-ip': '198.51.100.10',
          'x-access-channel': 'https://legacy-channel.example.com',
        },
      } as unknown as FastifyRequest,
    } as any);

    expect(mockService.login).toHaveBeenCalledWith(
      'admin',
      'password123',
      'PRIVATE_BO',
      {
        'X-Forwarded-For': '203.0.113.10, 10.0.0.2',
        'X-Forwarded-Host': 'abc.mx-dozn.co.kr',
        'X-Forwarded-Proto': 'https',
        'X-Real-IP': '198.51.100.10',
        'X-Access-Channel': 'https://abc.mx-dozn.co.kr',
      },
    );
  });

  it('falls back to x-access-channel and normalizes it to an origin', async () => {
    mockService.login.mockResolvedValue({
      requiresTwoFactor: false,
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      },
    });

    await resolver.login({ loginId: 'admin', password: 'password123' }, {
      req: {
        ip: '10.0.0.2',
        headers: {
          'x-user-type': 'PRIVATE_BO',
          'x-access-channel': 'https://fallback.mx-dozn.co.kr/login?next=/',
        },
      } as unknown as FastifyRequest,
    } as any);

    expect(mockService.login).toHaveBeenCalledWith(
      'admin',
      'password123',
      'PRIVATE_BO',
      {
        'X-Forwarded-For': '10.0.0.2',
        'X-Access-Channel': 'https://fallback.mx-dozn.co.kr',
      },
    );
  });

  it('falls back to request ip when forwarded headers are absent', async () => {
    mockService.verifyTwoFactor.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });

    await resolver.verifyTwoFactor({ totpCode: '123456' }, {
      req: {
        ip: '10.0.0.3',
        headers: {
          'x-2fa-token': '2fa-token',
        },
      } as unknown as FastifyRequest,
    } as any);

    expect(mockService.verifyTwoFactor).toHaveBeenCalledWith(
      '2fa-token',
      '123456',
      {
        'X-Forwarded-For': '10.0.0.3',
      },
    );
  });

  it('passes password change auth headers to proxy calls', async () => {
    mockService.changePassword.mockResolvedValue({ success: true });

    await resolver.changePassword(
      { currentPassword: 'old-password', newPassword: 'new-password' },
      {
        req: {
          headers: {
            authorization: 'Bearer access-token',
            'x-password-change-token': 'password-change-token',
          },
        } as unknown as FastifyRequest,
      } as any,
    );

    expect(mockService.changePassword).toHaveBeenCalledWith(
      'old-password',
      'new-password',
      {
        Authorization: 'Bearer access-token',
        'X-Password-Change-Token': 'password-change-token',
      },
    );
  });

  it('marks password change mutation as public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, resolver.changePassword)).toBe(
      true,
    );
  });
});
