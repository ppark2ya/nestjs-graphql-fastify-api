# CLAUDE.md

이 파일은 Claude Code가 프로젝트를 이해하는 데 사용하는 컨텍스트 문서입니다.

## 작업 스타일

- 계획(plan) 단계에서만 질문하고, 구현 중에는 스스로 판단하여 진행한다.
- 구현 중 막히면 질문 대신 가장 합리적인 방향으로 먼저 시도한다.

## 프로젝트 개요

Nx monorepo 기반의 멀티 서버 + 프론트엔드 프로젝트. 다섯 개의 애플리케이션으로 구성된다:
- **Gateway** (port 4000): GraphQL API 게이트웨이. 외부 REST API를 GraphQL 인터페이스로 통합하여 단일 엔드포인트로 제공한다. GraphQL Subscription (Redis PubSub)을 지원하며, 프로덕션에서는 UI SPA를 정적 파일로 서빙한다.
- **Auth** (port 4001): REST 기반 인증 서버. JWT(RS256) 토큰 발급, TOTP 2FA, refresh token rotation을 처리한다.
- **Log Streamer** (port 4003): Go 기반 Docker 로그 스트리밍 서비스. Docker 컨테이너 로그를 WebSocket으로 스트리밍하고 로그 파일 검색 API를 제공한다.
- **UI** (port 5173 dev): React SPA 대시보드. 로그인/2FA 인증, 실시간 Docker 로그 스트리밍, 로그 검색 기능을 제공한다. 프로덕션에서는 Gateway가 빌드된 정적 파일을 서빙한다.
- **Error Reporter**: Docker Swarm 내 cron 컨테이너 (node:24-alpine). 매일 오전 8시(영업일) 전날 ERROR 로그를 서비스별로 수집하여 Slack Incoming Webhook으로 알림 전송. `scripts/daily-error-report.mjs` 실행.

공통 코드는 `libs/shared`로 분리되어 NestJS 앱에서 `@monorepo/shared` 경로로 import한다.

## 기술 스택

- **Runtime**: Node.js v24 + TypeScript (v5.7, target ES2023, strict mode), Go 1.18+
- **Version Manager**: mise (Node.js, Go 버전 관리)
- **Monorepo**: Nx (integrated monorepo)
- **Framework**: NestJS v11 (Gateway, Auth), Go net/http (Log Streamer)
- **HTTP Server**: Fastify (`@nestjs/platform-fastify`)
- **GraphQL** (gateway): Apollo Server v5 + `@nestjs/graphql` (Code-First 방식), DataLoader, graphql-depth-limit, graphql-ws (Subscriptions)
- **HTTP Client**: Axios (`@nestjs/axios`), Circuit Breaker (`opossum`)
- **Real-time**: Redis PubSub (`graphql-redis-subscriptions`), WebSocket (`ws`, `gorilla/websocket`)
- **인증 (gateway)**: API Key 기반 (X-API-Key 헤더) — 클라이언트 애플리케이션 식별
- **인증 (auth)**: JWT RS256 (jose), TOTP 2FA (otplib), Passport, bcryptjs 3.0.3 (Spring Security 호환) — 사용자 식별
- **DB (auth)**: Drizzle ORM + MySQL2
- **유효성 검사 (gateway)**: GraphQL 스키마 레벨 타입 검증에 의존 (게이트웨이 서버 특성상 class-validator 미사용)
- **유효성 검사 (auth)**: zod 스키마 + ZodValidationPipe
- **환경변수 (auth)**: `@nestjs/config`
- **Frontend (ui)**: React 19 + TypeScript, Vite 7, Tailwind CSS 4 + shadcn/ui, Apollo Client (GraphQL + WebSocket), React Router v7, Babel React Compiler
- **로깅**: Winston + winston-daily-rotate-file (공통)
- **빌드**: SWC (`@swc/core`) + TSC 타입 체크 (Nx targets), Vite (UI), Go build
- **테스트**: Jest v30 + @swc/jest + supertest, Playwright (UI E2E)

## 디렉토리 구조

