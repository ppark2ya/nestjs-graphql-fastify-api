import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerRequest,
  ThrottlerLimitDetail,
} from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';
import { FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext): {
    req: FastifyRequest;
    res: FastifyReply;
  } {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext();

    // GraphQL context에서 req/reply가 없을 경우 HTTP context에서 가져옴
    const req = ctx.req ?? context.switchToHttp().getRequest();
    const res = ctx.reply ?? context.switchToHttp().getResponse();

    return { req, res };
  }

  /**
   * handleRequest를 오버라이드하여 Fastify의 reply.header() 호출과 호환되도록 수정
   */
  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, getTracker, generateKey } =
      requestProps;
    const { req, res } = this.getRequestResponse(context);

    // User-Agent 무시 패턴 체크
    const ignoreUserAgents = (throttler as any).ignoreUserAgents ?? (this as any).commonOptions?.ignoreUserAgents;
    if (Array.isArray(ignoreUserAgents)) {
      for (const pattern of ignoreUserAgents) {
        if (pattern.test(req.headers['user-agent'])) {
          return true;
        }
      }
    }

    const throttlerName = throttler.name ?? 'default';
    const tracker = await getTracker(req, context);
    const key = generateKey(context, tracker, throttlerName);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );

    const getThrottlerSuffix = (name: string) =>
      name === 'default' ? '' : `-${name}`;
    const setHeaders =
      (throttler as any).setHeaders ?? (this as any).commonOptions?.setHeaders ?? true;

    // Fastify reply.header() 사용
    if (isBlocked) {
      if (setHeaders && res && typeof res.header === 'function') {
        res.header(
          `Retry-After${getThrottlerSuffix(throttlerName)}`,
          String(timeToBlockExpire),
        );
      }
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      } as ThrottlerLimitDetail);
    }

    if (setHeaders && res && typeof res.header === 'function') {
      res.header(
        `${(this as any).headerPrefix}-Limit${getThrottlerSuffix(throttlerName)}`,
        String(limit),
      );
      res.header(
        `${(this as any).headerPrefix}-Remaining${getThrottlerSuffix(throttlerName)}`,
        String(Math.max(0, limit - totalHits)),
      );
      res.header(
        `${(this as any).headerPrefix}-Reset${getThrottlerSuffix(throttlerName)}`,
        String(timeToExpire),
      );
    }

    return true;
  }

  /**
   * GraphQL 요청에서 IP 주소 추출
   */
  protected async getTracker(req: FastifyRequest): Promise<string> {
    return req.ip ?? req.ips?.[0] ?? 'unknown';
  }
}


