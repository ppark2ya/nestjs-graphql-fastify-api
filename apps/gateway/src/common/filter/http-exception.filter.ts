import { Catch, HttpException, Logger } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AxiosError, isAxiosError } from 'axios';
import { HTTP_STATUS_TO_ERROR_CODE } from '@monorepo/shared/common/filter/http-status-mapping';

type ParsedDownstreamError = {
  message?: string;
  errorCode?: string;
  rawMessage?: string;
  timestamp?: string;
  passwordChangeToken?: string;
};

function parseDownstreamErrorData(data: unknown): ParsedDownstreamError {
  if (typeof data === 'string') {
    try {
      return parseDownstreamErrorData(JSON.parse(data));
    } catch {
      return { rawMessage: data };
    }
  }

  if (!data || typeof data !== 'object') {
    return {};
  }

  const record = data as Record<string, unknown>;
  return {
    message: typeof record.message === 'string' ? record.message : undefined,
    errorCode:
      typeof record.errorCode === 'string'
        ? record.errorCode
        : typeof record.code === 'string'
          ? record.code
          : undefined,
    timestamp:
      typeof record.timestamp === 'string' ? record.timestamp : undefined,
    passwordChangeToken:
      typeof record.passwordChangeToken === 'string'
        ? record.passwordChangeToken
        : undefined,
  };
}

function inferDownstreamService(url: string): string | undefined {
  if (url.includes('/auth/')) {
    return 'auth';
  }
  if (
    url.includes('/api/logs') ||
    url.includes('/api/containers') ||
    url.includes('/api/stats')
  ) {
    return 'log-streamer';
  }
  return undefined;
}

function findAxiosErrorWithResponse(error: AxiosError): AxiosError {
  let current: unknown = error;
  let fallback = error;

  while (isAxiosError(current)) {
    fallback = current;
    if (current.response) {
      return current;
    }
    current = current.cause;
  }

  return fallback;
}

function toAxiosGraphQLError(
  exception: AxiosError,
  logger: Logger,
): GraphQLError {
  const responseError = findAxiosErrorWithResponse(exception);
  const status = responseError.response?.status ?? responseError.status;
  const code = exception.code ?? responseError.code;
  const url =
    responseError.response?.config?.url ??
    responseError.config?.url ??
    exception.config?.url ??
    'unknown';
  const downstreamService = inferDownstreamService(url);

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    logger.error(`Backend timeout: ${url}`, exception.stack);
    return new GraphQLError(
      downstreamService === 'auth'
        ? '인증 서버 응답이 지연되고 있습니다.'
        : 'Backend service timeout',
      {
        extensions: {
          code: 'GATEWAY_TIMEOUT',
          statusCode: 504,
          ...(downstreamService && { downstreamService }),
        },
      },
    );
  }

  if (!status) {
    logger.error(`Backend unreachable: ${url}`, exception.stack);
    return new GraphQLError(
      downstreamService === 'auth'
        ? '인증 서버에 연결할 수 없습니다.'
        : 'Backend service unavailable',
      {
        extensions: {
          code: 'BAD_GATEWAY',
          statusCode: 502,
          ...(downstreamService && { downstreamService }),
        },
      },
    );
  }

  const data = parseDownstreamErrorData(responseError.response?.data);
  const message =
    data.message ?? data.rawMessage ?? `Backend service error (${status})`;

  logger.error(`Backend error: ${url} responded with ${status}`);

  const gqlCode = HTTP_STATUS_TO_ERROR_CODE[status] ?? 'BAD_GATEWAY';

  return new GraphQLError(message, {
    extensions: {
      code: gqlCode,
      statusCode: status,
      ...(data.errorCode && { errorCode: data.errorCode }),
      ...(data.timestamp && { timestamp: data.timestamp }),
      ...(data.passwordChangeToken && {
        passwordChangeToken: data.passwordChangeToken,
      }),
      ...(downstreamService && { downstreamService }),
    },
  });
}

@Catch()
export class HttpExceptionFilter implements GqlExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly axiosLogger = new Logger('AxiosExceptionFilter');

  catch(exception: unknown): GraphQLError {
    if (isAxiosError(exception)) {
      return toAxiosGraphQLError(exception, this.axiosLogger);
    }

    if (exception instanceof GraphQLError) {
      return exception;
    }

    if (!(exception instanceof HttpException)) {
      const message =
        exception instanceof Error ? exception.message : 'Internal server error';
      this.logger.error(`Unexpected exception: ${message}`);
      return new GraphQLError('Internal server error', {
        extensions: { code: 'INTERNAL_SERVER_ERROR', statusCode: 500 },
      });
    }

    const status = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: string }).message ?? exception.message);

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
    return toAxiosGraphQLError(exception, this.logger);
  }
}
