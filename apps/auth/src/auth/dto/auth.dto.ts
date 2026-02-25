import { z } from 'zod';

export const LoginSchema = z.object({
  loginId: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const TotpVerifySchema = z.object({
  totpCode: z.string().length(6).regex(/^\d+$/),
});
export type TotpVerifyDto = z.infer<typeof TotpVerifySchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(255),
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
