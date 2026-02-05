import { Module, NestModule, MiddlewareConsumer, OnModuleInit } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import depthLimit from 'graphql-depth-limit';
import { GlobalHttpModule } from './http/global-http.module';
import { AppService } from './app.service';
import { AppResolver } from './app.resolver';
import { ApiKeyGuard } from './auth/api-key.guard';
import { GqlThrottlerGuard } from './auth/gql-throttler.guard';
import { HttpService } from '@nestjs/axios';
import { LoggerMiddleware } from '@monorepo/shared/common/middleware/logger.middleware';
import { CORRELATION_HEADER, CorrelationIdMiddleware } from '@monorepo/shared/common/middleware/correlation-id.middleware';
import { RequestContextMiddleware } from '@monorepo/shared/common/middleware/request-context.middleware';
import { requestContext } from '@monorepo/shared/common/context/request-context';
import { DataLoaderModule } from './dataloader/dataloader.module';
import { DataLoaderService } from './dataloader/dataloader.service';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import {
  HttpExceptionFilter,
  AxiosExceptionFilter,
} from './common/filter/http-exception.filter';
import { AuthProxyModule } from './auth-proxy/auth-proxy.module';
import { LoggingInterceptor } from '@monorepo/shared/common/interceptor/logging.interceptor';
import { WinstonLoggerModule, WinstonLoggerService } from '@monorepo/shared';
import { envSchema } from './env.schema';
import { PubSubModule } from './pubsub/pubsub.module';
import { LogStreamerProxyModule } from './log-streamer-proxy/log-streamer-proxy.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: (config) => envSchema.parse(config),
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [DataLoaderModule],
      inject: [DataLoaderService],
      useFactory: (dataLoaderService: DataLoaderService) => ({
        autoSchemaFile: join(process.cwd(), 'apps/gateway/src/schema.gql'),
        sortSchema: true,
        playground: false,
        introspection: process.env.NODE_ENV !== 'production',
        includeStacktraceInErrorResponses:
          process.env.NODE_ENV !== 'production',
        validationRules: [depthLimit(5)],
        subscriptions: {
          'graphql-ws': true,
          'subscriptions-transport-ws': false,
        },
        context: ({ request, reply, connection }: { request: any; reply: any; connection?: any }) => {
          if (connection) {
            return { req: connection.context, loaders: dataLoaderService.createLoaders() };
          }
          return {
            req: request,
            reply: reply,
            loaders: dataLoaderService.createLoaders(),
          };
        },
      }),
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
    GlobalHttpModule,
    DataLoaderModule,
    CircuitBreakerModule,
    AuthProxyModule,
    WinstonLoggerModule,
    PubSubModule,
    LogStreamerProxyModule,
  ],
  providers: [
    AppService,
    AppResolver,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: AxiosExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule implements NestModule, OnModuleInit {
  private readonly logger: WinstonLoggerService;

  constructor(
    private readonly httpService: HttpService,
    logger: WinstonLoggerService,
  ) {
    this.logger = logger.setContext('HttpClient');
  }

  onModuleInit() {
    this.httpService.axiosRef.interceptors.request.use((config) => {
      this.logger.log(`→ ${config.method?.toUpperCase()} ${config.url}`);

      const store = requestContext.getStore();
      if (store?.authToken) {
        config.headers.Authorization = store.authToken;
      }
      if (store?.correlationId) {
        config.headers[CORRELATION_HEADER] = store.correlationId;
      }
      return config;
    });

    this.httpService.axiosRef.interceptors.response.use(
      (response) => {
        this.logger.log(`← ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        const status = error.response?.status || 'ERR';
        const url = error.config?.url || 'unknown';
        this.logger.error(`← ${status} ${url}`, error.message);
        return Promise.reject(error);
      },
    );
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, RequestContextMiddleware, LoggerMiddleware)
      .forRoutes('*');
  }
}
