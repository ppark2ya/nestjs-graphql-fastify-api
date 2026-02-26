import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType({ description: '파싱된 로그 라인' })
export class LogLine {
  @Field(() => String, {
    nullable: true,
    description: '타임스탬프 (파싱 불가 시 null)',
  })
  timestamp?: string;

  @Field(() => String, {
    nullable: true,
    description: '로그 레벨 (ERROR, WARN, INFO, DEBUG)',
  })
  level?: string;

  @Field(() => String, {
    nullable: true,
    description: '소스 (클래스명, 모듈명)',
  })
  source?: string;

  @Field(() => String, {
    description: '로그 메시지 (파싱 실패 시 원본 라인 전체)',
  })
  message: string;

  @Field(() => String, {
    nullable: true,
    description: '추가 메타데이터 (JSON 문자열)',
  })
  metadata?: string;

  @Field(() => String, { description: 'Swarm 노드명' })
  node: string;

  @Field(() => String, { description: '로그 파일명' })
  file: string;

  @Field(() => Int, { description: '파일 내 라인 번호' })
  lineNo: number;
}
