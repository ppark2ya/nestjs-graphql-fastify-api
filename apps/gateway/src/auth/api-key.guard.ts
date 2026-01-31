import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  // 허용된 API 키 목록 (실제 운영에서는 DB나 환경변수에서 관리)
  private readonly validApiKeys: Set<string> = new Set(
    (process.env.API_KEYS || 'test-api-key-1,test-api-key-2').split(','),
  );

  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    // @Public() 데코레이터가 붙은 엔드포인트는 검증 건너뜀
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const ctx = GqlExecutionContext.create(context);
    const request = ctx.getContext().req;

    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new GraphQLError('API key is missing', {
        extensions: { code: 'UNAUTHENTICATED', statusCode: 401 },
      });
    }

    if (!this.validApiKeys.has(apiKey)) {
      throw new GraphQLError('Invalid API key', {
        extensions: { code: 'UNAUTHENTICATED', statusCode: 401 },
      });
    }

    return true;
  }
}
