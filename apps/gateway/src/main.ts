import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
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

  // 정적 파일 서빙 (log-viewer SPA)
  const staticRoot = join(process.cwd(), 'dist', 'apps', 'ui');
  const fastifyInstance = app.getHttpAdapter().getInstance();

  await fastifyInstance.register(fastifyStatic as any, {
    root: staticRoot,
    decorateReply: false,
    wildcard: false,
  });

  // SPA fallback: 404 응답 중 클라이언트 라우트 요청이면 index.html 반환
  const indexPath = join(staticRoot, 'index.html');
  if (existsSync(indexPath)) {
    const indexHtml = readFileSync(indexPath, 'utf-8');
    fastifyInstance.addHook('onSend', async (request, reply, payload) => {
      if (
        reply.statusCode === 404 &&
        request.method === 'GET' &&
        !request.url.startsWith('/graphql') &&
        !/\.\w+$/.test(request.url.split('?')[0])
      ) {
        reply.code(200).header('content-type', 'text/html; charset=utf-8');
        return indexHtml;
      }
      return payload;
    });
  }

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📊 GraphQL endpoint: ${await app.getUrl()}/graphql`);
}
bootstrap();
