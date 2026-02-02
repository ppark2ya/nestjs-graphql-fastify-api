import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class TotpSetupResult {
  @Field({ nullable: true, description: 'TOTP Secret (QR코드 생성용)' })
  secret?: string;

  @Field({ nullable: true, description: 'TOTP Key URI (QR코드 생성용)' })
  keyUri?: string;

  @Field({ nullable: true, description: '2FA 활성화 완료 여부' })
  enabled?: boolean;
}