```
(project root)/
├── nx.json                              # Nx 설정
├── package.json                         # 루트: 모든 의존성 (single version policy)
├── pnpm-lock.yaml
├── tsconfig.base.json                   # 공유 TS 설정 + path aliases (@monorepo/shared)
├── tsconfig.json                        # 루트 TS 설정 (references)
├── nest-cli.json                        # NestJS CLI monorepo 설정
├── eslint.config.mjs
├── .prettierrc
├── .mise.toml                           # mise 런타임 버전 설정 (Node.js, Go)
├── keys/                                # RS256 키 페어 (gitignored)
├── docker-compose.yml                   # Swarm Stack 배포용
├── docker-compose.local.yml             # 로컬 테스트용 (redis, log-streamer)
├── docker-stack.test.yml                # Swarm 통합 테스트 Stack (6 서비스)
├── scripts/                             # 유틸리티 및 테스트 스크립트
│   ├── daily-error-report.mjs           # 일일 ERROR 로그 리포트 (Slack 알림)
│   ├── crontab-error-report             # error-reporter crontab 설정
│   ├── swarm-test-up.sh                 # Swarm 통합 테스트 환경 구성 (빌드+배포)
│   ├── swarm-test-down.sh               # Swarm 통합 테스트 환경 정리
│   ├── docker/
│   │   └── init-auth-db.sql             # MySQL 초기화 SQL (Swarm 테스트용)
│   ├── load-test.sh                     # GraphQL 부하 테스트
│   ├── test-websocket.js                # Log-Streamer WebSocket 테스트
│   └── test-subscription.js             # GraphQL Subscription 테스트
│
├── apps/
│   ├── gateway/                         # GraphQL 게이트웨이 (port 4000)
│   │   ├── src/
│   │   │   ├── auth/                    # API Key guard, throttler guard, @Public
│   │   │   ├── auth-proxy/             # auth 서버 프록시 모듈 (GraphQL mutations)
│   │   │   │   ├── auth-proxy.module.ts
│   │   │   │   ├── auth-proxy.resolver.ts  # login, verifyTwoFactor, refreshToken, logout
│   │   │   │   ├── auth-proxy.service.ts   # Axios + CircuitBreaker → auth 서버 호출
│   │   │   │   ├── dto/                    # LoginInput, TotpVerifyInput, RefreshTokenInput
│   │   │   │   └── models/                 # AuthToken, LoginResult
│   │   │   ├── circuit-breaker/
│   │   │   ├── common/filter/           # GqlExceptionFilter (GraphQL 전용)
│   │   │   ├── pubsub/                  # Redis PubSub 모듈
│   │   │   ├── log-streamer-proxy/      # Log Streamer 프록시 (GraphQL Subscription)
│   │   │   ├── log-history/             # 로그 파일 검색 모듈 (DNS 디스커버리 + 멀티 노드)
│   │   │   ├── dataloader/
│   │   │   ├── dto/
│   │   │   ├── models/
│   │   │   ├── app.module.ts
│   │   │   ├── app.resolver.ts
│   │   │   ├── app.service.ts
│   │   │   ├── main.ts
│   │   │   └── schema.gql               # 자동 생성 (직접 수정 금지)
│   │   ├── test/
│   │   ├── project.json
│   │   ├── tsconfig.app.json
│   │   └── .swcrc
│   │
│   ├── log-streamer/                    # Go 로그 스트리밍 서비스 (port 4003)
│   │   ├── cmd/server/main.go           # 엔트리포인트
│   │   ├── internal/
│   │   │   ├── config/config.go         # 환경변수 로드
│   │   │   ├── docker/client.go         # Docker SDK 클라이언트
│   │   │   ├── handler/
│   │   │   │   ├── health.go            # GET /health
│   │   │   │   ├── containers.go        # GET /api/containers
│   │   │   │   └── logs.go              # WS /ws/logs
│   │   │   ├── middleware/              # CORS, Logging, Correlation
│   │   │   └── server/server.go
│   │   ├── go.mod
│   │   ├── go.sum
│   │   ├── project.json                 # Nx 프로젝트 설정
│   │   └── Dockerfile
│   │
│   ├── ui/                              # React SPA 대시보드 (port 5173 dev)
│   │   ├── src/
│   │   │   ├── main.tsx                 # React 엔트리포인트
│   │   │   ├── App.tsx                  # 라우터 (/, /login, /history)
│   │   │   ├── auth/                    # 인증 모듈
│   │   │   │   ├── AuthContext.tsx       # 인증 상태 관리 (React Context)
│   │   │   │   ├── AuthGuard.tsx        # 보호 라우트 래퍼
│   │   │   │   ├── token.ts             # JWT 토큰 관리 (localStorage)
│   │   │   │   └── graphql.ts           # 인증 mutations 정의
│   │   │   ├── lib/
│   │   │   │   ├── apollo.ts            # Apollo Client (HTTP + WebSocket)
│   │   │   │   └── utils.ts
│   │   │   ├── components/
│   │   │   │   ├── Navigation.tsx       # 헤더 내비게이션 + 로그아웃
│   │   │   │   ├── OtpInput.tsx         # 6자리 OTP 입력
│   │   │   │   ├── AnsiText.tsx         # ANSI → HTML 렌더러
│   │   │   │   └── ui/                  # shadcn/ui 컴포넌트
│   │   │   └── pages/
│   │   │       ├── LoginPage.tsx        # 로그인 + 2FA 폼
│   │   │       ├── live-stream/         # 실시간 로그 스트리밍
│   │   │       │   ├── LiveStreamPage.tsx
│   │   │       │   ├── ContainerList.tsx
│   │   │       │   ├── LogViewer.tsx
│   │   │       │   ├── ServiceLogViewer.tsx
│   │   │       │   └── graphql.ts
│   │   │       └── history/             # 로그 검색
│   │   │           ├── HistoryPage.tsx
│   │   │           └── graphql.ts
│   │   ├── e2e/                         # Playwright E2E 테스트
│   │   ├── vite.config.ts
│   │   ├── playwright.config.ts
│   │   ├── components.json             # shadcn/ui 설정
│   │   ├── project.json
│   │   └── tsconfig.json
│   │
│   └── auth/                            # 인증 서버 (port 4001)
│       ├── src/
│       │   ├── auth/
│       │   │   ├── auth.module.ts
│       │   │   ├── auth.controller.ts   # REST: login, 2fa/verify, refresh, password
│       │   │   ├── auth.service.ts      # 상태 검증, fail_count, 패스워드 만료
│       │   │   ├── auth-mock.service.ts # Mock 인증 서비스 (개발 환경)
│       │   │   ├── jwt.service.ts       # RS256 서명/검증 (jose)
│       │   │   ├── totp.service.ts      # TOTP (otplib)
│       │   │   ├── zod-validation.pipe.ts
│       │   │   ├── strategies/jwt.strategy.ts
│       │   │   ├── guards/jwt-auth.guard.ts
│       │   │   ├── dto/auth.dto.ts      # zod 스키마 기반 DTO
│       │   │   ├── enums/               # AccountStatus, UserType
│       │   │   ├── constants/           # AUTH_ERROR (에러 코드 매핑)
│       │   │   └── filters/             # AuthErrorFilter (구조화된 에러 응답)
│       │   ├── database/
│       │   │   ├── database.module.ts   # Drizzle MySQL 연결
│       │   │   └── schema.ts            # tb_account, tb_user_group 테이블
│       │   ├── account/
│       │   │   ├── account.module.ts
│       │   │   └── account.service.ts   # 계정 조회/수정 (tb_account)
│       │   ├── app.module.ts
│       │   └── main.ts
│       ├── test/
│       ├── drizzle.config.ts
│       ├── project.json
│       ├── tsconfig.app.json
│       └── .swcrc
│
└── libs/
    └── shared/                          # @monorepo/shared
        ├── src/
        │   ├── index.ts                 # barrel export
        │   ├── common/
        │   │   ├── context/
        │   │   │   └── request-context.ts       # AsyncLocalStorage
        │   │   ├── filter/
        │   │   │   └── http-status-mapping.ts   # HTTP 상태 → 에러 코드 매핑
        │   │   ├── interceptor/
        │   │   │   └── logging.interceptor.ts   # HTTP 요청/응답 로깅
        │   │   ├── logger/
        │   │   │   ├── logger.module.ts          # Winston 로거 모듈
        │   │   │   └── winston-logger.service.ts # 로거 서비스
        │   │   └── middleware/
        │   │       ├── correlation-id.middleware.ts
        │   │       ├── request-context.middleware.ts
        │   │       └── logger.middleware.ts
        │   ├── types/
        │   │   ├── jwt-payload.interface.ts
        │   │   ├── auth-tokens.interface.ts
        │   │   └── auth-response.interface.ts
        │   └── constants/
        │       └── auth.constants.ts
        ├── project.json
        └── tsconfig.lib.json
```

