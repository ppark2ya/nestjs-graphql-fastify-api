# CLAUDE.md

이 파일은 Claude Code가 프로젝트를 이해하는 데 사용하는 컨텍스트 문서입니다.

## 프로젝트 개요

NestJS 기반 GraphQL API 게이트웨이 서버. 외부 REST API를 GraphQL 인터페이스로 통합하여 단일 엔드포인트로 제공하는 역할을 한다. HTTP 서버는 Fastify를 사용하며, GraphQL 엔진은 Apollo Server v5를 사용한다.

## 기술 스택

- **Runtime**: Node.js + TypeScript (v5.7, target ES2023, strict mode)
- **Framework**: NestJS v11
- **HTTP Server**: Fastify (`@nestjs/platform-fastify`)
- **GraphQL**: Apollo Server v5 + `@nestjs/graphql` (Code-First 방식)
- **HTTP Client**: Axios (`@nestjs/axios`)
- **인증**: API Key 기반 (X-API-Key 헤더), JWT/Passport 라이브러리 설치됨 (미사용)
- **유효성 검사**: class-validator + class-transformer
- **로깅**: Winston + winston-daily-rotate-file
- **테스트**: Jest v30 + supertest

## 디렉토리 구조

```
src/
├── auth/                    # 인증/인가
│   ├── api-key.guard.ts     # API Key 검증 글로벌 가드
│   └── public.decorator.ts  # 인증 우회 데코레이터 (@Public)
├── common/
│   └── middleware/
│       └── logger.middleware.ts  # Winston 요청/응답 로깅 미들웨어
├── dto/
│   └── add-numbers.input.ts # GraphQL InputType
├── models/
│   └── post.model.ts        # GraphQL ObjectType
├── app.module.ts            # 루트 모듈
├── app.resolver.ts          # GraphQL 리졸버 (쿼리 정의)
├── app.service.ts           # 비즈니스 로직 (외부 API 호출)
├── app.controller.ts        # REST 컨트롤러
├── main.ts                  # 애플리케이션 진입점
└── schema.gql               # 자동 생성된 GraphQL 스키마 (직접 수정 금지)
```

## 주요 명령어

```bash
npm run build          # TypeScript 컴파일
npm run start:dev      # 개발 모드 (watch)
npm run start:debug    # 디버그 모드 (watch)
npm run start:prod     # 프로덕션 모드 (dist/main.js)
npm run test           # 단위 테스트
npm run test:e2e       # E2E 테스트
npm run test:cov       # 테스트 커버리지
npm run lint           # ESLint (자동 수정 포함)
npm run format         # Prettier 포맷팅
```

## 아키텍처 핵심 사항

### 게이트웨이 패턴
- 이 서버는 독립적인 데이터 저장소가 없음. 데이터베이스를 직접 연결하지 않는다.
- 외부 REST API(예: JSONPlaceholder)를 호출하여 데이터를 가져오고, GraphQL 스키마로 변환하여 클라이언트에 제공한다.
- 향후 여러 마이크로서비스의 REST API를 하나의 GraphQL 엔드포인트로 통합하는 방향으로 확장 가능하다.

### GraphQL 설정
- **Code-First 방식**: TypeScript 클래스와 데코레이터로 스키마를 정의하면 `src/schema.gql`이 자동 생성됨
- **Playground**: 활성화 상태 (`/graphql`)
- **Introspection**: 활성화 상태
- GraphQL context에 request 객체가 포함되어 가드에서 인증 정보 접근 가능

### 인증 흐름
- `ApiKeyGuard`가 글로벌 가드로 등록되어 모든 요청에 `X-API-Key` 헤더 검증
- 유효한 API 키: 환경변수 `API_KEYS`(쉼표 구분) 또는 기본값 `test-api-key-1`, `test-api-key-2`
- `@Public()` 데코레이터를 사용하면 인증 없이 접근 가능 (예: `health` 쿼리)
- 인증 실패 시 GraphQL 에러 (401 UNAUTHENTICATED) 반환

### 미들웨어/파이프라인
- **LoggerMiddleware** (전역): 모든 요청의 method, URL, status, user-agent, 응답 시간 로깅
- **ValidationPipe** (전역): `transform: true`로 DTO 자동 변환 및 유효성 검사
- 로그 파일은 `logs/` 디렉토리에 일별 로테이션으로 저장

## 환경 설정

- `PORT`: 서버 포트 (기본값: 4000)
- `API_KEYS`: 유효한 API 키 목록 (쉼표 구분)
- .env 파일은 사용하지 않으며 환경변수를 직접 참조 (`process.env`)

## 코드 컨벤션

- ESLint: flat config 형식 (`eslint.config.mjs`), `@typescript-eslint/no-explicit-any` 비활성화
- Prettier: 싱글 쿼트, trailing comma all
- 테스트 파일: `*.spec.ts` (단위), `*.e2e-spec.ts` (E2E)
- GraphQL 스키마 파일(`schema.gql`)은 빌드 시 자동 생성되므로 직접 수정하지 않는다
