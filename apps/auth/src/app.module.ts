import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { TokenModule } from './token/token.module';
import { LoggerMiddleware } from '@monorepo/shared/common/middleware/logger.middleware';
import { CorrelationIdMiddleware } from '@monorepo/shared/common/middleware/correlation-id.middleware';
import { RequestContextMiddleware } from '@monorepo/shared/common/middleware/request-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UserModule,
    TokenModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, RequestContextMiddleware, LoggerMiddleware)
      .forRoutes('*');
  }
}