## 주요 명령어

```bash
# 빌드
pnpm run build                    # 전체 빌드 (nx run-many -t build)
pnpm run build:gateway            # 게이트웨이만 빌드 (UI도 함께 빌드됨 - Nx 의존성)
pnpm run build:auth               # auth 서버만 빌드
pnpm run build:log-streamer       # log-streamer 빌드 (Go)

# 개발
pnpm run start:gateway:dev        # 게이트웨이 개발 모드 (watch)
pnpm run start:auth:dev           # auth 서버 개발 모드 (watch)
pnpm run start:log-streamer:dev   # log-streamer 개발 모드 (go run)
nx serve ui                       # UI 개발 서버 (Vite, port 5173)

# 프로덕션
pnpm run start:gateway:prod       # node dist/apps/gateway/main (UI 정적 서빙 포함)
pnpm run start:auth:prod          # node dist/apps/auth/main
pnpm run start:log-streamer:prod  # ./dist/apps/log-streamer/log-streamer

# 테스트
pnpm run test                     # 전체 테스트
pnpm run test:e2e:gateway         # 게이트웨이 E2E
pnpm run test:e2e:auth            # auth E2E
nx e2e ui                         # UI Playwright E2E

# DB (auth)
pnpm run db:generate              # Drizzle 마이그레이션 생성
pnpm run db:migrate               # 마이그레이션 실행
pnpm run db:push                  # 스키마 직접 push

# 코드 품질
pnpm run lint                     # ESLint
pnpm run format                   # Prettier
```

## 아키텍처 핵심 사항

