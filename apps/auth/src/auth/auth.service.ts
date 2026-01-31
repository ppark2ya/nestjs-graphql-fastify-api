import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { TokenService } from '../token/token.service';
import { JwtTokenService } from './jwt.service';
import { TotpService } from './totp.service';
import { AUTH_CONSTANTS } from '@monorepo/shared';
import type { AuthResponse, AuthTokens } from '@monorepo/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly totpService: TotpService,
  ) {}

  async login(username: string, password: string): Promise<AuthResponse> {
    const user = await this.userService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.twoFactorEnabled) {
      const twoFactorToken = await this.jwtTokenService.signTwoFactorToken(
        String(user.id),
      );
      return {
        requiresTwoFactor: true,
        twoFactorToken,
      };
    }

    const tokens = await this.issueTokens(user.id, user.username, user.roles.split(','));
    return {
      requiresTwoFactor: false,
      tokens,
    };
  }

  async verifyTwoFactor(
    twoFactorToken: string,
    totpCode: string,
  ): Promise<AuthTokens> {
    const { sub } = await this.jwtTokenService
      .verifyTwoFactorToken(twoFactorToken)
      .catch(() => {
        throw new UnauthorizedException('Invalid or expired 2FA token');
      });

    const user = await this.userService.findById(Number(sub));
    if (!user || !user.twoFactorSecret) {
      throw new UnauthorizedException('Invalid 2FA token');
    }

    const isValid = this.totpService.verify(totpCode, user.twoFactorSecret);
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    return this.issueTokens(user.id, user.username, user.roles.split(','));
  }

  async setupTwoFactor(userId: number, totpCode: string) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    if (!user.twoFactorSecret) {
      const secret = this.totpService.generateSecret();
      await this.userService.updateTwoFactorSecret(userId, secret);
      const keyUri = this.totpService.generateKeyUri(user.username, secret);
      return { secret, keyUri };
    }

    const isValid = this.totpService.verify(totpCode, user.twoFactorSecret);
    if (!isValid) {
      throw new BadRequestException('Invalid TOTP code');
    }

    await this.userService.enableTwoFactor(userId);
    return { enabled: true };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.jwtTokenService
      .verifyToken(refreshToken)
      .catch(() => {
        throw new UnauthorizedException('Invalid or expired refresh token');
      });

    const storedToken = await this.tokenService.findValidRefreshToken(
      payload.jti,
    );
    if (!storedToken) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    await this.tokenService.revokeRefreshToken(payload.jti);

    const user = await this.userService.findById(Number(payload.sub));
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(user.id, user.username, user.roles.split(','));
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.jwtTokenService
      .verifyToken(refreshToken)
      .catch(() => {
        throw new UnauthorizedException('Invalid refresh token');
      });

    await this.tokenService.revokeRefreshToken(payload.jti);
  }

  private async issueTokens(
    userId: number,
    username: string,
    roles: string[],
  ): Promise<AuthTokens> {
    const [accessResult, refreshResult] = await Promise.all([
      this.jwtTokenService.signAccessToken({
        sub: String(userId),
        username,
        roles,
      }),
      this.jwtTokenService.signRefreshToken(String(userId)),
    ]);

    const expiresAt = new Date(
      Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY_SECONDS * 1000,
    );
    await this.tokenService.saveRefreshToken(
      userId,
      refreshResult.token,
      refreshResult.jti,
      expiresAt,
    );

    return {
      accessToken: accessResult.token,
      refreshToken: refreshResult.token,
      expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY_SECONDS,
    };
  }
}
