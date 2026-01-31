import { Resolver, Mutation, Args, Context } from '@nestjs/graphql';
import { AuthProxyService } from './auth-proxy.service';
import { LoginInput } from './dto/login.input';
import { TotpVerifyInput } from './dto/totp-verify.input';
import { TotpSetupInput } from './dto/totp-setup.input';
import { RefreshTokenInput } from './dto/refresh-token.input';
import { LoginResult } from './models/login-result.model';
import { AuthToken } from './models/auth-token.model';
import { TotpSetupResult } from './models/totp-setup-result.model';
import { Public } from '../auth/public.decorator';

@Resolver()
export class AuthProxyResolver {
  constructor(private readonly authProxyService: AuthProxyService) {}

  @Public()
  @Mutation(() => LoginResult, { description: '로그인' })
  async login(@Args('input') input: LoginInput): Promise<LoginResult> {
    return this.authProxyService.login(input.username, input.password);
  }

  @Public()
  @Mutation(() => AuthToken, { description: '2FA TOTP 검증' })
  async verifyTwoFactor(
    @Args('input') input: TotpVerifyInput,
  ): Promise<AuthToken> {
    return this.authProxyService.verifyTwoFactor(
      input.twoFactorToken,
      input.totpCode,
    );
  }

  @Mutation(() => TotpSetupResult, { description: '2FA 설정 (JWT 인증 필요)' })
  async setupTwoFactor(
    @Args('input') input: TotpSetupInput,
    @Context() ctx: any,
  ): Promise<TotpSetupResult> {
    // TODO: JWT에서 userId 추출 (현재는 하드코딩)
    const userId = ctx.req?.user?.userId ?? 1;
    return this.authProxyService.setupTwoFactor(userId, input.totpCode ?? '');
  }

  @Public()
  @Mutation(() => AuthToken, { description: '토큰 갱신' })
  async refreshToken(
    @Args('input') input: RefreshTokenInput,
  ): Promise<AuthToken> {
    return this.authProxyService.refreshToken(input.refreshToken);
  }

  @Mutation(() => Boolean, { description: '로그아웃' })
  async logout(
    @Args('refreshToken') refreshToken: string,
  ): Promise<boolean> {
    return this.authProxyService.logout(refreshToken);
  }
}

