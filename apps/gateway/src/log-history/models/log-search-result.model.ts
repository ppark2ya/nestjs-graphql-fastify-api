import { ObjectType, Field } from '@nestjs/graphql';
import { LogLine } from './log-line.model';
import { LogSummary } from './log-summary.model';

@ObjectType({ description: '로그 검색 결과' })
export class LogSearchResult {
  @Field(() => [LogLine])
  lines: LogLine[];

  @Field(() => Boolean)
  hasMore: boolean;

  @Field(() => LogSummary)
  summary: LogSummary;
}
