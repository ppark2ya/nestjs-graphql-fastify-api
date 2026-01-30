import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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

  // CORS 설정 (필요시 활성화)
  app.enableCors();

  // 글로벌 ValidationPipe 적용
  app.useGlobalPipes(new ValidationPipe({
    transform: true, // 요청 데이터를 DTO 클래스 인스턴스로 변환
  }));

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📊 GraphQL Playground: ${await app.getUrl()}/graphql`);
}
bootstrap();
