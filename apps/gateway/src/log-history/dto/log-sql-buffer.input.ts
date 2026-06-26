import { InputType, Field, Int } from '@nestjs/graphql';

@InputType({ description: 'SQL 로그 buffer 조회 입력' })
export class LogSqlBufferInput {
  @Field(() => String, { description: '앱 이름' })
  app: string;

  @Field(() => String, { description: '시작 날짜 (YYYY-MM-DD)' })
  from: string;

  @Field(() => String, { description: '종료 날짜 (YYYY-MM-DD)' })
  to: string;

  @Field(() => String, { nullable: true, description: '키워드 검색' })
  keyword?: string;

  @Field(() => String, { nullable: true, description: '노드 필터' })
  node?: string;

  @Field(() => Int, {
    nullable: true,
    defaultValue: 500,
    description: '결과 수 제한',
  })
  limit?: number;
}
