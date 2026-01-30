import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

export const CORRELATION_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: (error?: any) => void) {
    const correlationId = req.headers[CORRELATION_HEADER] || randomUUID();
    req.headers[CORRELATION_HEADER] = correlationId;
    res.setHeader(CORRELATION_HEADER, correlationId);
    next();
  }
}
