import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtTokenService } from './jwt.service';
import { TotpService } from './totp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AccountModule } from '../account/account.module';
import { LoginHistoryModule } from '../login-history/login-history.module';

@Module({
  imports: [PassportModule, AccountModule, LoginHistoryModule],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService, TotpService, JwtStrategy],
  exports: [JwtTokenService],
})
export class AuthModule {}
