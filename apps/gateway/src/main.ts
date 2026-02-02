import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Graceful shutdown 활성화 (SIGTERM/SIGINT 수신 시 정리 작업 수행)
  app.enableShutdownHooks();

  // CORS 설정 (필요시 활성화)
  app.enableCors();

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📊 GraphQL Playground: ${await app.getUrl()}/graphql`);
}
bootstrap();
