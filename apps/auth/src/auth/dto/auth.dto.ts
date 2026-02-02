import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const TotpVerifySchema = z.object({
  twoFactorToken: z.string().min(1),
  totpCode: z.string().length(6),
});
export type TotpVerifyDto = z.infer<typeof TotpVerifySchema>;

export const TotpSetupSchema = z.object({
  totpCode: z.string().length(6),
});
export type TotpSetupDto = z.infer<typeof TotpSetupSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutDto = z.infer<typeof LogoutSchema>;
