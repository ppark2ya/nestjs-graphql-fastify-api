import { InputType, Field } from '@nestjs/graphql';

@InputType({ description: '패스워드 변경 입력' })
export class ChangePasswordInput {
  @Field({ description: '현재 비밀번호' })
  currentPassword: string;

  @Field({
    description:
      '새 비밀번호: 8자 이상 영문/숫자/특수문자를 모두 포함하거나, 10자 이상 영문/숫자/특수문자 중 2종 이상을 포함',
  })
  newPassword: string;
}
