import { Catch, HttpException, Logger } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

const HTTP_STATUS_TO_GQL_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  408: 'GATEWAY_TIMEOUT',
  429: 'TOO_MANY_REQUESTS',
  502: 'BAD_GATEWAY',
  503: 'BAD_GATEWAY',
  504: 'GATEWAY_TIMEOUT',
};

@Catch(HttpException)
export class HttpExceptionFilter implements GqlExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException): GraphQLError {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : (response as any).message ?? exception.message;

    this.logger.error(`HttpException [${status}]: ${message}`);

    const code = HTTP_STATUS_TO_GQL_CODE[status] ?? 'INTERNAL_SERVER_ERROR';

    return new GraphQLError(message, {
      extensions: { code, statusCode: status },
    });
  }
}
