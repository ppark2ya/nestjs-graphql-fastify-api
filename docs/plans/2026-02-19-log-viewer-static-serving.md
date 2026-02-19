# Log-Viewer 정적 서빙 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gateway(port 4000)에서 log-viewer SPA를 정적 서빙하여 같은 도메인에서 UI와 API가 통신하도록 한다.

**Architecture:** `@fastify/static` 플러그인으로 `dist/apps/log-viewer/` 빌드 산출물을 루트(`/`)에서 서빙한다. NestJS 라우트(`/graphql`)가 우선 처리되고, 매칭되지 않는 GET 요청은 SPA fallback으로 `index.html`을 반환한다. Apollo Client는 상대경로(`/graphql`)를 사용하고, 개발 환경에서는 Vite proxy로 Gateway에 전달한다.

**Tech Stack:** `@fastify/static`, Vite proxy, Nx dependsOn

**Design doc:** `docs/plans/2026-02-19-log-viewer-static-serving-design.md`

---

### Task 1: Apollo Client 상대경로 변경

**Files:**
- Modify: `apps/log-viewer/src/apollo.ts` (전체 파일)
- Modify: `apps/log-viewer/src/App.tsx:9-10`

**Step 1: `apollo.ts`를 상대경로 기반으로 변경**

`apps/log-viewer/src/apollo.ts`를 아래 내용으로 교체한다:

```typescript
import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const API_KEY = 'test-api-key';

const httpLink = new HttpLink({
  uri: '/graphql',
  headers: {
    'X-API-Key': API_KEY,
  },
});

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsLink = new GraphQLWsLink(
  createClient({
    url: `${wsProtocol}//${window.location.host}/graphql`,
  }),
);

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink,
);

export const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
```

변경 사항:
- `createApolloClient(gatewayUrl)` 함수 → 모듈 레벨 `client` 싱글톤으로 변경
- HTTP URI: `gatewayUrl` 파라미터 → `/graphql` 상대경로
- WS URL: `gatewayUrl.replace()` → `window.location` 기반 동적 생성

**Step 2: `App.tsx`에서 import 수정**

`apps/log-viewer/src/App.tsx`의 9~10행을 변경한다:

```typescript
// 변경 전
import { createApolloClient } from './apollo';
// ...
const DEFAULT_GATEWAY_URL = 'http://localhost:4000/graphql';
const client = createApolloClient(DEFAULT_GATEWAY_URL);

// 변경 후
import { client } from './apollo';
```

`DEFAULT_GATEWAY_URL` 상수와 `createApolloClient` 호출을 제거한다.

헤더의 Gateway URL 표시(`<span>`)도 제거한다:

```typescript
// 변경 전
<span className="text-xs text-gray-500">Gateway: {DEFAULT_GATEWAY_URL}</span>

// 변경 후 (제거)
```

**Step 3: Vite dev server로 동작 확인**

실행:
```bash
pnpm start:log-viewer:dev
```

브라우저에서 `http://localhost:5173`에 접속하면 `/graphql`로 요청이 나가는 것을 확인한다.
(이 시점에서는 proxy 미설정이므로 404가 정상)

**Step 4: 커밋**

```bash
git add apps/log-viewer/src/apollo.ts apps/log-viewer/src/App.tsx
git commit -m "refactor(log-viewer): Apollo Client를 상대경로 기반으로 변경"
```

---

### Task 2: Vite 프록시 설정

**Files:**
- Modify: `apps/log-viewer/vite.config.ts:14-16`

**Step 1: proxy 설정 추가**

`apps/log-viewer/vite.config.ts`의 `server` 블록을 변경한다:

```typescript
server: {
  port: 5173,
  proxy: {
    '/graphql': {
      target: 'http://localhost:4000',
      changeOrigin: true,
      ws: true,
    },
  },
},
```

**Step 2: 동작 확인**

Gateway가 실행 중인 상태에서 Vite dev server를 시작한다:

```bash
# 터미널 1: Gateway
pnpm start:gateway:dev

# 터미널 2: Log-viewer
pnpm start:log-viewer:dev
```

`http://localhost:5173`에서 `/graphql` 요청이 Gateway(4000)로 프록시되는지 확인한다.

**Step 3: 커밋**

```bash
git add apps/log-viewer/vite.config.ts
git commit -m "feat(log-viewer): Vite dev server에 Gateway proxy 설정 추가"
```

---

### Task 3: `@fastify/static` 설치 및 Gateway 정적 서빙 설정

**Files:**
- Modify: `package.json` (의존성 추가)
- Modify: `apps/gateway/src/main.ts` (전체 재작성)

**Step 1: `@fastify/static` 설치**

```bash
pnpm add @fastify/static
```

**Step 2: Gateway `main.ts`에 정적 서빙 추가**

`apps/gateway/src/main.ts`를 아래 내용으로 교체한다:

