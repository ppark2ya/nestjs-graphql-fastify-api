# Log-Viewer 정적 서빙 설계

Gateway에서 log-viewer SPA를 정적 서빙하여 같은 도메인에서 UI와 API가 통신하도록 한다.

## 결정 사항

| 항목 | 결정 |
|------|------|
| 서빙 경로 | 루트 (`/`) |
| 접근 방식 | `@fastify/static` 플러그인 직접 등록 |
| 빌드 전략 | Gateway 빌드 시 Nx 의존성으로 log-viewer 자동 빌드 |
| API URL | 상대경로 (`/graphql`) |
| 개발 모드 | Vite dev server(5173) 유지 + proxy 설정 |

## 아키텍처

```
[Browser]
    |
    ├── GET /              → index.html (log-viewer SPA)
    ├── GET /assets/*      → JS/CSS 번들 (정적 파일)
    ├── POST /graphql      → NestJS GraphQL API
    └── WS /graphql        → GraphQL Subscriptions (graphql-ws)
```

프로덕션 환경에서는 단일 포트(4000)로 UI와 API를 모두 제공한다.
개발 환경에서는 Vite dev server(5173)에서 UI를 제공하고, `/graphql` 요청은 proxy로 Gateway(4000)에 전달한다.

## 1. 정적 파일 서빙 (`@fastify/static`)

Gateway `main.ts`에서 Fastify 인스턴스에 `@fastify/static` 플러그인을 등록한다.

**설정**:
- `root`: `path.join(process.cwd(), 'dist/apps/log-viewer')`
- `decorateReply: false` — NestJS의 reply 데코레이터와 충돌 방지
- `wildcard: false` — NestJS 라우트(`/graphql` 등)가 우선 처리되도록 함

**SPA Fallback**:
정적 파일에 매칭되지 않는 GET 요청은 `index.html`을 반환한다.
Fastify의 `setNotFoundHandler`를 활용하여 구현한다.

**라우트 우선순위**:
1. NestJS 등록 라우트 (`/graphql`, health check 등)
2. 정적 파일 매칭 (`/assets/*`, `/index.html` 등)
3. SPA fallback → `index.html`

## 2. 빌드 파이프라인

Nx 의존성 그래프를 활용한다.

**log-viewer `project.json` 변경**:
- build 타겟의 `outDir`을 `dist/apps/log-viewer`로 설정 (Nx 표준 출력 경로)

**gateway `project.json` 변경**:
- build 타겟에 `dependsOn: [{ "projects": ["log-viewer"], "target": "build" }]` 추가
- Gateway 빌드 시 log-viewer가 자동으로 먼저 빌드됨

**빌드 흐름**:
```
pnpm run build:gateway
  → Nx가 log-viewer:build 먼저 실행 (Vite → dist/apps/log-viewer/)
  → gateway:build 실행 (SWC → dist/apps/gateway/)
  → dist/apps/log-viewer/ 에 정적 파일 준비 완료
```

## 3. Apollo Client 상대경로 변경

`apps/log-viewer/src/apollo.ts`를 수정한다.

**HTTP 링크**:
```typescript
// 변경 전
const httpLink = new HttpLink({ uri: gatewayUrl, ... });

// 변경 후
const httpLink = new HttpLink({ uri: '/graphql', ... });
```

**WebSocket 링크**:
```typescript
// 변경 전
const wsUrl = gatewayUrl.replace(/^http/, 'ws');

// 변경 후
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/graphql`;
```

`createApolloClient`의 `gatewayUrl` 파라미터를 제거하고, URL을 내부에서 동적으로 결정한다.

## 4. Vite 프록시 설정 (개발 환경)

`apps/log-viewer/vite.config.ts`에 proxy를 추가한다.

```typescript
server: {
  port: 5173,
  proxy: {
    '/graphql': {
      target: 'http://localhost:4000',
      changeOrigin: true,
      ws: true,  // WebSocket 프록시 포함
    },
  },
},
```

이 설정으로 개발 시 Vite dev server에서도 `/graphql` 상대경로가 Gateway로 프록시된다.
Vite HMR은 그대로 유지된다.

## 5. Docker 빌드

Gateway Dockerfile의 build 스테이지에서 log-viewer도 함께 빌드한다.

```dockerfile
# build 스테이지에 추가
RUN pnpm nx build log-viewer
RUN pnpm nx build gateway

# production 스테이지에서 복사
COPY --from=build /app/dist/apps/log-viewer ./dist/apps/log-viewer
COPY --from=build /app/dist/apps/gateway ./dist/apps/gateway
```

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `package.json` | `@fastify/static` 의존성 추가 |
| `apps/gateway/src/main.ts` | `@fastify/static` 등록 + SPA fallback |
| `apps/gateway/project.json` | build `dependsOn`에 log-viewer 추가 |
| `apps/log-viewer/src/apollo.ts` | 상대경로로 변경, gatewayUrl 파라미터 제거 |
| `apps/log-viewer/src/App.tsx` | `createApolloClient()` 호출부 수정 (인자 제거) |
| `apps/log-viewer/vite.config.ts` | proxy 설정 추가 |
| `apps/log-viewer/project.json` | build `outDir`을 `dist/apps/log-viewer`로 변경 |
| `apps/gateway/Dockerfile` | log-viewer 빌드 및 산출물 복사 추가 |
