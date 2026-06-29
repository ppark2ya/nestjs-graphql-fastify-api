import { Resolver, Mutation, Args, Context } from '@nestjs/graphql';
import { FastifyRequest } from 'fastify';
import { AuthProxyService } from './auth-proxy.service';
import { LoginInput } from './dto/login.input';
import { TotpVerifyInput } from './dto/totp-verify.input';
import { RefreshTokenInput } from './dto/refresh-token.input';
import { ChangePasswordInput } from './dto/change-password.input';
import { LoginResult } from './models/login-result.model';
import { AuthToken } from './models/auth-token.model';
import { Public } from '../auth/public.decorator';
import { GraphQLContext } from '../types/graphql-context.interface';
import { resolveAccessChannelOrigin } from '@monorepo/shared/common/http/access-channel';

@Resolver()
export class AuthProxyResolver {
  constructor(private readonly authProxyService: AuthProxyService) {}

  @Public()
  @Mutation(() => LoginResult, { description: '로그인' })
  async login(
    @Args('input') input: LoginInput,
    @Context() ctx: GraphQLContext,
  ): Promise<LoginResult> {
    const userType = this.headerValue(ctx.req, 'x-user-type') ?? '';
    return this.authProxyService.login(
      input.loginId,
      input.password,
      userType,
      this.authMetaHeaders(ctx.req),
    );
  }

  @Public()
  @Mutation(() => AuthToken, { description: '2FA TOTP 검증' })
  async verifyTwoFactor(
    @Args('input') input: TotpVerifyInput,
    @Context() ctx: GraphQLContext,
  ): Promise<AuthToken> {
    const twoFactorToken = this.headerValue(ctx.req, 'x-2fa-token') ?? '';
    return this.authProxyService.verifyTwoFactor(
      twoFactorToken,
      input.totpCode,
      this.authMetaHeaders(ctx.req),
    );
  }

  @Public()
  @Mutation(() => AuthToken, { description: '토큰 갱신' })
  async refreshToken(
    @Args('input') input: RefreshTokenInput,
  ): Promise<AuthToken> {
    return this.authProxyService.refreshToken(input.refreshToken);
  }

  @Public()
  @Mutation(() => Boolean, { description: '패스워드 변경' })
  async changePassword(
    @Args('input') input: ChangePasswordInput,
    @Context() ctx: GraphQLContext,
  ): Promise<boolean> {
    const result = await this.authProxyService.changePassword(
      input.currentPassword,
      input.newPassword,
      this.authPasswordHeaders(ctx.req),
    );
    return result.success;
  }

  private authMetaHeaders(req: FastifyRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    const forwardedFor = this.headerValue(req, 'x-forwarded-for');
    const forwardedHost = this.headerValue(req, 'x-forwarded-host');
    const forwardedProto = this.headerValue(req, 'x-forwarded-proto');
    const realIp = this.headerValue(req, 'x-real-ip');
    const accessChannel = resolveAccessChannelOrigin(req.headers);

    if (forwardedFor) {
      headers['X-Forwarded-For'] = forwardedFor;
    } else if (req.ip) {
      headers['X-Forwarded-For'] = req.ip;
    }
    if (forwardedHost) {
      headers['X-Forwarded-Host'] = forwardedHost;
    }
    if (forwardedProto) {
      headers['X-Forwarded-Proto'] = forwardedProto;
    }
    if (realIp) {
      headers['X-Real-IP'] = realIp;
    }
    if (accessChannel) {
      headers['X-Access-Channel'] = accessChannel;
    }

    return headers;
  }

  private authPasswordHeaders(req: FastifyRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    const authorization = this.headerValue(req, 'authorization');
    const passwordChangeToken = this.headerValue(
      req,
      'x-password-change-token',
    );

    if (authorization) {
      headers.Authorization = authorization;
    }
    if (passwordChangeToken) {
      headers['X-Password-Change-Token'] = passwordChangeToken;
    }

    return headers;
  }

  private headerValue(req: FastifyRequest, name: string): string | undefined {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
