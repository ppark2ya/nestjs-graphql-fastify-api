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

  app.enableShutdownHooks();
  app.enableCors();

  const port = process.env.AUTH_PORT ?? 4001;
  await app.listen(port, '0.0.0.0');
  console.log(`Auth server is running on: ${await app.getUrl()}`);
}
bootstrap();
