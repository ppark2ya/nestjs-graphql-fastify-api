import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, retry, timer } from 'rxjs';
import { Post } from './models/post.model';

@Injectable()
export class AppService {
  constructor(private readonly httpService: HttpService) {}

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * 백엔드 REST API 호출 시 클라이언트의 Authorization 헤더를 전달합니다.
   * @param authToken - Authorization 헤더 값 (예: "Bearer xxx")
   */
  async getPosts(authToken?: string): Promise<Post[]> {
    const headers = this.buildHeaders(authToken);

    const { data } = await this.requestWithRetry<Post[]>(
      'https://jsonplaceholder.typicode.com/posts',
      headers,
    );
    return data;
  }

  async getPostsByUserIds(
    userIds: number[],
    authToken?: string,
  ): Promise<Post[]> {
    const headers = this.buildHeaders(authToken);

    const { data } = await this.requestWithRetry<Post[]>(
      'https://jsonplaceholder.typicode.com/posts',
      headers,
    );
    return data.filter((post) => userIds.includes(post.userId));
  }

  private buildHeaders(
    authToken?: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = authToken;
    }
    return headers;
  }

  private async requestWithRetry<T>(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ data: T }> {
    return firstValueFrom(
      this.httpService
        .get<T>(url, { headers })
        .pipe(retry({ count: 2, delay: (_, retryIndex) => timer(retryIndex * 500) })),
    );
  }
}
