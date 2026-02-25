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
import { MessagePattern, Payload } from '@nestjs/microservices';
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
  async changePassword(@Body() body: ChangePasswordDto, @Req() req: any) {
    return this.authService.changePassword(
      Number(req.user.userId),
      body.currentPassword,
      body.newPassword,
    );
  }

  @MessagePattern('auth.login')
  async tcpLogin(@Payload() data: LoginDto & { userType: string }) {
    return this.authService.login(data.loginId, data.password, data.userType);
  }

  @MessagePattern('auth.2fa.verify')
  async tcpVerifyTwoFactor(
    @Payload() data: { twoFactorToken: string; totpCode: string },
  ) {
    return this.authService.verifyTwoFactor(data.twoFactorToken, data.totpCode);
  }

  @MessagePattern('auth.refresh')
  async tcpRefresh(@Payload() data: RefreshTokenDto) {
    return this.authService.refreshTokens(data.refreshToken);
  }

  @MessagePattern('auth.password')
  async tcpChangePassword(
    @Payload()
    data: {
      userId: number;
      currentPassword: string;
      newPassword: string;
    },
  ) {
    return this.authService.changePassword(
      data.userId,
      data.currentPassword,
      data.newPassword,
    );
  }
}
