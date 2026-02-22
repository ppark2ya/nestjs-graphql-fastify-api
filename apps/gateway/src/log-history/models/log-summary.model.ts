import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType({ description: '로그 요약 통계' })
export class LogSummary {
  @Field(() => Int)
  totalLines: number;

  @Field(() => Int)
  errorCount: number;

  @Field(() => Int)
  warnCount: number;

  @Field(() => Int)
  infoCount: number;

  @Field(() => Int)
  fileCount: number;
}
