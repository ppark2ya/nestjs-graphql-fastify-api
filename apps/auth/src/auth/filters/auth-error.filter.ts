import {
  HttpException,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export class AuthErrorException extends HttpException {
  constructor(
    public readonly errorCode: string,
    public readonly errorMessage: string,
    statusCode: number,
  ) {
    super({ code: errorCode, message: errorMessage }, statusCode);
  }
}

@Catch(AuthErrorException)
export class AuthErrorFilter implements ExceptionFilter {
  catch(exception: AuthErrorException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const status = exception.getStatus();

    reply.status(status).send({
      code: exception.errorCode,
      message: exception.errorMessage,
      timestamp: formatTimestamp(),
    });
  }
}
