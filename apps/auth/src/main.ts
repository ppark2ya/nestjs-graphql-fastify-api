import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // TCP Microservice 연결
  const tcpPort = parseInt(process.env.AUTH_TCP_PORT ?? '4002', 10);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  app.enableShutdownHooks();
  app.enableCors();

  // Microservices 시작
  await app.startAllMicroservices();
  console.log(`🔌 Auth TCP Microservice is running on port: ${tcpPort}`);

  // HTTP 서버 시작
  const httpPort = process.env.AUTH_HTTP_PORT ?? process.env.AUTH_PORT ?? 4001;
  await app.listen(httpPort, '0.0.0.0');
  console.log(`🚀 Auth HTTP server is running on: ${await app.getUrl()}`);
}
bootstrap();
