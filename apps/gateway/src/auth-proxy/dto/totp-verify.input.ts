import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class TotpVerifyInput {
  @Field({ description: 'TOTP 6자리 코드' })
  totpCode: string;
}
