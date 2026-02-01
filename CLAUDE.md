# CLAUDE.md

이 파일은 Claude Code가 프로젝트를 이해하는 데 사용하는 컨텍스트 문서입니다.

## 프로젝트 개요

Nx monorepo 기반의 NestJS 멀티 서버 프로젝트. 두 개의 애플리케이션으로 구성된다:
- **Gateway** (port 4000): GraphQL API 게이트웨이. 외부 REST API를 GraphQL 인터페이스로 통합하여 단일 엔드포인트로 제공한다.
- **Auth** (port 4001): REST 기반 인증 서버. JWT(RS256) 토큰 발급, TOTP 2FA, refresh token rotation을 처리한다.

공통 코드는 `libs/shared`로 분리되어 양쪽 앱에서 `@monorepo/shared` 경로로 import한다.

## 기술 스택

- **Runtime**: Node.js + TypeScript (v5.7, target ES2023, strict mode)
- **Monorepo**: Nx (integrated monorepo)
- **Framework**: NestJS v11
- **HTTP Server**: Fastify (`@nestjs/platform-fastify`)
- **GraphQL** (gateway): Apollo Server v5 + `@nestjs/graphql` (Code-First 방식), DataLoader, graphql-depth-limit
- **HTTP Client**: Axios (`@nestjs/axios`), Circuit Breaker (`opossum`)
- **인증 (gateway)**: API Key 기반 (X-API-Key 헤더) — 클라이언트 애플리케이션 식별
- **인증 (auth)**: JWT RS256 (jose), TOTP 2FA (otplib), Passport, bcrypt — 사용자 식별
- **DB (auth)**: Drizzle ORM + MySQL2
- **유효성 검사 (gateway)**: GraphQL 스키마 레벨 타입 검증에 의존 (게이트웨이 서버 특성상 class-validator 미사용)
- **유효성 검사 (auth)**: zod 스키마 + ZodValidationPipe
- **환경변수 (auth)**: `@nestjs/config`
- **로깅**: Winston + winston-daily-rotate-file (공통)
- **빌드**: SWC (`@swc/core`) + TSC 타입 체크 (Nx targets)
- **테스트**: Jest v30 + @swc/jest + supertest

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
├── keys/                                # RS256 키 페어 (gitignored)
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
│   └── auth/                            # 인증 서버 (port 4001)
│       ├── src/
│       │   ├── auth/
│       │   │   ├── auth.module.ts
│       │   │   ├── auth.controller.ts   # REST: login, 2fa, refresh, logout
│       │   │   ├── auth.service.ts
│       │   │   ├── jwt.service.ts       # RS256 서명/검증 (jose)
│       │   │   ├── totp.service.ts      # TOTP (otplib)
│       │   │   ├── zod-validation.pipe.ts
│       │   │   ├── strategies/jwt.strategy.ts
│       │   │   ├── guards/jwt-auth.guard.ts
│       │   │   └── dto/auth.dto.ts      # zod 스키마 기반 DTO
│       │   ├── database/
│       │   │   ├── database.module.ts   # Drizzle MySQL 연결
│       │   │   └── schema.ts            # users, refresh_tokens 테이블
│       │   ├── user/
│       │   │   ├── user.module.ts
│       │   │   └── user.service.ts
│       │   ├── token/
│       │   │   ├── token.module.ts
│       │   │   └── token.service.ts     # refresh token CRUD (SHA256 해시 저장)
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
pnpm run build:gateway            # 게이트웨이만 빌드
pnpm run build:auth               # auth 서버만 빌드

# 개발
pnpm run start:gateway:dev        # 게이트웨이 개발 모드 (watch)
pnpm run start:auth:dev           # auth 서버 개발 모드 (watch)

# 프로덕션
pnpm run start:gateway:prod       # node dist/apps/gateway/main
pnpm run start:auth:prod          # node dist/apps/auth/main

# 테스트
pnpm run test                     # 전체 테스트
pnpm run test:e2e:gateway         # 게이트웨이 E2E
pnpm run test:e2e:auth            # auth E2E

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
- 빌드 출력: `dist/apps/gateway/`, `dist/apps/auth/`, `dist/libs/shared/`
- nest-cli.json은 monorepo 모드로 설정 (`nest start gateway --watch` 등 지원)

### 게이트웨이 패턴
- 게이트웨이는 독립적인 데이터 저장소가 없음. 데이터베이스를 직접 연결하지 않는다.
- 외부 REST API(예: JSONPlaceholder)를 호출하여 데이터를 가져오고, GraphQL 스키마로 변환하여 클라이언트에 제공한다.
- auth 서버의 REST API도 `AuthProxyModule`을 통해 GraphQL mutation으로 변환하여 제공한다.

### GraphQL 설정 (gateway)
- **Code-First 방식**: TypeScript 클래스와 데코레이터로 스키마를 정의하면 `apps/gateway/src/schema.gql`이 자동 생성됨
- **Playground**: 비활성화
- **Introspection**: 개발 환경에서만 활성화
- **Query Depth Limiting**: `graphql-depth-limit`으로 최대 깊이 5로 제한
- **Stacktrace**: `NODE_ENV !== 'production'`일 때만 포함
- GraphQL context에 request 객체와 DataLoader 인스턴스가 포함됨

