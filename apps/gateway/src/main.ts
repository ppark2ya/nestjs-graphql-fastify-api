import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.enableShutdownHooks();
  app.enableCors();

  // 정적 파일 서빙 (log-viewer SPA)
  const staticRoot = join(process.cwd(), 'dist', 'apps', 'ui');
  const fastifyInstance = app.getHttpAdapter().getInstance();

  await fastifyInstance.register(fastifyStatic as any, {
    root: staticRoot,
    decorateReply: false,
    wildcard: false,
  });

  // SPA fallback: 정적 파일/API에 매칭되지 않는 경로는 index.html 반환
  fastifyInstance.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html', staticRoot);
  });

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📊 GraphQL endpoint: ${await app.getUrl()}/graphql`);
}
bootstrap();
