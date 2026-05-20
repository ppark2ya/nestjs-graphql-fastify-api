import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import depthLimit from 'graphql-depth-limit';
import { FastifyRequest, FastifyReply } from 'fastify';
import { GlobalHttpModule } from './http/global-http.module';
import { ApiKeyGuard } from './auth/api-key.guard';
import { GqlThrottlerGuard } from './auth/gql-throttler.guard';
import { LoggerMiddleware } from '@monorepo/shared/common/middleware/logger.middleware';
import { CorrelationIdMiddleware } from '@monorepo/shared/common/middleware/correlation-id.middleware';
import { RequestContextMiddleware } from '@monorepo/shared/common/middleware/request-context.middleware';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import {
  HttpExceptionFilter,
  AxiosExceptionFilter,
} from './common/filter/http-exception.filter';
import { AuthProxyModule } from './auth-proxy/auth-proxy.module';
import { LoggingInterceptor } from '@monorepo/shared/common/interceptor/logging.interceptor';
import { WinstonLoggerModule } from '@monorepo/shared';
import { envSchema } from './env.schema';
import { PubSubModule } from './pubsub/pubsub.module';
import { LogStreamerProxyModule } from './log-streamer-proxy/log-streamer-proxy.module';
import { LogHistoryModule } from './log-history/log-history.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: (config) => envSchema.parse(config),
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useFactory: () => ({
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
        context: ({
          request,
          reply,
          connection,
        }: {
          request: FastifyRequest;
          reply: FastifyReply;
          connection?: { context: FastifyRequest };
        }) => {
          if (connection) {
            return {
              req: connection.context,
            };
          }
          return {
            req: request,
            reply: reply,
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
    CircuitBreakerModule,
    AuthProxyModule,
    WinstonLoggerModule,
    PubSubModule,
    LogStreamerProxyModule,
    LogHistoryModule,
  ],
  providers: [
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        CorrelationIdMiddleware,
        RequestContextMiddleware,
        LoggerMiddleware,
      )
      .forRoutes('*');
  }
}
