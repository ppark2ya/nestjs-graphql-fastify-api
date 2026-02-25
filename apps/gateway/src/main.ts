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

  // wildcard: false → 개별 파일 라우트만 등록 (GET /assets/..., GET / 등)
  // wildcard: true 사용 시 파일 미존재 → reply.callNotFound() → NestJS의
  // GqlExceptionFilter가 HTTP 응답을 보내지 않아 커넥션이 hang되는 문제 방지
  await fastifyInstance.register(fastifyStatic as any, {
    root: staticRoot,
    wildcard: false,
  });

  // SPA fallback: 파일이 아닌 GET 요청은 index.html 반환 (클라이언트 라우팅)
  const indexPath = join(staticRoot, 'index.html');
  if (existsSync(indexPath)) {
    const indexHtml = readFileSync(indexPath, 'utf-8');
    fastifyInstance.get('/*', async (request, reply) => {
      const urlPath = request.url.split('?')[0];
      // GraphQL, API 경로 또는 파일 확장자가 있는 요청은 404 반환
      if (urlPath.startsWith('/graphql') || /\.\w+$/.test(urlPath)) {
        reply.code(404).send('Not found');
        return;
      }
      reply.code(200).type('text/html').send(indexHtml);
    });
  }

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📊 GraphQL endpoint: ${await app.getUrl()}/graphql`);
}
bootstrap();
