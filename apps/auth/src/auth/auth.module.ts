import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { MockAuthService } from './auth-mock.service';
import { AuthController } from './auth.controller';
import { JwtTokenService } from './jwt.service';
import { TotpService } from './totp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserModule } from '../user/user.module';
import { TokenModule } from '../token/token.module';

const useMockAuth = process.env.USE_MOCK_AUTH === 'true';

@Module({
  imports: useMockAuth ? [PassportModule] : [PassportModule, UserModule, TokenModule],
  controllers: [AuthController],
  providers: [
    {
      provide: 'AUTH_SERVICE',
      useClass: useMockAuth ? MockAuthService : AuthService,
    },
    // Mock 모드가 아닐 때만 실제 서비스 의존성 주입
    ...(useMockAuth ? [] : [JwtTokenService, TotpService, JwtStrategy]),
  ],
  exports: useMockAuth ? [] : [JwtTokenService],
})
export class AuthModule {}

