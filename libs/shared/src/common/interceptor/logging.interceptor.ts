import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError } from 'rxjs';

/**
 * LoggingInterceptor - HTTP 및 TCP 메시지 모두 로깅
 * HTTP 요청과 Microservice 메시지 패턴을 구분하여 처리
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('LoggingInterceptor');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const contextType = context.getType();
    const now = Date.now();

    let logPrefix: string;
    let logData: string;

    if (contextType === 'http') {
      // HTTP 요청 로깅
      const request = context.switchToHttp().getRequest();
      const method = request.method;
      const url = request.url;
      logPrefix = `HTTP ${method} ${url}`;
      logData = '';
    } else if (contextType === 'rpc') {
      // TCP/Microservice 메시지 로깅
      const rpcContext = context.switchToRpc();
      const pattern = context.getHandler().name;
      const data = rpcContext.getData();
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
      catchError((error) => {
        const duration = Date.now() - now;
        this.logger.error(
          `✕ ${logPrefix} | ${duration}ms | ${error.message}`,
        );
        throw error;
      }),
    );
  }

  /**
   * 민감한 데이터 마스킹
   */
  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = ['password', 'accessToken', 'refreshToken', 'twoFactorToken', 'totpCode'];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***';
      }
    }

    return sanitized;
  }
}
