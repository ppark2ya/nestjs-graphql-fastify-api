import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { TokenModule } from './token/token.module';
import { LoggerMiddleware } from '@monorepo/shared/common/middleware/logger.middleware';
import { CorrelationIdMiddleware } from '@monorepo/shared/common/middleware/correlation-id.middleware';
import { RequestContextMiddleware } from '@monorepo/shared/common/middleware/request-context.middleware';
import { LoggingInterceptor } from '@monorepo/shared/common/interceptor/logging.interceptor';

const useMockAuth = process.env.USE_MOCK_AUTH === 'true';

// Mock 모드에서는 DB 관련 모듈 제외
const dbModules = useMockAuth ? [] : [DatabaseModule, UserModule, TokenModule];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
      .apply(CorrelationIdMiddleware, RequestContextMiddleware, LoggerMiddleware)
      .forRoutes('*');
  }
}

