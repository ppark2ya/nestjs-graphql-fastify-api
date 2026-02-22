import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType({ description: '로그 앱 정보' })
export class LogApp {
  @Field(() => String, { description: '앱 이름 (디렉토리명)' })
  name: string;

  @Field(() => String, { description: '노드명' })
  node: string;
}
