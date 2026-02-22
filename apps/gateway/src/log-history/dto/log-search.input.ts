import { InputType, Field, Int } from '@nestjs/graphql';

@InputType({ description: '로그 검색 입력' })
export class LogSearchInput {
  @Field(() => String, { description: '앱 이름' })
  app: string;

  @Field(() => String, { description: '시작 날짜 (YYYY-MM-DD)' })
  from: string;

  @Field(() => String, { description: '종료 날짜 (YYYY-MM-DD)' })
  to: string;

  @Field(() => String, { nullable: true, description: '로그 레벨 필터' })
  level?: string;

  @Field(() => String, { nullable: true, description: '키워드 검색' })
  keyword?: string;

  @Field(() => String, { nullable: true, description: '노드 필터' })
  node?: string;

  @Field(() => String, { nullable: true, description: '타임스탬프 커서 (페이지네이션)' })
  after?: string;

  @Field(() => Int, { nullable: true, defaultValue: 100, description: '결과 수 제한' })
  limit?: number;
}
