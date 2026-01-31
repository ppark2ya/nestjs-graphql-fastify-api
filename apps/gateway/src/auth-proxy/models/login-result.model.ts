import { ObjectType, Field } from '@nestjs/graphql';
import { AuthToken } from './auth-token.model';

@ObjectType()
export class LoginResult {
  @Field({ description: '2FA 인증 필요 여부' })
  requiresTwoFactor: boolean;

  @Field(() => AuthToken, { nullable: true, description: '로그인 성공 시 토큰 (2FA 불필요 시)' })
  tokens?: AuthToken;

  @Field({ nullable: true, description: '2FA 임시 토큰 (2FA 필요 시)' })
  twoFactorToken?: string;
}
