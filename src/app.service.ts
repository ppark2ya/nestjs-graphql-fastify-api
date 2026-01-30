import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, retry, timer } from 'rxjs';
import { GraphQLError } from 'graphql';
import { AxiosError } from 'axios';
import { Post } from './models/post.model';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

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
    try {
      return await firstValueFrom(
        this.httpService
          .get<T>(url, { headers })
          .pipe(retry({ count: 2, delay: (_, retryIndex) => timer(retryIndex * 500) })),
      );
    } catch (error) {
      throw this.handleHttpError(error, url);
    }
  }

  private handleHttpError(error: unknown, url: string): GraphQLError {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const code = error.code;

      if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
        this.logger.error(`Backend timeout: ${url}`, error.message);
        return new GraphQLError('Backend service timeout', {
          extensions: { code: 'GATEWAY_TIMEOUT', statusCode: 504 },
        });
      }

      if (!status) {
        this.logger.error(`Backend unreachable: ${url}`, error.message);
        return new GraphQLError('Backend service unavailable', {
          extensions: { code: 'BAD_GATEWAY', statusCode: 502 },
        });
      }

      this.logger.error(
        `Backend error: ${url} responded with ${status}`,
        error.message,
      );
      return new GraphQLError(`Backend service error (${status})`, {
        extensions: { code: 'BAD_GATEWAY', statusCode: 502 },
      });
    }

    this.logger.error(`Unexpected error calling ${url}`, error);
    return new GraphQLError('Internal server error', {
      extensions: { code: 'INTERNAL_SERVER_ERROR', statusCode: 500 },
    });
  }
}
