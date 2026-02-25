import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class ChangePasswordInput {
  @Field({ description: '현재 비밀번호' })
  currentPassword: string;

  @Field({ description: '새 비밀번호' })
  newPassword: string;
}
