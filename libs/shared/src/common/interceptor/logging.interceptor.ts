import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { FastifyRequest } from 'fastify';
import { GraphQLResolveInfo } from 'graphql';
import { Observable, tap, catchError } from 'rxjs';

/**
 * LoggingInterceptor - HTTP, GraphQL, TCP 메시지 모두 로깅
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const contextType = context.getType<string>();
    const now = Date.now();

    let logPrefix: string;
    let logData: string;

    if (contextType === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context);
      const info = gqlContext.getInfo<GraphQLResolveInfo>();
      const operationName = info.parentType.name;
      const fieldName = info.fieldName;
      logPrefix = `GraphQL ${operationName} [${fieldName}]`;
      logData = '';
    } else if (contextType === 'http') {
      const request = context.switchToHttp().getRequest<FastifyRequest>();
      const method = request.method;
      const url = request.url;
      logPrefix = `HTTP ${method} ${url}`;
      logData = '';
    } else if (contextType === 'rpc') {
      // TCP/Microservice 메시지 로깅
      const rpcContext = context.switchToRpc();
      const pattern = context.getHandler().name;
      const data: unknown = rpcContext.getData();
      logPrefix = `TCP ${pattern}`;
      logData = JSON.stringify(this.sanitizeData(data));
    } else {
      logPrefix = `${contextType.toUpperCase()}`;
      logData = '';
    }

    this.logger.log(`→ ${logPrefix}${logData ? ` | ${logData}` : ''}`);

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        this.logger.log(`← ${logPrefix} | ${duration}ms`);
      }),
      catchError((error: Error) => {
        const duration = Date.now() - now;
        this.logger.error(`✕ ${logPrefix} | ${duration}ms | ${error.message}`);
        throw error;
      }),
    );
  }

  /**
   * 민감한 데이터 마스킹
   */
  private sanitizeData(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = [
      'password',
      'accessToken',
      'refreshToken',
      'twoFactorToken',
      'totpCode',
    ];
    const sanitized = { ...(data as Record<string, unknown>) };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***';
      }
    }

    return sanitized;
  }
}
