import { InputType, Field, Int } from '@nestjs/graphql';
import { Min, Max, IsInt } from 'class-validator';

@InputType()
export class AddNumbersInput {
  @Field(() => Int, { description: '첫 번째 숫자' })
  @IsInt()
  @Min(1)
  @Max(100)
  a: number;

  @Field(() => Int, { description: '두 번째 숫자' })
  @IsInt()
  @Min(1)
  @Max(100)
  b: number;
}
