import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { Env } from '../env.schema';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly validApiKeys: Set<string>;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService<Env>,
  ) {
    this.validApiKeys = new Set(
      this.configService.getOrThrow('API_KEYS', { infer: true }).split(','),
    );
  }

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
