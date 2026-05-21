import { z } from 'zod';

const PASSWORD_POLICY_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$|^(?:(?=.*[A-Za-z])(?=.*\d)|(?=.*\d)(?=.*[\W_])|(?=.*[\W_])(?=.*[A-Za-z]))[A-Za-z\d\W_]{10,}$/;

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
  newPassword: z
    .string()
    .min(8)
    .max(255)
    .regex(PASSWORD_POLICY_REGEX, '올바른 패스워드 형식이 아닙니다.'),
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
