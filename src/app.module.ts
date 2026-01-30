import { Module, NestModule, MiddlewareConsumer, OnModuleInit } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { HttpModule } from '@nestjs/axios';
import depthLimit from 'graphql-depth-limit';
import { AppService } from './app.service';
import { AppResolver } from './app.resolver';
import { ApiKeyGuard } from './auth/api-key.guard';
import { GqlThrottlerGuard } from './auth/gql-throttler.guard';
import { HttpService } from '@nestjs/axios';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { CORRELATION_HEADER, CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { requestContext } from './common/context/request-context';
import { DataLoaderModule } from './dataloader/dataloader.module';
import { DataLoaderService } from './dataloader/dataloader.service';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import {
  HttpExceptionFilter,
  AxiosExceptionFilter,
} from './common/filter/http-exception.filter';

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [DataLoaderModule],
      inject: [DataLoaderService],
      useFactory: (dataLoaderService: DataLoaderService) => ({
        autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        playground: false,
        introspection: process.env.NODE_ENV === 'development' ? true : false,
        includeStacktraceInErrorResponses:
          process.env.NODE_ENV !== 'production',
        validationRules: [depthLimit(5)],
        // GraphQL context에 request, reply 객체 및 DataLoader 포함
        context: ({ request, reply }: { request: any; reply: any }) => ({
          req: request,
          reply: reply,
          loaders: dataLoaderService.createLoaders(),
      // userLoader: createApiLoader(httpService, (id) => `http://api/users/${id}`),
      // productLoader: createApiLoader(httpService, (id) => `http://api/products/${id}`),
      // orderLoader: createApiLoader(httpService, (id) => `http://api/orders/${id}`),
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
  ],
  providers: [
    AppService,
    AppResolver,
    // 전역 Filter 등록 - 백엔드 API 에러 → GraphQLError 변환
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: AxiosExceptionFilter,
    },
    // 전역 Guard 등록 - Rate Limiting
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
    // 전역 Guard 등록 - API Key 검증
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
