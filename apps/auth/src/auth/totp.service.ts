import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

@Injectable()
export class TotpService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  generateKeyUri(username: string, secret: string): string {
    return authenticator.keyuri(username, 'AuthServer', secret);
  }

  verify(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }
}
