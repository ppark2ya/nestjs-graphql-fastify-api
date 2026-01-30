import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { HttpModule } from '@nestjs/axios';
import depthLimit from 'graphql-depth-limit';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppResolver } from './app.resolver';
import { ApiKeyGuard } from './auth/api-key.guard';
import { GqlThrottlerGuard } from './auth/gql-throttler.guard';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { DataLoaderModule } from './dataloader/dataloader.module';
import { DataLoaderService } from './dataloader/dataloader.service';

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
        validationRules: [depthLimit(5)],
        // GraphQL context에 request, reply 객체 및 DataLoader 포함
        context: ({ request, reply }: { request: any; reply: any }) => ({
          req: request,
          reply: reply,
          loaders: dataLoaderService.createLoaders(
            request?.headers?.authorization,
          ),
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppResolver,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware, LoggerMiddleware).forRoutes('*');
  }
}
