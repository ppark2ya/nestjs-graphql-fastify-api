import type { AuthTokens } from './auth-tokens.interface';

export interface AuthResponse {
  requiresTwoFactor: boolean;
  tokens?: AuthTokens;
  twoFactorToken?: string;
}
