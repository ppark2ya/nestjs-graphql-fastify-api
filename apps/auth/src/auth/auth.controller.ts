import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UsePipes,
} from '@nestjs/common';
import { AuthService } from './auth.service';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }

  @Post('2fa/verify')
  @UsePipes(new ZodValidationPipe(TotpVerifySchema))
  async verifyTwoFactor(@Body() body: TotpVerifyDto) {
    return this.authService.verifyTwoFactor(
      body.twoFactorToken,
      body.totpCode,
    );
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(TotpSetupSchema))
  async setupTwoFactor(@Body() body: TotpSetupDto, @Req() req: any) {
    return this.authService.setupTwoFactor(
      Number(req.user.userId),
      body.totpCode,
    );
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
}
