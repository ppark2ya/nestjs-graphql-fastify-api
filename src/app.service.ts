import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Post } from './models/post.model';

@Injectable()
export class AppService {
  constructor(private readonly httpService: HttpService) { }

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * 백엔드 REST API 호출 시 클라이언트의 Authorization 헤더를 전달합니다.
   * @param authToken - Authorization 헤더 값 (예: "Bearer xxx")
   */
  async getPosts(authToken?: string): Promise<Post[]> {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = authToken;
    }

    const { data } = await firstValueFrom(
      this.httpService.get<Post[]>(
        'https://jsonplaceholder.typicode.com/posts',
        { headers },
      ),
    );
    return data;
  }

  async getPostsByUserIds(
    userIds: number[],
    authToken?: string,
  ): Promise<Post[]> {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = authToken;
    }

    const { data } = await firstValueFrom(
      this.httpService.get<Post[]>(
        'https://jsonplaceholder.typicode.com/posts',
        { headers },
      ),
    );
    return data.filter((post) => userIds.includes(post.userId));
  }
}