### Nx Monorepo
- Nx integrated monorepo. `nx.json`에서 빌드 캐싱 및 의존성 그래프 관리
- `tsconfig.base.json`의 paths alias로 `@monorepo/shared` import 경로 제공
- 각 프로젝트의 `project.json`에 빌드 타겟 정의 (tsc 타입체크 → swc 트랜스파일)
- 빌드 출력: `dist/apps/gateway/`, `dist/apps/auth/`, `dist/apps/log-streamer/`, `dist/apps/ui/`, `dist/libs/shared/`
- nest-cli.json은 monorepo 모드로 설정 (`nest start gateway --watch` 등 지원)

### 게이트웨이 패턴
- 게이트웨이는 독립적인 데이터 저장소가 없음. 데이터베이스를 직접 연결하지 않는다.
- 외부 REST API(예: JSONPlaceholder)를 호출하여 데이터를 가져오고, GraphQL 스키마로 변환하여 클라이언트에 제공한다.
- auth 서버의 REST API도 `AuthProxyModule`을 통해 GraphQL mutation으로 변환하여 제공한다.
- Log Streamer의 REST API를 `LogHistoryModule`을 통해 GraphQL query로 프록시한다.

### Gateway 정적 파일 서빙 (SPA)
- `@fastify/static` 플러그인으로 `dist/apps/ui/` 디렉토리의 빌드된 UI 정적 파일을 서빙한다.
- `wildcard: false` 설정으로 개별 파일 라우트만 등록하고, 별도 `GET /*` 와일드카드 라우트로 SPA fallback 처리한다.
- **주의**: `wildcard: true` 사용 시 파일 미존재 → `reply.callNotFound()` → NestJS의 `GqlExceptionFilter`가 HTTP 응답을 보내지 않아 커넥션이 hang되는 문제가 있음.

### GraphQL 설정 (gateway)
- **Code-First 방식**: TypeScript 클래스와 데코레이터로 스키마를 정의하면 `apps/gateway/src/schema.gql`이 자동 생성됨
- **Playground**: 비활성화
- **Introspection**: 개발 환경에서만 활성화
- **Query Depth Limiting**: `graphql-depth-limit`으로 최대 깊이 5로 제한
- **Stacktrace**: `NODE_ENV !== 'production'`일 때만 포함
- **Subscriptions**: `graphql-ws` 프로토콜 사용 (`subscriptions-transport-ws` 비활성화)
- GraphQL context에 request 객체와 DataLoader 인스턴스가 포함됨

### Log Streamer (Go)
- Docker SDK (v23)를 사용하여 컨테이너 목록 조회 및 로그 스트리밍
- WebSocket으로 실시간 로그 전송 (subscribe/unsubscribe 메시지 기반)
- Gateway가 WebSocket 클라이언트로 연결하여 로그를 Redis PubSub으로 재배포
- GraphQL Subscription `containerLog(containerId: String!)`로 클라이언트에 노출
- 미들웨어 체인: CORS → Correlation → Logging
- Logging 미들웨어는 `http.Hijacker` 인터페이스를 구현하여 WebSocket 업그레이드 지원

**API 엔드포인트**:
| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 헬스체크 (Docker 연결 상태 포함) |
| GET | `/api/containers` | 컨테이너 목록 (REST) |
| GET | `/api/logs/apps` | 로그 파일 앱 목록 |
| GET | `/api/logs/search` | 로그 검색 (필터: app, date, level, keyword) |
| GET | `/api/logs/stats` | 로그 통계 (총 라인, 에러/경고/정보 수) |
| WS | `/ws/logs` | WebSocket 로그 스트림 |

**WebSocket 메시지 포맷**:
```json
// 구독 요청
{ "type": "subscribe", "containerId": "abc123" }
// 구독 해제
{ "type": "unsubscribe", "containerId": "abc123" }
// 로그 메시지 (서버 → 클라이언트)
{ "type": "log", "containerId": "abc123", "timestamp": "...", "message": "...", "stream": "stdout" }
```

### 인증 아키텍처
- **API Key** (gateway): 클라이언트 애플리케이션 식별. `X-API-Key` 헤더. `@Public()`으로 우회 가능.
- **JWT** (auth): 사용자 식별. RS256 비대칭 키 (private: auth만 보유, public: gateway/백엔드에 배포).
- API Key와 JWT는 목적이 다르므로 병행 사용.
- login, verifyTwoFactor, refreshToken은 `@Public()`으로 API Key 없이 접근 가능.
- **운영 DB 직접 연결**: tb_account, tb_user_group 테이블 (Spring 서비스와 동시 운영)
- **Spring bcrypt 호환**: `{bcrypt}` prefix 제거 후 비교, 저장 시 prefix 추가 (bcryptjs 3.0.3)
- **user_type 기반 2FA 정책**: ADMIN_BO, CUSTOMER_BO, PARTNER_BO → 2FA 필요 / DASHBOARD → 즉시 발급
- **계정 상태 검증**: ACTIVE/LOCKED/PENDING/IN_ACTIVE/DELETE (상태별 에러 코드)
- **로그인 실패 관리**: fail_count 5회 이상 → LOCKED
- **패스워드 만료**: last_password_changed_at 90일 경과 시 에러 (code: 11004)
- **Stateless Refresh Token**: DB 저장 없음, 클라이언트 측 토큰 폐기

