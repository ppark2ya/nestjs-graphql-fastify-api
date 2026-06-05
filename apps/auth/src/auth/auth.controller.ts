import {
  Controller,
  Post,
  Body,
  Req,
  UsePipes,
  Inject,
  UseFilters,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { MockAuthService } from './auth-mock.service';
import { ZodValidationPipe } from './zod-validation.pipe';
import { AuthErrorFilter } from './filters/auth-error.filter';
import {
  LoginSchema,
  TotpVerifySchema,
  RefreshTokenSchema,
  ChangePasswordSchema,
  type LoginDto,
  type TotpVerifyDto,
  type RefreshTokenDto,
  type ChangePasswordDto,
} from './dto/auth.dto';
import type { LoginRequestMeta } from '../login-history/login-history.service';

type AuthServiceType = AuthService | MockAuthService;

@Controller('auth')
@UseFilters(AuthErrorFilter)
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: AuthServiceType,
  ) {}

  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() body: LoginDto, @Req() req: FastifyRequest) {
    const userType = this.headerValue(req, 'x-user-type') ?? '';
    return this.authService.login(
      body.loginId,
      body.password,
      userType,
      this.loginRequestMeta(req),
    );
  }

  @Post('2fa/verify')
  @UsePipes(new ZodValidationPipe(TotpVerifySchema))
  async verifyTwoFactor(
    @Body() body: TotpVerifyDto,
    @Req() req: FastifyRequest,
  ) {
    const twoFactorToken = this.headerValue(req, 'x-2fa-token') ?? '';
    return this.authService.verifyTwoFactor(
      twoFactorToken,
      body.totpCode,
      this.loginRequestMeta(req),
    );
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(RefreshTokenSchema))
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('password')
  @UsePipes(new ZodValidationPipe(ChangePasswordSchema))
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: FastifyRequest,
  ) {
    return this.authService.changePassword(
      {
        accessToken: this.bearerToken(req),
        passwordChangeToken: this.headerValue(req, 'x-password-change-token'),
      },
      body.currentPassword,
      body.newPassword,
    );
  }

  private loginRequestMeta(req: FastifyRequest): LoginRequestMeta {
    return {
      clientIp: this.clientIp(req),
      accessChannel: this.headerValue(req, 'x-access-channel') ?? null,
    };
  }

  private clientIp(req: FastifyRequest): string {
    const forwardedFor = this.headerValue(req, 'x-forwarded-for')
      ?.split(',')[0]
      ?.trim();
    const realIp = this.headerValue(req, 'x-real-ip')?.trim();
    return forwardedFor || realIp || req.ip || 'unknown';
  }

  private headerValue(req: FastifyRequest, name: string): string | undefined {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private bearerToken(req: FastifyRequest): string | undefined {
    const authorization = this.headerValue(req, 'authorization')?.trim();
    const [scheme, token] = authorization?.split(/\s+/, 2) ?? [];
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }
}
