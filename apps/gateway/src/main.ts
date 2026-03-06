import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { WinstonLoggerService } from '@monorepo/shared';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  app.useLogger(app.get(WinstonLoggerService));
  app.enableShutdownHooks();
  app.enableCors();

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📊 GraphQL endpoint: ${await app.getUrl()}/graphql`);
}
void bootstrap();
