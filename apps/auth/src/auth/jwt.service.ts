import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { importPKCS8, importSPKI, SignJWT, jwtVerify } from 'jose';
import type { CryptoKey, KeyObject } from 'jose';
import { randomUUID } from 'crypto';
import { AUTH_CONSTANTS } from '@monorepo/shared';
import type { JwtPayload } from '@monorepo/shared';

@Injectable()
export class JwtTokenService implements OnModuleInit {
  private privateKey: CryptoKey | KeyObject;
  private publicKey: CryptoKey | KeyObject;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const privateKeyPath = this.config.get<string>(
      'JWT_PRIVATE_KEY_PATH',
      'keys/private.pem',
    );
    const publicKeyPath = this.config.get<string>(
      'JWT_PUBLIC_KEY_PATH',
      'keys/public.pem',
    );

    const [privatePem, publicPem] = await Promise.all([
      readFile(privateKeyPath, 'utf8'),
      readFile(publicKeyPath, 'utf8'),
    ]);

    this.privateKey = await importPKCS8(privatePem, AUTH_CONSTANTS.JWT_ALGORITHM);
    this.publicKey = await importSPKI(publicPem, AUTH_CONSTANTS.JWT_ALGORITHM);
  }

  async signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const token = await new SignJWT({ ...payload, jti })
      .setProtectedHeader({ alg: AUTH_CONSTANTS.JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY)
      .setIssuer(AUTH_CONSTANTS.JWT_ISSUER)
      .setSubject(payload.sub)
      .sign(this.privateKey);

    return { token, jti };
  }

  async signRefreshToken(sub: string): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const token = await new SignJWT({ sub, jti })
      .setProtectedHeader({ alg: AUTH_CONSTANTS.JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY)
      .setIssuer(AUTH_CONSTANTS.JWT_ISSUER)
      .setSubject(sub)
      .sign(this.privateKey);

    return { token, jti };
  }

  async signTwoFactorToken(sub: string): Promise<string> {
    return new SignJWT({ sub, type: '2fa' })
      .setProtectedHeader({ alg: AUTH_CONSTANTS.JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONSTANTS.TWO_FACTOR_TOKEN_EXPIRY)
      .setIssuer(AUTH_CONSTANTS.JWT_ISSUER)
      .setSubject(sub)
      .sign(this.privateKey);
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      issuer: AUTH_CONSTANTS.JWT_ISSUER,
      algorithms: [AUTH_CONSTANTS.JWT_ALGORITHM],
    });
    return payload as unknown as JwtPayload;
  }

  async verifyTwoFactorToken(token: string): Promise<{ sub: string }> {
    const { payload } = await jwtVerify(token, this.publicKey, {
      issuer: AUTH_CONSTANTS.JWT_ISSUER,
      algorithms: [AUTH_CONSTANTS.JWT_ALGORITHM],
    });
    if ((payload as any).type !== '2fa') {
      throw new Error('Invalid 2FA token type');
    }
    return { sub: payload.sub as string };
  }
}
