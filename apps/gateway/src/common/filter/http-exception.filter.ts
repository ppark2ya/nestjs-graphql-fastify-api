import { Catch, HttpException, Logger } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AxiosError } from 'axios';
import { HTTP_STATUS_TO_ERROR_CODE } from '@monorepo/shared/common/filter/http-status-mapping';

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

    const code = HTTP_STATUS_TO_ERROR_CODE[status] ?? 'INTERNAL_SERVER_ERROR';

    return new GraphQLError(message, {
      extensions: { code, statusCode: status },
    });
  }
}

@Catch(AxiosError)
export class AxiosExceptionFilter implements GqlExceptionFilter {
  private readonly logger = new Logger(AxiosExceptionFilter.name);

  catch(exception: AxiosError): GraphQLError {
    const status = exception.response?.status;
    const code = exception.code;
    const url = exception.config?.url ?? 'unknown';

    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      this.logger.error(`Backend timeout: ${url}`, exception.message);
      return new GraphQLError('Backend service timeout', {
        extensions: { code: 'GATEWAY_TIMEOUT', statusCode: 504 },
      });
    }

    if (!status) {
      this.logger.error(`Backend unreachable: ${url}`, exception.message);
      return new GraphQLError('Backend service unavailable', {
        extensions: { code: 'BAD_GATEWAY', statusCode: 502 },
      });
    }

    this.logger.error(
      `Backend error: ${url} responded with ${status}`,
      exception.message,
    );

    const gqlCode = HTTP_STATUS_TO_ERROR_CODE[status] ?? 'BAD_GATEWAY';

    return new GraphQLError(`Backend service error (${status})`, {
      extensions: { code: gqlCode, statusCode: status },
    });
  }
}
