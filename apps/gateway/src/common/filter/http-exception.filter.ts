import { Catch, HttpException, Logger } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AxiosError } from 'axios';
import { HTTP_STATUS_TO_ERROR_CODE } from '@monorepo/shared/common/filter/http-status-mapping';

type ParsedDownstreamError = {
  message?: string;
  code?: string;
  rawMessage?: string;
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
    code: typeof record.code === 'string' ? record.code : undefined,
    passwordChangeToken:
      typeof record.passwordChangeToken === 'string'
        ? record.passwordChangeToken
        : undefined,
  };
}

function isAuthUrl(url: string): boolean {
  return url.includes('/auth/');
}

@Catch(HttpException)
export class HttpExceptionFilter implements GqlExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException): GraphQLError {
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
    const status = exception.response?.status;
    const code = exception.code;
    const url = exception.config?.url ?? 'unknown';
    const downstreamService = isAuthUrl(url) ? 'auth' : undefined;

    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      this.logger.error(`Backend timeout: ${url}`, exception.stack);
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
      this.logger.error(`Backend unreachable: ${url}`, exception.stack);
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

    const data = parseDownstreamErrorData(exception.response?.data);
    const message =
      data.message ?? data.rawMessage ?? `Backend service error (${status})`;

    this.logger.error(`Backend error: ${url} responded with ${status}`);

    const gqlCode = HTTP_STATUS_TO_ERROR_CODE[status] ?? 'BAD_GATEWAY';

    return new GraphQLError(message, {
      extensions: {
        code: gqlCode,
        statusCode: status,
        ...(data.code && { errorCode: data.code }),
        ...(downstreamService === 'auth' &&
          data.code && { authErrorCode: data.code }),
        ...(data.passwordChangeToken && {
          passwordChangeToken: data.passwordChangeToken,
        }),
        ...(downstreamService && { downstreamService }),
      },
    });
  }
}
