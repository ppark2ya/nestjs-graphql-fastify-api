import { Module, NestModule, MiddlewareConsumer, OnModuleInit } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { HttpModule } from '@nestjs/axios';
import depthLimit from 'graphql-depth-limit';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
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
        context: ({ request, reply }: { request: any; reply: any }) => ({
          req: request,
          reply: reply,
          loaders: dataLoaderService.createLoaders(),
        }),
      }),
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
    DataLoaderModule,
    CircuitBreakerModule,
    AuthProxyModule,
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
  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    this.httpService.axiosRef.interceptors.request.use((config) => {
      const store = requestContext.getStore();
      if (store?.authToken) {
        config.headers.Authorization = store.authToken;
      }
      if (store?.correlationId) {
        config.headers[CORRELATION_HEADER] = store.correlationId;
      }
      return config;
    });
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, RequestContextMiddleware, LoggerMiddleware)
      .forRoutes('*');
  }
}
