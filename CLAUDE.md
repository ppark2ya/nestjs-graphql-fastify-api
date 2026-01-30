# CLAUDE.md

이 파일은 Claude Code가 프로젝트를 이해하는 데 사용하는 컨텍스트 문서입니다.

## 프로젝트 개요

NestJS 기반 GraphQL API 게이트웨이 서버. 외부 REST API를 GraphQL 인터페이스로 통합하여 단일 엔드포인트로 제공하는 역할을 한다. HTTP 서버는 Fastify를 사용하며, GraphQL 엔진은 Apollo Server v5를 사용한다.

## 기술 스택

- **Runtime**: Node.js + TypeScript (v5.7, target ES2023, strict mode)
- **Framework**: NestJS v11
- **HTTP Server**: Fastify (`@nestjs/platform-fastify`)
- **GraphQL**: Apollo Server v5 + `@nestjs/graphql` (Code-First 방식), DataLoader, graphql-depth-limit
- **HTTP Client**: Axios (`@nestjs/axios`)
- **인증**: API Key 기반 (X-API-Key 헤더), JWT/Passport 라이브러리 설치됨 (미사용)
- **유효성 검사**: GraphQL 스키마 레벨 타입 검증에 의존 (게이트웨이 서버 특성상 class-validator 미사용 — 백엔드 API와의 강결합 방지)
- **로깅**: Winston + winston-daily-rotate-file
- **빌드**: SWC (`@swc/core`) - TypeScript 대비 빠른 트랜스파일링
- **테스트**: Jest v30 + @swc/jest + supertest

## 디렉토리 구조

```
src/
├── auth/                    # 인증/인가
│   ├── api-key.guard.ts     # API Key 검증 글로벌 가드
│   └── public.decorator.ts  # 인증 우회 데코레이터 (@Public)
├── common/
│   ├── filter/
│   │   └── http-exception.filter.ts  # HttpException → GraphQLError 변환 필터
│   └── middleware/
│       └── logger.middleware.ts  # Winston 요청/응답 로깅 미들웨어
├── dataloader/
│   ├── dataloader.interface.ts  # IDataLoaders 타입 정의
│   ├── dataloader.service.ts    # 요청 단위 DataLoader 팩토리
│   └── dataloader.module.ts     # DataLoader 모듈
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
npm run build          # SWC 빌드 (타입 체크 포함)
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
- **Query Depth Limiting**: `graphql-depth-limit`으로 최대 깊이 5로 제한 (악의적 중첩 쿼리 방지)
- GraphQL context에 request 객체와 DataLoader 인스턴스가 포함됨

### DataLoader
- Context 기반 팩토리 패턴: 매 요청마다 `DataLoaderService.createLoaders()`로 새 인스턴스 생성 (크로스 요청 캐시 누수 방지)
- `GraphQLModule.forRootAsync()`를 통해 `DataLoaderService`를 주입하여 context에 loaders를 제공
- 새 DataLoader 추가 시: `IDataLoaders` 인터페이스에 타입 추가 → `DataLoaderService.createLoaders()`에 인스턴스 생성 → 리졸버에서 `@Context('loaders')` 사용

### 인증 흐름
- `ApiKeyGuard`가 글로벌 가드로 등록되어 모든 요청에 `X-API-Key` 헤더 검증
- 유효한 API 키: 환경변수 `API_KEYS`(쉼표 구분) 또는 기본값 `test-api-key-1`, `test-api-key-2`
- `@Public()` 데코레이터를 사용하면 인증 없이 접근 가능 (예: `health` 쿼리)
- 인증 실패 시 GraphQL 에러 (401 UNAUTHENTICATED) 반환

### 에러 처리
- **HttpExceptionFilter** (전역): `@Catch(HttpException)` + `GqlExceptionFilter` 구현체. 백엔드 API 호출 실패 시 발생하는 `HttpException`을 `GraphQLError`로 변환하여 클라이언트에 일관된 GraphQL 에러 응답을 제공한다.
- 서비스 레이어에서는 `AxiosError`를 NestJS 표준 예외(`BadGatewayException`, `GatewayTimeoutException` 등)로 throw하고, 필터가 이를 GraphQL 에러 코드(`BAD_GATEWAY`, `GATEWAY_TIMEOUT` 등)로 매핑한다.
- HTTP 상태 코드 → GraphQL 에러 코드 매핑: 400→BAD_REQUEST, 401→UNAUTHENTICATED, 403→FORBIDDEN, 404→NOT_FOUND, 408→GATEWAY_TIMEOUT, 429→TOO_MANY_REQUESTS, 502/503→BAD_GATEWAY, 504→GATEWAY_TIMEOUT

### 미들웨어/파이프라인
- **LoggerMiddleware** (전역): 모든 요청의 method, URL, status, user-agent, 응답 시간 로깅
- 입력 유효성 검사는 GraphQL 스키마의 타입 시스템에 위임한다. 게이트웨이 서버에서 class-validator 등으로 세부 검증을 하면 백엔드 API와 강결합이 발생하여 버그를 유발할 수 있으므로 사용하지 않는다.
- 로그 파일은 `logs/` 디렉토리에 일별 로테이션으로 저장

## 환경 설정

- `PORT`: 서버 포트 (기본값: 4000)
- `API_KEYS`: 유효한 API 키 목록 (쉼표 구분)
- .env 파일은 사용하지 않으며 환경변수를 직접 참조 (`process.env`)

## 빌드 시스템

- `nest build` 실행 시 SWC로 트랜스파일, TSC로 타입 체크를 병렬 수행한다 (`nest-cli.json`의 `builder: "swc"`, `typeCheck: true`)
- SWC 설정은 `.swcrc`에 정의되어 있으며 데코레이터, 데코레이터 메타데이터를 지원한다
- Jest 테스트도 `@swc/jest`로 트랜스파일하여 테스트 실행 속도를 높인다

## 코드 컨벤션

- ESLint: flat config 형식 (`eslint.config.mjs`), `@typescript-eslint/no-explicit-any` 비활성화
- Prettier: 싱글 쿼트, trailing comma all
- 테스트 파일: `*.spec.ts` (단위), `*.e2e-spec.ts` (E2E)
- GraphQL 스키마 파일(`schema.gql`)은 빌드 시 자동 생성되므로 직접 수정하지 않는다
