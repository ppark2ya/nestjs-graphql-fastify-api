import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Post } from './models/post.model';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';

@Injectable()
export class AppService {
  constructor(
    private readonly httpService: HttpService,
    private readonly cbService: CircuitBreakerService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getPosts(): Promise<Post[]> {
    return this.cbService.fire('jsonplaceholder', async () => {
      const { data } = await firstValueFrom(
        this.httpService.get<Post[]>(
          'https://jsonplaceholder.typicode.com/posts',
        ),
      );
      return data;
    });
  }

  async getPostsByUserIds(userIds: number[]): Promise<Post[]> {
    return this.cbService.fire('jsonplaceholder', async () => {
      const { data } = await firstValueFrom(
        this.httpService.get<Post[]>(
          'https://jsonplaceholder.typicode.com/posts',
        ),
      );
      return data.filter((post) => userIds.includes(post.userId));
    });
  }
}
