import { Global, Logger, Module, OnModuleInit } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { AxiosError, isAxiosError } from 'axios';
import {
  CORRELATION_HEADER,
} from '@monorepo/shared/common/middleware/correlation-id.middleware';
import { requestContext } from '@monorepo/shared/common/context/request-context';

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
      adapter: 'fetch',
    }),
  ],
  exports: [HttpModule],
})
export class GlobalHttpModule implements OnModuleInit {
  private readonly logger = new Logger('HttpClient');

  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    this.httpService.axiosRef.interceptors.request.use((config) => {
      const store = requestContext.getStore();

      this.logger.log(`→ ${config.method?.toUpperCase()} ${config.url}`);

      if (store?.authToken) {
        config.headers.Authorization = store.authToken;
      }
      if (store?.correlationId) {
        config.headers[CORRELATION_HEADER] = store.correlationId;
      }
      if (store?.acceptLanguage) {
        config.headers['accept-language'] = store.acceptLanguage;
      }
      return config;
    });

    this.httpService.axiosRef.interceptors.response.use(
      (response) => {
        this.logger.log(
          `← ${response.status} ${response.config.url}`,
        );
        return response;
      },
      (error: AxiosError) => {
        const responseError = this.findAxiosErrorWithResponse(error);
        const status = responseError.response?.status ?? 'ERR';
        const url =
          responseError.response?.config?.url ??
          responseError.config?.url ??
          error.config?.url ??
          'unknown';
        this.logger.error(`← ${status} ${url}`, error.stack);
        return Promise.reject(error);
      },
    );
  }

  private findAxiosErrorWithResponse(error: AxiosError): AxiosError {
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
}
