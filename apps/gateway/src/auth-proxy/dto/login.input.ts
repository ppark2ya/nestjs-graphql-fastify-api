import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class LoginInput {
  @Field({ description: '사용자명' })
  username: string;

  @Field({ description: '비밀번호' })
  password: string;
}
