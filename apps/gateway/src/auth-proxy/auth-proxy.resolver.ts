import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthProxyService } from './auth-proxy.service';
import { LoginInput } from './dto/login.input';
import { TotpVerifyInput } from './dto/totp-verify.input';
import { RefreshTokenInput } from './dto/refresh-token.input';
import { LoginResult } from './models/login-result.model';
import { AuthToken } from './models/auth-token.model';
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
