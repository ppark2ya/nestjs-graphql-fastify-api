import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class LoginInput {
  @Field({ description: '로그인 ID' })
  loginId: string;

  @Field({ description: '비밀번호' })
  password: string;
}