### 인증 아키텍처
- **API Key** (gateway): 클라이언트 애플리케이션 식별. `X-API-Key` 헤더. `@Public()`으로 우회 가능.
- **JWT** (auth): 사용자 식별. RS256 비대칭 키 (private: auth만 보유, public: gateway/백엔드에 배포).
- API Key와 JWT는 목적이 다르므로 병행 사용.
- login, verifyTwoFactor, refreshToken은 `@Public()`으로 API Key 없이 접근 가능. logout은 API Key 필요.

### Auth 서버 REST API

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| POST | `/auth/login` | 로그인 → 2FA 필요 여부 판단 | 불필요 |
| POST | `/auth/2fa/verify` | TOTP 코드 검증 → JWT 발급 | 임시 2FA 토큰 |
| POST | `/auth/2fa/setup` | TOTP 비밀키 생성 | JWT |
| POST | `/auth/refresh` | access token 갱신 + rotation | refresh token |
| POST | `/auth/logout` | refresh token 폐기 | JWT |

### JWT (RS256)
- Access token: 15분 만료
- Refresh token: 7일 만료 (DB에 SHA256 해시 저장, rotation 적용)
- 2FA 임시 토큰: 5분 만료
- JwtPayload: `{ sub, username, roles, iat, exp, jti }`
- 키 파일: `keys/private.pem`, `keys/public.pem` (gitignored)

### Gateway Auth Proxy
- `AuthProxyModule`이 auth 서버의 REST API를 GraphQL mutation으로 프록시
- `CircuitBreakerService.fire('auth-server', ...)`로 CircuitBreaker 적용
- GraphQL mutations: `login`, `verifyTwoFactor`, `refreshToken`, `logout`

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
- 필터: HTTP status → error code 매핑
- 타입: JwtPayload, AuthTokens, AuthResponse
- 상수: AUTH_CONSTANTS (토큰 만료시간, 알고리즘 등)

Import 방식:
```typescript
import { JwtPayload, AUTH_CONSTANTS } from '@monorepo/shared';
import { LoggerMiddleware } from '@monorepo/shared/common/middleware/logger.middleware';
import { requestContext } from '@monorepo/shared/common/context/request-context';
```

## 환경 설정

**Gateway** (기본값):
- `PORT` (4000), `API_KEYS` (쉼표 구분), `AUTH_SERVER_URL` (`http://localhost:4001`)

**Auth**:
- `AUTH_PORT` (4001)
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `JWT_PRIVATE_KEY_PATH` (`keys/private.pem`), `JWT_PUBLIC_KEY_PATH` (`keys/public.pem`)
- `NODE_ENV`

## 빌드 시스템

- 각 프로젝트의 `project.json` 빌드 타겟: TSC `--noEmit` 타입 체크 → SWC 트랜스파일
- SWC 설정은 각 앱의 `.swcrc`에 정의 (데코레이터, 데코레이터 메타데이터 지원)
- shared 라이브러리는 TSC로 빌드 (composite + declaration)
- Jest는 `@swc/jest`로 트랜스파일

## 코드 컨벤션

- ESLint: flat config 형식 (`eslint.config.mjs`), `@typescript-eslint/no-explicit-any` 비활성화
- Prettier: 싱글 쿼트, trailing comma all
- 테스트 파일: `*.spec.ts` (단위), `*.e2e-spec.ts` (E2E)
- GraphQL 스키마 파일(`schema.gql`)은 빌드 시 자동 생성되므로 직접 수정하지 않는다
- Auth DTO 검증: zod 스키마 + ZodValidationPipe
- Gateway 입력 검증: GraphQL 스키마 타입 시스템에 위임

## 인프라 및 배포

### Docker 설정

**Dockerfile** (`apps/gateway/Dockerfile`, `apps/auth/Dockerfile`):
- Multi-stage 빌드: `deps` → `build` → `production` 3단계
- Alpine 기반 Node.js 이미지 사용
- pnpm을 통한 의존성 설치 (production only)
- 보안: non-root 사용자(`node`)로 실행
- `logs/` 디렉토리 생성 및 권한 설정 포함

**docker-compose.yml** (Swarm Stack 배포용):
```yaml
services:
  gateway:
    image: ${DOCKER_REPO_GATEWAY}:${TAG}
    ports: ["4000:4000"]
    healthcheck:
      test: ["CMD-SHELL", "wget -q --header='Content-Type: application/json' --post-data='{\"query\":\"{ health }\"}' -O - http://localhost:4000/graphql | grep -q '\"health\"'"]
    deploy:
      replicas: 1
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first

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
| `TAG` | 이미지 태그 | `latest` |
| `DB_HOST` | MySQL 호스트 | `localhost` |
| `DB_PORT` | MySQL 포트 | `3306` |
| `JWT_PUBLIC_KEY_PATH` | 공개키 경로 | `keys/public.pem` |
| `JWT_PRIVATE_KEY_PATH` | 비밀키 경로 | `keys/private.pem` |

Swarm 환경에서 호스트 DB 접속 시: `DB_HOST=host.docker.internal`
