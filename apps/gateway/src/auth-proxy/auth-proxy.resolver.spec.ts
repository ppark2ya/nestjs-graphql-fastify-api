import { AuthProxyResolver } from './auth-proxy.resolver';
import { AuthProxyService } from './auth-proxy.service';
import { GraphQLContext } from '../types/graphql-context.interface';

describe('AuthProxyResolver', () => {
  let service: jest.Mocked<Pick<AuthProxyService, 'verifyTwoFactor'>>;
  let resolver: AuthProxyResolver;

  beforeEach(() => {
    service = {
      verifyTwoFactor: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      }),
    };
    resolver = new AuthProxyResolver(service as AuthProxyService);
  });

  it('uses twoFactorToken from mutation input when provided', async () => {
    await resolver.verifyTwoFactor(
      { totpCode: '123456', twoFactorToken: ' input-token ' },
      contextWithHeaders({ 'x-2fa-token': 'header-token' }),
    );

    expect(service.verifyTwoFactor).toHaveBeenCalledWith(
      'input-token',
      '123456',
    );
  });

  it('falls back to x-2fa-token header for existing clients', async () => {
    await resolver.verifyTwoFactor(
      { totpCode: '123456' },
      contextWithHeaders({ 'x-2fa-token': 'header-token' }),
    );

    expect(service.verifyTwoFactor).toHaveBeenCalledWith(
      'header-token',
      '123456',
    );
  });
});

function contextWithHeaders(headers: Record<string, string>): GraphQLContext {
  return {
    req: { headers },
    loaders: {},
  } as unknown as GraphQLContext;
}