```typescript
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
  const staticRoot = join(process.cwd(), 'dist', 'apps', 'log-viewer');
  const fastifyInstance = app.getHttpAdapter().getInstance();

  await fastifyInstance.register(fastifyStatic, {
    root: staticRoot,
    decorateReply: false,
    wildcard: false,
  });

  // SPA fallback: NestJS/정적 파일에 매칭되지 않는 GET 요청 → index.html
  fastifyInstance.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/graphql')) {
      return reply.sendFile('index.html', staticRoot);
    }
    reply.status(404).send({ statusCode: 404, message: 'Not Found' });
  });

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📊 GraphQL endpoint: ${await app.getUrl()}/graphql`);
}
bootstrap();
```

변경 사항:
- `@fastify/static` 등록: `decorateReply: false` (NestJS 충돌 방지), `wildcard: false`
- `setNotFoundHandler`: GET 요청이면서 `/graphql`이 아닌 경우 `index.html` 반환
- POST `/graphql` 등 API 요청은 NestJS가 먼저 처리하므로 영향 없음

**Step 3: 로컬에서 동작 확인**

log-viewer를 빌드한 뒤 Gateway를 시작한다:

```bash
pnpm nx build log-viewer
pnpm build:gateway
node dist/apps/gateway/main.js
```

`http://localhost:4000/`에서 log-viewer UI가 로드되는지 확인한다.
`http://localhost:4000/graphql`에 GraphQL 요청이 정상 처리되는지 확인한다.

**Step 4: 커밋**

```bash
git add package.json pnpm-lock.yaml apps/gateway/src/main.ts
git commit -m "feat(gateway): @fastify/static으로 log-viewer SPA 정적 서빙"
```

---

### Task 4: Nx 빌드 의존성 설정

**Files:**
- Modify: `apps/gateway/project.json:7` (build 타겟에 dependsOn 추가)
- Modify: `apps/log-viewer/project.json:17-18` (build outDir 확인)

**Step 1: log-viewer build outDir 확인**

`apps/log-viewer/vite.config.ts`에 `build.outDir`을 명시한다:

```typescript
// vite.config.ts의 defineConfig에 추가
build: {
  outDir: '../../dist/apps/log-viewer',
  emptyDir: true,
},
```

이렇게 하면 `pnpm nx build log-viewer` 실행 시 `dist/apps/log-viewer/`에 산출물이 생성된다.

**Step 2: Gateway build에 dependsOn 추가**

`apps/gateway/project.json`의 build 타겟에 `dependsOn`을 추가한다:

```json
{
  "name": "gateway",
  "targets": {
    "build": {
      "dependsOn": [
        {
          "projects": ["log-viewer"],
          "target": "build"
        }
      ],
      "executor": "nx:run-commands",
      "options": {
        ...기존 옵션 유지
      }
    }
  }
}
```

**Step 3: 빌드 파이프라인 검증**

```bash
# 기존 빌드 산출물 정리
rm -rf dist/apps/log-viewer dist/apps/gateway

# Gateway 빌드 (log-viewer가 먼저 빌드되는지 확인)
pnpm build:gateway
```

확인:
- `dist/apps/log-viewer/index.html` 존재
- `dist/apps/log-viewer/assets/` 디렉토리 존재
- `dist/apps/gateway/main.js` 존재

**Step 4: 통합 동작 확인**

```bash
node dist/apps/gateway/main.js
```

`http://localhost:4000/`에서 log-viewer UI 로드 확인.

**Step 5: 커밋**

```bash
git add apps/gateway/project.json apps/log-viewer/vite.config.ts
git commit -m "build: Gateway 빌드 시 log-viewer 자동 빌드 (Nx dependsOn)"
```

---

### Task 5: Dockerfile 업데이트

**Files:**
- Modify: `apps/gateway/Dockerfile:30-36`

**Step 1: build 스테이지에 log-viewer 소스 복사 및 빌드 추가**

`apps/gateway/Dockerfile`의 build 스테이지를 수정한다:

```dockerfile
# ---- Stage 2: Build ----
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.10.5 --activate

# 전체 의존성 설치 (devDependencies 포함)
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

# 소스 코드 및 설정 파일 복사
COPY tsconfig.base.json nest-cli.json nx.json ./
COPY apps/gateway ./apps/gateway
COPY apps/log-viewer ./apps/log-viewer
COPY libs ./libs

# Log-viewer 빌드 → Gateway 빌드 (Nx dependsOn이 순서 보장)
RUN pnpm build:gateway
```

변경 사항:
- `COPY apps/log-viewer ./apps/log-viewer` 추가
- `pnpm build:gateway`가 Nx dependsOn으로 log-viewer를 먼저 빌드

production 스테이지는 변경 불필요. 이미 `COPY --from=build /app/dist ./dist`로 전체 dist를 복사하므로 `dist/apps/log-viewer/`도 포함된다.

**Step 2: 커밋**

```bash
git add apps/gateway/Dockerfile
git commit -m "build(docker): Gateway 이미지에 log-viewer 빌드 산출물 포함"
```

---

### Task 6: 최종 통합 테스트

**Step 1: 클린 빌드 후 프로덕션 모드 테스트**

```bash
rm -rf dist/
pnpm build:gateway
node dist/apps/gateway/main.js
```

확인 사항:
- `http://localhost:4000/` → log-viewer UI 로드
- `http://localhost:4000/assets/*` → JS/CSS 번들 로드
- GraphQL 쿼리/subscription 정상 동작
- 존재하지 않는 경로 (예: `/foo`) → index.html 반환 (SPA fallback)
- POST `/graphql` → GraphQL API 정상 응답

**Step 2: 개발 모드 테스트**

```bash
# 터미널 1
pnpm start:gateway:dev

# 터미널 2
pnpm start:log-viewer:dev
```

`http://localhost:5173`에서 Vite proxy를 통한 GraphQL 통신 확인.

**Step 3: 최종 커밋 (필요 시)**

모든 변경사항이 커밋되었는지 확인:

```bash
git status
```
