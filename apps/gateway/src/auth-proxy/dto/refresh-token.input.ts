import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class RefreshTokenInput {
  @Field({ description: '리프레시 토큰' })
  refreshToken: string;
}