### Auth 서버 REST API

| Method | Path | Header | Body | 인증 |
|--------|------|--------|------|------|
| POST | `/auth/login` | `X-User-Type` | `{ loginId, password }` | 불필요 |
| POST | `/auth/2fa/verify` | `X-2FA-Token` | `{ totpCode }` | 불필요 |
| POST | `/auth/refresh` | - | `{ refreshToken }` | 불필요 |
| POST | `/auth/password` | `Authorization: Bearer` | `{ currentPassword, newPassword }` | JWT |

### JWT (RS256)
- Access token: 15분 만료
- Refresh token: 7일 만료 (Stateless, DB 저장 없음)
- 2FA 임시 토큰: 5분 만료
- JwtPayload: `{ sub, loginId, name, userType, roleType, customerNo, iat, exp, jti }`
- 키 파일: `keys/private.pem`, `keys/public.pem` (gitignored)

### Gateway Auth Proxy
- `AuthProxyModule`이 auth 서버의 REST API를 GraphQL mutation으로 프록시
- `CircuitBreakerService.fire('auth-server', ...)`로 CircuitBreaker 적용
- GraphQL mutations: `login`, `verifyTwoFactor`, `refreshToken`, `changePassword`
- 헤더 전파: `X-User-Type` (login), `X-2FA-Token` (verify)

### Log History (Gateway)
- `LogHistoryModule`이 Log Streamer의 로그 파일 검색 REST API를 GraphQL query로 프록시
- **DNS 디스커버리**: `dns.resolve4('tasks.log-streamer')`로 Docker Swarm 멀티 노드 Log Streamer 인스턴스 검색
- **멀티 노드 집계**: 발견된 모든 Log Streamer 인스턴스에 병렬 요청 후 결과 병합
- CircuitBreaker 적용 (도메인: `log-history`)
- GraphQL queries: `logApps`, `logSearch(input: LogSearchInput)`

### UI (React SPA)
- **라우팅**: `/login` (로그인 + 2FA), `/` (실시간 로그), `/history` (로그 검색)
- **인증**: `AuthContext`로 JWT 상태 관리, `AuthGuard`로 보호 라우트, localStorage에 토큰 저장
- **토큰 자동 갱신**: 만료 10분 전 자동 refresh, rotation 적용
- **Apollo Client**: HTTP link (`/graphql`) + WebSocket link (`ws://host/graphql`)로 queries/mutations/subscriptions 지원
- **API Key**: 모든 요청에 `X-API-Key: test-api-key` 헤더 자동 포함
- **UI 프레임워크**: shadcn/ui (Radix UI 기반) + Tailwind CSS, Lucide 아이콘
- **빌드**: Vite → `dist/apps/ui/` (Gateway가 프로덕션에서 서빙)

### DataLoader
- Context 기반 팩토리 패턴: 매 요청마다 새 인스턴스 생성
- 새 DataLoader 추가 시: `IDataLoaders` 인터페이스에 타입 추가 → `DataLoaderService.createLoaders()`에 인스턴스 생성 → 리졸버에서 `@Context('loaders')` 사용

### 에러 처리
- **Gateway**: `HttpExceptionFilter`, `AxiosExceptionFilter`가 NestJS/Axios 에러를 `GraphQLError`로 변환
- **Auth**: NestJS 기본 exception filter 사용 (REST JSON 응답)
- HTTP 상태 → 에러 코드 매핑은 `@monorepo/shared`의 `HTTP_STATUS_TO_ERROR_CODE`를 공유

### Circuit Breaker
- `opossum` 기반 도메인별 Circuit Breaker. `@Global()` 모듈.
- 기본 옵션: timeout=false, errorThresholdPercentage=50, resetTimeout=30s, volumeThreshold=5

### 요청 컨텍스트 및 헤더 전파
- `AsyncLocalStorage` 기반으로 요청별 컨텍스트를 저장 (공통 모듈, `@monorepo/shared`)
- 미들웨어 실행 순서: `CorrelationIdMiddleware` → `RequestContextMiddleware` → `LoggerMiddleware`
- Gateway의 `AppModule.onModuleInit()`에서 Axios interceptor로 `Authorization`, `x-correlation-id` 헤더 자동 전파

### Shared Library (`@monorepo/shared`)
공통 인프라 코드 + 타입/상수:
- 미들웨어: correlation-id, request-context, logger
- 인터셉터: LoggingInterceptor (HTTP 요청/응답 로깅)
- 로거: WinstonLoggerModule, WinstonLoggerService
- 필터: HTTP status → error code 매핑
- 타입: JwtPayload, AuthTokens, AuthResponse
- 상수: AUTH_CONSTANTS (토큰 만료시간, 알고리즘 등)

