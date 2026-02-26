import { Injectable, NestMiddleware } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';

export const CORRELATION_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const correlationId =
      (req.headers[CORRELATION_HEADER] as string) || randomUUID();
    req.headers[CORRELATION_HEADER] = correlationId;
    res.setHeader(CORRELATION_HEADER, correlationId);
    next();
  }
}
