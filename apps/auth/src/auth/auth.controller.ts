import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UsePipes,
  Inject,
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { MockAuthService } from './auth-mock.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ZodValidationPipe } from './zod-validation.pipe';
import {
  LoginSchema,
  TotpVerifySchema,
  TotpSetupSchema,
  RefreshTokenSchema,
  LogoutSchema,
  type LoginDto,
  type TotpVerifyDto,
  type TotpSetupDto,
  type RefreshTokenDto,
  type LogoutDto,
} from './dto/auth.dto';

type AuthServiceType = AuthService | MockAuthService;

@Controller('auth')
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: AuthServiceType,
  ) {}

  // ========== HTTP Endpoints ==========

  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }

  @Post('2fa/verify')
  @UsePipes(new ZodValidationPipe(TotpVerifySchema))
  async verifyTwoFactor(@Body() body: TotpVerifyDto) {
    return this.authService.verifyTwoFactor(body.twoFactorToken, body.totpCode);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(TotpSetupSchema))
  async setupTwoFactor(@Body() body: TotpSetupDto, @Req() req: any) {
    return this.authService.setupTwoFactor(Number(req.user.userId), body.totpCode);
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(RefreshTokenSchema))
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(LogoutSchema))
  async logout(@Body() body: LogoutDto) {
    await this.authService.logout(body.refreshToken);
    return { success: true };
  }

  // ========== TCP MessagePattern Handlers ==========

  @MessagePattern('auth.login')
  async tcpLogin(@Payload() data: LoginDto) {
    return this.authService.login(data.username, data.password);
  }

  @MessagePattern('auth.2fa.verify')
  async tcpVerifyTwoFactor(@Payload() data: TotpVerifyDto) {
    return this.authService.verifyTwoFactor(data.twoFactorToken, data.totpCode);
  }

  @MessagePattern('auth.2fa.setup')
  async tcpSetupTwoFactor(@Payload() data: { userId: number; totpCode: string }) {
    return this.authService.setupTwoFactor(data.userId, data.totpCode);
  }

  @MessagePattern('auth.refresh')
  async tcpRefresh(@Payload() data: RefreshTokenDto) {
    return this.authService.refreshTokens(data.refreshToken);
  }

  @MessagePattern('auth.logout')
  async tcpLogout(@Payload() data: LogoutDto) {
    await this.authService.logout(data.refreshToken);
    return { success: true };
  }
}