Import 방식:
```typescript
import { JwtPayload, AUTH_CONSTANTS, WinstonLoggerModule, WinstonLoggerService } from '@monorepo/shared';
import { LoggerMiddleware } from '@monorepo/shared/common/middleware/logger.middleware';
import { LoggingInterceptor } from '@monorepo/shared/common/interceptor/logging.interceptor';
import { requestContext } from '@monorepo/shared/common/context/request-context';
```

## 환경 설정

**공통** (NestJS 앱):
- `SERVICE_NAME` (`app`): ECS 로그의 `service.name` 필드 (예: `gateway`, `auth`)

**Gateway** (기본값):
- `PORT` (4000), `API_KEYS` (쉼표 구분)
- `AUTH_SERVICE_HOST` (`localhost`), `AUTH_TCP_PORT` (`4002`) — TCP 마이크로서비스 연결
- `LOG_STREAMER_URL` (`http://localhost:4003`), `LOG_STREAMER_WS_URL` (`ws://localhost:4003/ws/logs`)
- `REDIS_HOST` (`localhost`), `REDIS_PORT` (`6379`)

**Auth**:
- `AUTH_PORT` (4001)
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `JWT_PRIVATE_KEY_PATH` (`keys/private.pem`), `JWT_PUBLIC_KEY_PATH` (`keys/public.pem`)
- `NODE_ENV`

**Log Streamer** (Go):
- `LOG_STREAMER_PORT` (4003)
- `LOG_LEVEL` (`info`)
- `LOG_DIR` (`/opt/logs`) — 로그 파일 저장/검색 디렉토리

**Error Reporter**:
- `SLACK_WEBHOOK_URL` (필수): Slack Incoming Webhook URL
- `LOG_STREAMER_HOST` (`tasks.log-streamer`): DNS 디스커버리 호스트
- `LOG_STREAMER_PORT` (`4003`): log-streamer 포트
- `TZ` (`Asia/Seoul`): 타임존
- `REPORT_NO_ERRORS` (`false`): ERROR 0건일 때도 알림 전송 여부

## 빌드 시스템

- **NestJS 앱** (gateway, auth): `project.json` 빌드 타겟 — TSC `--noEmit` 타입 체크 → SWC 트랜스파일
- SWC 설정은 각 앱의 `.swcrc`에 정의 (데코레이터, 데코레이터 메타데이터 지원)
- **UI**: Vite 빌드 → `dist/apps/ui/` (Gateway 빌드 시 Nx 의존성으로 자동 빌드)
- **shared 라이브러리**: TSC로 빌드 (composite + declaration)
- Jest는 `@swc/jest`로 트랜스파일

## 코드 컨벤션

- ESLint: flat config 형식 (`eslint.config.mjs`), `@typescript-eslint/no-explicit-any` 비활성화
- Prettier: 싱글 쿼트, trailing comma all
- 테스트 파일: `*.spec.ts` (단위), `*.e2e-spec.ts` (E2E)
- GraphQL 스키마 파일(`schema.gql`)은 빌드 시 자동 생성되므로 직접 수정하지 않는다
- Auth DTO 검증: zod 스키마 + ZodValidationPipe
- Gateway 입력 검증: GraphQL 스키마 타입 시스템에 위임

## 개발 환경 설정

### mise (런타임 버전 관리)

