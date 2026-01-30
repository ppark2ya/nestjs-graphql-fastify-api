import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class AddNumbersInput {
  @Field(() => Int, { description: '첫 번째 숫자' })
  a: number;

  @Field(() => Int, { description: '두 번째 숫자' })
  b: number;
}
