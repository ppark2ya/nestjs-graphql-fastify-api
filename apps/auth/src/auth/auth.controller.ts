import {
  Controller,
  Post,
  Body,
  Headers,
  UseGuards,
  Req,
  UsePipes,
  Inject,
  UseFilters,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { MockAuthService } from './auth-mock.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
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

type AuthServiceType = AuthService | MockAuthService;

@Controller('auth')
@UseFilters(AuthErrorFilter)
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: AuthServiceType,
  ) {}

  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(
    @Body() body: LoginDto,
    @Headers('x-user-type') userType: string,
  ) {
    return this.authService.login(body.loginId, body.password, userType);
  }

  @Post('2fa/verify')
  @UsePipes(new ZodValidationPipe(TotpVerifySchema))
  async verifyTwoFactor(
    @Body() body: TotpVerifyDto,
    @Headers('x-2fa-token') twoFactorToken: string,
  ) {
    return this.authService.verifyTwoFactor(twoFactorToken, body.totpCode);
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(RefreshTokenSchema))
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('password')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(ChangePasswordSchema))
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: FastifyRequest & { user: { userId: number } },
  ) {
    return this.authService.changePassword(
      Number(req.user.userId),
      body.currentPassword,
      body.newPassword,
    );
  }
}
