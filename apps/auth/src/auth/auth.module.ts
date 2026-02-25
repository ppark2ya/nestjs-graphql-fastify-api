import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { MockAuthService } from './auth-mock.service';
import { AuthController } from './auth.controller';
import { JwtTokenService } from './jwt.service';
import { TotpService } from './totp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AccountModule } from '../account/account.module';

const useMockAuth = process.env.USE_MOCK_AUTH === 'true';

@Module({
  imports: useMockAuth ? [PassportModule] : [PassportModule, AccountModule],
  controllers: [AuthController],
  providers: [
    {
      provide: 'AUTH_SERVICE',
      useClass: useMockAuth ? MockAuthService : AuthService,
    },
    ...(useMockAuth ? [] : [JwtTokenService, TotpService, JwtStrategy]),
  ],
  exports: useMockAuth ? [] : [JwtTokenService],
})
export class AuthModule {}
