import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { LoggerMiddleware } from '@monorepo/shared/common/middleware/logger.middleware';
import { CorrelationIdMiddleware } from '@monorepo/shared/common/middleware/correlation-id.middleware';
import { RequestContextMiddleware } from '@monorepo/shared/common/middleware/request-context.middleware';
import { LoggingInterceptor } from '@monorepo/shared/common/interceptor/logging.interceptor';
import { envSchema } from './env.schema';

const useMockAuth = process.env.USE_MOCK_AUTH === 'true';

const dbModules = useMockAuth ? [] : [DatabaseModule, AccountModule];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    ...dbModules,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
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