[mise](https://mise.jdx.dev/)를 사용하여 Node.js와 Go 버전을 관리한다. 프로젝트 루트의 `.mise.toml`에 정의된 버전이 자동으로 적용된다.

```bash
# mise 설치 (macOS)
brew install mise

# 또는 curl 설치
curl https://mise.run | sh

# 셸 설정 (bash/zsh)
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc  # zsh
echo 'eval "$(mise activate bash)"' >> ~/.bashrc  # bash

# 프로젝트 런타임 설치
cd /path/to/project
mise install

# 현재 버전 확인
mise current
```

**프로젝트 런타임 버전** (`.mise.toml`):
| 런타임 | 버전 |
|--------|------|
| Node.js | 24 |
| Go | 1.18 |

**로컬 오버라이드**: `.mise.local.toml`을 생성하여 개인 설정을 추가할 수 있다 (gitignored).

## 인프라 및 배포

### Docker 설정

**Dockerfile (NestJS)** (`apps/gateway/Dockerfile`, `apps/auth/Dockerfile`):
- Multi-stage 빌드: `deps` → `build` → `production` 3단계
- Alpine 기반 Node.js 이미지 사용
- pnpm을 통한 의존성 설치 (production only)
- 보안: non-root 사용자(`node`)로 실행
- `logs/` 디렉토리 생성 및 권한 설정 포함

**Dockerfile (Go)** (`apps/log-streamer/Dockerfile`):
- Multi-stage 빌드: `builder` (golang:1.19-alpine) → `production` (alpine:3.19)
- CGO 비활성화, 정적 링크 바이너리 생성
- `ldflags='-s -w'`로 바이너리 크기 최적화
- 보안: non-root 사용자(`appuser`)로 실행 (단, Docker 소켓 접근 시 root 필요)

**docker-compose.yml** (Swarm Stack 배포용):
```yaml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  log-streamer:
    image: ${DOCKER_REPO_LOG_STREAMER}:${TAG}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://localhost:4003/health"]

  gateway:
    image: ${DOCKER_REPO_GATEWAY}:${TAG}
    ports: ["4000:4000"]
    environment:
      - LOG_STREAMER_URL=http://log-streamer:4003
      - LOG_STREAMER_WS_URL=ws://log-streamer:4003/ws/logs
      - REDIS_HOST=redis
    depends_on: [redis, log-streamer]
    healthcheck:
      test: ["CMD-SHELL", "wget -q --header='Content-Type: application/json' --post-data='{\"query\":\"{ health }\"}' -O - http://localhost:4000/graphql | grep -q '\"health\"'"]

  auth:
    image: ${DOCKER_REPO_AUTH}:${TAG}
    secrets:
      - jwt_public_key
      - jwt_private_key
    environment:
      - JWT_PUBLIC_KEY_PATH=/run/secrets/jwt_public_key
      - JWT_PRIVATE_KEY_PATH=/run/secrets/jwt_private_key

networks:
  app-network:
    driver: overlay
    attachable: true

volumes:
  redis-data:

secrets:
  jwt_public_key:
    external: true
  jwt_private_key:
    external: true
```

### Docker Swarm Secrets

JWT 키는 이미지에 포함하지 않고 **Docker Swarm Secrets**로 주입:
- `jwt_public_key`: RS256 공개키
- `jwt_private_key`: RS256 비밀키
- 컨테이너 내 경로: `/run/secrets/<secret_name>`
- 환경변수 `JWT_PUBLIC_KEY_PATH`, `JWT_PRIVATE_KEY_PATH`로 경로 지정

**Secret 생성 (CLI)**:
```bash
docker secret create jwt_public_key keys/public.pem
docker secret create jwt_private_key keys/private.pem
```

### CI/CD (Drone)

**`.drone.yml`**: Gateway/Auth 분리 파이프라인
```yaml
kind: pipeline
type: docker
name: gateway  # 또는 auth

trigger:
  branch: [main, develop]
  event: [push, tag]

steps:
  - name: build-and-push
    image: plugins/docker
    settings:
      repo: { from_secret: docker_repo_gateway }
      dockerfile: apps/gateway/Dockerfile
      tags: ["${DRONE_TAG}", "latest"]
      username: { from_secret: docker_username }
      password: { from_secret: docker_password }
```

**로컬 파이프라인 테스트**:
```bash
# secrets.txt 필요 (docker_username, docker_password, docker_repo_*)
DRONE_TAG=local drone exec --trusted --pipeline=gateway --secret-file=secrets.txt
```

### 로컬 CI/CD 환경 (선택사항)

`docker/local-cicd/docker-compose.yml`:
- **Portainer** (`:9000`): Docker 관리 UI
- **Drone Server** (`:8080`): CI 서버 (GitHub OAuth)
- **Drone Runner**: 파이프라인 실행기

```bash
# 시작
docker-compose -f docker/local-cicd/docker-compose.yml up -d

# 종료 및 정리
docker-compose -f docker/local-cicd/docker-compose.yml down
docker swarm leave --force  # Swarm 모드 해제
```

### 배포 방식

| 방식 | 명령어/도구 | 특징 |
|------|-------------|------|
| CLI (Swarm) | `docker stack deploy -c docker-compose.yml <stack>` | 무중단 배포, Rolling Update |
| Portainer UI | Stacks > Add stack | 웹 에디터, 환경변수 관리 |

**주의**: CLI로 배포한 스택은 Portainer에서 "Limited" 상태로 표시되며 에디터 사용 불가. Portainer에서 완전 관리하려면 UI에서 직접 배포해야 함.

### 환경변수 (배포용)

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `DOCKER_REPO_GATEWAY` | Gateway 이미지 저장소 | - |
| `DOCKER_REPO_AUTH` | Auth 이미지 저장소 | - |
| `DOCKER_REPO_LOG_STREAMER` | Log Streamer 이미지 저장소 | - |
| `TAG` | 이미지 태그 | `latest` |
| `DB_HOST` | MySQL 호스트 | `localhost` |
| `DB_PORT` | MySQL 포트 | `3306` |
| `JWT_PUBLIC_KEY_PATH` | 공개키 경로 | `keys/public.pem` |
| `JWT_PRIVATE_KEY_PATH` | 비밀키 경로 | `keys/private.pem` |

Swarm 환경에서 호스트 DB 접속 시: `DB_HOST=host.docker.internal`

## 로컬 테스트 환경

`docker-compose.local.yml`을 사용하여 Gateway 통합 테스트를 수행할 수 있다.

```bash
# 1. Redis + Log-Streamer 컨테이너 시작
docker-compose -f docker-compose.local.yml up -d

# 2. Gateway 로컬 실행
LOG_STREAMER_URL=http://localhost:4003 \
LOG_STREAMER_WS_URL=ws://localhost:4003/ws/logs \
REDIS_HOST=localhost REDIS_PORT=6379 API_KEYS=test-api-key \
node dist/apps/gateway/main.js

# 3. 테스트 실행
bash scripts/load-test.sh                    # GraphQL 부하 테스트
node scripts/test-websocket.js test-redis    # WebSocket 직접 테스트
node scripts/test-subscription.js test-redis # GraphQL Subscription 테스트

# 4. 정리
docker-compose -f docker-compose.local.yml down
```

**테스트 스크립트**:
| 파일 | 설명 |
|------|------|
| `scripts/load-test.sh` | 20회 반복 GraphQL 쿼리 부하 테스트 |
| `scripts/test-websocket.js` | Log-Streamer WebSocket 직접 연결 테스트 |
| `scripts/test-subscription.js` | Gateway GraphQL Subscription 테스트 |

**참고**: Log-Streamer 컨테이너는 Docker 소켓 접근을 위해 `user: root`로 실행된다.

## Docker Swarm 통합 테스트 환경

전체 시스템을 Docker Swarm에서 이중화하여 통합 테스트하는 환경. `~/workspace/relay` 앱도 포함.

### 아키텍처

단일 Stack (`test-app`)으로 6개 서비스를 overlay network에 배치:

| 서비스 | 이미지 | 레플리카 | 포트 | 역할 |
|--------|--------|----------|------|------|
| redis | redis:7-alpine | 1 | 내부 | PubSub, 캐시 |
| mysql | mysql:8 | 1 | 내부 | auth DB |
| gateway | gateway:test | 2 | 4000 (ingress) | GraphQL API + SPA |
| auth | auth:test | 2 | 내부 | JWT 인증 (HTTP 4001 + TCP 4002) |
| log-streamer | log-streamer:test | 2 | 내부 | Docker 로그 스트리밍 |
| relay | relay:test | 2 | 8080 (ingress) | API 테스트 도구 (Go + SQLite) |

### 사용법

```bash
# 전체 환경 구성 (빌드 + Swarm init + 배포)
bash scripts/swarm-test-up.sh

# 상태 확인
docker stack services test-app
docker stack ps test-app

# 서비스 로그 확인
docker service logs -f test-app_gateway
docker service logs -f test-app_auth
docker service logs -f test-app_log-streamer
docker service logs -f test-app_relay

# 테스트 실행
bash scripts/load-test.sh
node scripts/test-subscription.js test-redis

# 전체 환경 종료 + 정리
bash scripts/swarm-test-down.sh
```

### 접속 URL

- Gateway: `http://localhost:4000` (GraphQL: `http://localhost:4000/graphql`)
- Relay: `http://localhost:8080`

### 관련 파일

| 파일 | 설명 |
|------|------|
| `docker-stack.test.yml` | Swarm stack compose 파일 (6 서비스, secrets, configs) |
| `scripts/swarm-test-up.sh` | 빌드 + Swarm init + stack deploy 자동화 |
| `scripts/swarm-test-down.sh` | Stack 제거 + 볼륨 정리 + Swarm leave(선택) |
| `scripts/docker/init-auth-db.sql` | MySQL 초기화 SQL (users, refresh_tokens 테이블) |

### 주요 환경변수

- Gateway: `AUTH_SERVICE_HOST=auth`, `AUTH_TCP_PORT=4002`, `LOG_STREAMER_URL=http://log-streamer:4003`, `REDIS_HOST=redis`, `API_KEYS=test-api-key`
- Auth: `DB_HOST=mysql`, `DB_USERNAME=authuser`, `DB_PASSWORD=authpassword`, `JWT_*_KEY_PATH=/run/secrets/jwt_*_key`
- MySQL: `MYSQL_ROOT_PASSWORD=rootpassword`, `MYSQL_DATABASE=auth`, `MYSQL_USER=authuser`

### Docker Desktop 환경 주의사항

- **Named volumes 사용**: Docker Desktop VM에서는 호스트 bind mount 경로가 존재하지 않으므로, `gateway-logs`, `log-data` 등 named volume 사용
- **Healthcheck에 `127.0.0.1` 사용**: Alpine 이미지에서 `localhost`가 IPv6로 해석되어 연결 거부됨 → `127.0.0.1` 명시 필요
- **Log-Streamer `user: root`**: Docker 소켓 접근 권한 필요
- **Gateway `restart_policy.condition: any`**: 정상 종료(exit 0)에도 재시작 필요 (log-streamer 연결 실패 시 프로세스가 정상 종료됨)
- **Auth 재시작 여유**: MySQL 시작 대기를 위해 `max_attempts: 10`, `delay: 10s`, `window: 120s`
- **Relay Go 버전 패치**: `go.mod`는 Go 1.25 요구, Dockerfile은 1.23 → `swarm-test-up.sh`에서 `sed`로 자동 패치
