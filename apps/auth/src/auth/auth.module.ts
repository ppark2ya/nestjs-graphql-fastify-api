import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtTokenService } from './jwt.service';
import { TotpService } from './totp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserModule } from '../user/user.module';
import { TokenModule } from '../token/token.module';

@Module({
  imports: [PassportModule, UserModule, TokenModule],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService, TotpService, JwtStrategy],
  exports: [JwtTokenService],
})
export class AuthModule {}
