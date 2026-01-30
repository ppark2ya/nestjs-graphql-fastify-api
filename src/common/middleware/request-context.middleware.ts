import { Injectable, NestMiddleware } from '@nestjs/common';
import { requestContext } from '../context/request-context';
import { CORRELATION_HEADER } from './correlation-id.middleware';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: (error?: any) => void) {
    const store = {
      authToken: req.headers.authorization,
      correlationId: req.headers[CORRELATION_HEADER],
    };
    requestContext.run(store, () => next());
  }
}
