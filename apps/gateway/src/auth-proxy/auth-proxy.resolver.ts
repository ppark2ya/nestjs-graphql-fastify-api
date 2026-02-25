import { Resolver, Mutation, Args, Context } from '@nestjs/graphql';
import { AuthProxyService } from './auth-proxy.service';
import { LoginInput } from './dto/login.input';
import { TotpVerifyInput } from './dto/totp-verify.input';
import { RefreshTokenInput } from './dto/refresh-token.input';
import { ChangePasswordInput } from './dto/change-password.input';
import { LoginResult } from './models/login-result.model';
import { AuthToken } from './models/auth-token.model';
import { Public } from '../auth/public.decorator';

@Resolver()
export class AuthProxyResolver {
  constructor(private readonly authProxyService: AuthProxyService) {}

  @Public()
  @Mutation(() => LoginResult, { description: '로그인' })
  async login(
    @Args('input') input: LoginInput,
    @Context() ctx: any,
  ): Promise<LoginResult> {
    const userType = ctx.req?.headers?.['x-user-type'] ?? '';
    return this.authProxyService.login(input.loginId, input.password, userType);
  }

  @Public()
  @Mutation(() => AuthToken, { description: '2FA TOTP 검증' })
  async verifyTwoFactor(
    @Args('input') input: TotpVerifyInput,
    @Context() ctx: any,
  ): Promise<AuthToken> {
    const twoFactorToken = ctx.req?.headers?.['x-2fa-token'] ?? '';
    return this.authProxyService.verifyTwoFactor(
      twoFactorToken,
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

  @Mutation(() => Boolean, { description: '패스워드 변경' })
  async changePassword(
    @Args('input') input: ChangePasswordInput,
    @Context() ctx: any,
  ): Promise<boolean> {
    const userId = ctx.req?.user?.userId;
    const result = await this.authProxyService.changePassword(
      Number(userId),
      input.currentPassword,
      input.newPassword,
    );
    return result.success;
  }
}
