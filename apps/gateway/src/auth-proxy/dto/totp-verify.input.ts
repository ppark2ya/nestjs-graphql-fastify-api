import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class TotpVerifyInput {
  @Field({ description: '2FA 임시 토큰' })
  twoFactorToken: string;

  @Field({ description: 'TOTP 6자리 코드' })
  totpCode: string;
}
