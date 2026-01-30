import { Resolver, Query, Args, Int, Context } from '@nestjs/graphql';
import { AppService } from './app.service';
import { AddNumbersInput } from './dto/add-numbers.input';
import { Post } from './models/post.model';
import { Public } from './auth/public.decorator';
import type { IDataLoaders } from './dataloader/dataloader.interface';

@Resolver()
export class AppResolver {
  constructor(private readonly appService: AppService) { }

  @Query(() => [Post], { description: 'Get posts from JSONPlaceholder REST API' })
  async posts(@Context() context: any): Promise<Post[]> {
    const authToken = context.req?.headers?.authorization;
    return this.appService.getPosts(authToken);
  }

  @Public()
  @Query(() => String, { description: 'Health check query' })
  health(): string {
    return 'OK';
  }

  @Query(() => String, { description: 'Returns hello message' })
  hello(): string {
    return this.appService.getHello();
  }

  @Query(() => String, { description: 'Echo the input message' })
  echo(@Args('message') message: string): string {
    return `Echo: ${message}`;
  }

  @Query(() => Int, { description: 'Add two numbers' })
  add(@Args('input') input: AddNumbersInput): number {
    return input.a + input.b;
  }

  @Query(() => [Post], { description: 'Get posts by user ID (uses DataLoader)' })
  async postsByUser(
    @Args('userId', { type: () => Int }) userId: number,
    @Context('loaders') loaders: IDataLoaders,
  ): Promise<Post[]> {
    return loaders.postsLoader.load(userId);
  }
}
