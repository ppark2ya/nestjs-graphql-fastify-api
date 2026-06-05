import { FastifyRequest } from 'fastify';
import { AuthProxyResolver } from './auth-proxy.resolver';
import { AuthProxyService } from './auth-proxy.service';

describe('AuthProxyResolver', () => {
  let resolver: AuthProxyResolver;
  let mockService: jest.Mocked<
    Pick<AuthProxyService, 'login' | 'verifyTwoFactor'>
  >;

  beforeEach(() => {
    mockService = {
      login: jest.fn(),
      verifyTwoFactor: jest.fn(),
    };
    resolver = new AuthProxyResolver(
      mockService as unknown as AuthProxyService,
    );
  });

  it('passes auth metadata headers to login proxy calls', async () => {
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
          'x-real-ip': '198.51.100.10',
          'x-access-channel': 'http://admin-bo.test',
        },
      } as unknown as FastifyRequest,
    } as any);

    expect(mockService.login).toHaveBeenCalledWith(
      'admin',
      'password123',
      'PRIVATE_BO',
      {
        'X-Forwarded-For': '203.0.113.10, 10.0.0.2',
        'X-Real-IP': '198.51.100.10',
        'X-Access-Channel': 'http://admin-bo.test',
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
});
