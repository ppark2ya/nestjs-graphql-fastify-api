import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

export const CORRELATION_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    const correlationId =
      (req.headers[CORRELATION_HEADER] as string) || randomUUID();
    req.headers[CORRELATION_HEADER] = correlationId;
    void res.header(CORRELATION_HEADER, correlationId);
    next();
  }
}
