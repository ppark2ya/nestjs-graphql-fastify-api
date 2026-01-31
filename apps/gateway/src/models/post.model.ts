import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class Post {
  @Field(() => Int)
  userId: number;

  @Field(() => Int)
  id: number;

  @Field()
  title: string;

  @Field()
  body: string;
}
