import { Injectable, NestMiddleware } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { requestContext } from '../context/request-context';
import { CORRELATION_HEADER } from './correlation-id.middleware';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: IncomingMessage, _res: ServerResponse, next: () => void) {
    const store = {
      authToken: req.headers.authorization,
      correlationId: req.headers[CORRELATION_HEADER] as string | undefined,
    };
    requestContext.run(store, () => next());
  }
}
