import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class AuthToken {
  @Field({ description: 'JWT 액세스 토큰' })
  accessToken: string;

  @Field({ description: '리프레시 토큰' })
  refreshToken: string;

  @Field(() => Int, { description: '액세스 토큰 만료 시간 (초)' })
  expiresIn: number;
}
