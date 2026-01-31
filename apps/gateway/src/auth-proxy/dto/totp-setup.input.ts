import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class TotpSetupInput {
  @Field({ description: 'TOTP 코드 (6자리)', nullable: true })
  totpCode?: string;
}
