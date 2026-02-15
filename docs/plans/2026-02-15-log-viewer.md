# Docker Log Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gateway의 GraphQL Subscription을 통해 Docker 컨테이너 로그를 실시간으로 확인하는 테스트용 React UI를 만든다.

**Architecture:** Vite + React 앱이 Apollo Client를 통해 Gateway(`:4000/graphql`)에 연결한다. HTTP link로 컨테이너 목록을 조회하고, WebSocket link(`graphql-ws`)로 로그를 실시간 구독한다.

**Tech Stack:** Vite, React 19, TypeScript, Apollo Client 3, graphql-ws, Tailwind CSS 4

---

### Task 1: Vite + React + TypeScript 프로젝트 스캐폴딩

**Files:**
- Create: `apps/log-viewer/index.html`
- Create: `apps/log-viewer/vite.config.ts`
- Create: `apps/log-viewer/tsconfig.json`
- Create: `apps/log-viewer/tsconfig.node.json`
- Create: `apps/log-viewer/src/main.tsx`
- Create: `apps/log-viewer/src/vite-env.d.ts`

**Step 1: Vite 프로젝트 초기화 (pnpm create 대신 수동 생성)**

`apps/log-viewer/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
```

`apps/log-viewer/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

`apps/log-viewer/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

`apps/log-viewer/index.html`:
```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Docker Log Viewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/log-viewer/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`apps/log-viewer/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

**Step 2: 의존성 설치**

```bash
pnpm add -D vite @vitejs/plugin-react
pnpm add react react-dom @apollo/client graphql graphql-ws
pnpm add -D @types/react @types/react-dom
```

> 참고: `graphql`은 루트 `package.json`에 이미 있으나 버전 호환 확인 필요. `graphql-ws`도 이미 있음.

**Step 3: 커밋**

```bash
git add apps/log-viewer/
git commit -m "feat(log-viewer): Vite + React + TypeScript 프로젝트 스캐폴딩"
```

---

### Task 2: Tailwind CSS 4 설정

**Files:**
- Create: `apps/log-viewer/src/index.css`

**Step 1: Tailwind CSS 설치**

```bash
pnpm add -D tailwindcss @tailwindcss/vite
```

**Step 2: Vite 플러그인 등록**

`apps/log-viewer/vite.config.ts` 수정:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});
```

**Step 3: CSS 파일 생성**

`apps/log-viewer/src/index.css`:
```css
@import 'tailwindcss';
```

**Step 4: 커밋**

```bash
git add apps/log-viewer/
git commit -m "feat(log-viewer): Tailwind CSS 4 설정"
```

---

### Task 3: Apollo Client 설정 (HTTP + WebSocket split link)

**Files:**
- Create: `apps/log-viewer/src/apollo.ts`

**Step 1: Apollo Client 인스턴스 작성**

`apps/log-viewer/src/apollo.ts`:
```ts
import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const API_KEY = 'test-api-key';

export function createApolloClient(gatewayUrl: string) {
  const httpLink = new HttpLink({
    uri: gatewayUrl,
    headers: {
      'X-API-Key': API_KEY,
    },
  });

  const wsUrl = gatewayUrl.replace(/^http/, 'ws');
  const wsLink = new GraphQLWsLink(
    createClient({
      url: wsUrl,
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

  return new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
  });
}
```

**Step 2: 커밋**

```bash
git add apps/log-viewer/src/apollo.ts
git commit -m "feat(log-viewer): Apollo Client HTTP + WS split link 설정"
```

---

### Task 4: GraphQL 오퍼레이션 정의

**Files:**
- Create: `apps/log-viewer/src/graphql.ts`

**Step 1: Query, Subscription 정의**

`apps/log-viewer/src/graphql.ts`:
```ts
import { gql } from '@apollo/client';

export const CONTAINERS_QUERY = gql`
  query Containers {
    containers {
      id
      name
      image
      status
      state
      created
      ports
    }
  }
`;

export const CONTAINER_LOG_SUBSCRIPTION = gql`
  subscription ContainerLog($containerId: String!) {
    containerLog(containerId: $containerId) {
      containerId
      timestamp
      message
      stream
    }
  }
`;
```

**Step 2: 타입 정의**

같은 파일 하단에 추가:
```ts
export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: number;
  ports: string[];
}

export interface LogEntry {
  containerId: string;
  timestamp: string;
  message: string;
  stream: string;
}
```

**Step 3: 커밋**

```bash
git add apps/log-viewer/src/graphql.ts
git commit -m "feat(log-viewer): GraphQL 오퍼레이션 및 타입 정의"
```

---

### Task 5: ContainerList 컴포넌트

**Files:**
- Create: `apps/log-viewer/src/ContainerList.tsx`

**Step 1: 컴포넌트 작성**

`apps/log-viewer/src/ContainerList.tsx`:
```tsx
import { useQuery } from '@apollo/client';
import { CONTAINERS_QUERY, Container } from './graphql';

interface Props {
  selectedId: string | null;
  onSelect: (container: Container) => void;
}

export default function ContainerList({ selectedId, onSelect }: Props) {
  const { data, loading, error, refetch } = useQuery<{ containers: Container[] }>(CONTAINERS_QUERY);

  if (loading) {
    return (
      <div className="p-4 text-gray-400">Loading containers...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-red-400 text-sm mb-2">Failed to load containers</p>
        <p className="text-gray-500 text-xs mb-3">{error.message}</p>
        <button
          onClick={() => refetch()}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Retry
        </button>
      </div>
    );
  }

  const containers = data?.containers ?? [];

  if (containers.length === 0) {
    return (
      <div className="p-4 text-gray-500 text-sm">No containers found</div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <span className="text-xs text-gray-400">{containers.length} containers</span>
        <button
          onClick={() => refetch()}
          className="text-xs text-gray-400 hover:text-gray-200"
        >
          Refresh
        </button>
      </div>
      <ul className="overflow-y-auto">
        {containers.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c)}
              className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                selectedId === c.id ? 'bg-gray-800 border-l-2 border-l-blue-500' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    c.state === 'running' ? 'bg-green-500' : 'bg-gray-500'
                  }`}
                />
                <span className="text-sm font-medium text-gray-200 truncate">
                  {c.name}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">{c.image}</p>
              <p className="text-xs text-gray-600 mt-0.5">{c.status}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Step 2: 커밋**

```bash
git add apps/log-viewer/src/ContainerList.tsx
git commit -m "feat(log-viewer): ContainerList 컴포넌트"
```

---

### Task 6: LogViewer 컴포넌트

**Files:**
- Create: `apps/log-viewer/src/LogViewer.tsx`

**Step 1: 컴포넌트 작성**

`apps/log-viewer/src/LogViewer.tsx`:
```tsx
import { useSubscription } from '@apollo/client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry } from './graphql';

interface Props {
  containerId: string;
  containerName: string;
}

export default function LogViewer({ containerId, containerName }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { error } = useSubscription<{ containerLog: LogEntry }>(
    CONTAINER_LOG_SUBSCRIPTION,
    {
      variables: { containerId },
      onData: ({ data }) => {
        if (data.data?.containerLog) {
          setLogs((prev) => [...prev, data.data!.containerLog]);
        }
      },
    },
  );

  useEffect(() => {
    setLogs([]);
    setAutoScroll(true);
  }, [containerId]);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('ko-KR', { hour12: false });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-gray-200">{containerName}</h2>
          <span className="text-xs text-gray-500">{containerId.slice(0, 12)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{logs.length} lines</span>
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Follow
            </button>
          )}
          <button
            onClick={() => setLogs([])}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-900/30 text-red-400 text-xs">
          Subscription error: {error.message}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <p className="text-gray-600 p-2">Waiting for logs...</p>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`flex gap-2 py-0.5 px-2 hover:bg-gray-800/50 ${
                log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
              }`}
            >
              <span className="text-gray-600 shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span
                className={`shrink-0 w-12 ${
                  log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
                }`}
              >
                {log.stream}
              </span>
              <span className="whitespace-pre-wrap break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

**Step 2: 커밋**

```bash
git add apps/log-viewer/src/LogViewer.tsx
git commit -m "feat(log-viewer): LogViewer 컴포넌트 (실시간 로그 + 자동 스크롤)"
```

---

### Task 7: App 컴포넌트 (레이아웃 + ApolloProvider)

**Files:**
- Create: `apps/log-viewer/src/App.tsx`

**Step 1: 컴포넌트 작성**

`apps/log-viewer/src/App.tsx`:
```tsx
import { useState, useMemo } from 'react';
import { ApolloProvider } from '@apollo/client';
import { createApolloClient } from './apollo';
import ContainerList from './ContainerList';
import LogViewer from './LogViewer';
import { Container } from './graphql';

const DEFAULT_GATEWAY_URL = 'http://localhost:4000/graphql';

export default function App() {
  const [selected, setSelected] = useState<Container | null>(null);
  const client = useMemo(() => createApolloClient(DEFAULT_GATEWAY_URL), []);

  return (
    <ApolloProvider client={client}>
      <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900">
          <h1 className="text-base font-semibold">Docker Log Viewer</h1>
          <span className="text-xs text-gray-500">
            Gateway: {DEFAULT_GATEWAY_URL}
          </span>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Container List */}
          <aside className="w-64 border-r border-gray-700 flex flex-col overflow-hidden shrink-0">
            <div className="px-4 py-2 border-b border-gray-700">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Containers
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ContainerList
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
              />
            </div>
          </aside>

          {/* Right Panel - Log Viewer */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {selected ? (
              <LogViewer
                containerId={selected.id}
                containerName={selected.name}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-600">
                <p>Select a container to view logs</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </ApolloProvider>
  );
}
```

**Step 2: 커밋**

```bash
git add apps/log-viewer/src/App.tsx
git commit -m "feat(log-viewer): App 컴포넌트 (레이아웃 + ApolloProvider)"
```

---

### Task 8: Nx 프로젝트 등록 + package.json 스크립트

**Files:**
- Create: `apps/log-viewer/project.json`
- Modify: `package.json` (루트 — scripts 추가)

**Step 1: Nx project.json 작성**

`apps/log-viewer/project.json`:
```json
{
  "name": "log-viewer",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/log-viewer/src",
  "projectType": "application",
  "tags": ["scope:log-viewer", "type:app", "lang:ts"],
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx vite --config apps/log-viewer/vite.config.ts apps/log-viewer",
        "cwd": "{workspaceRoot}"
      }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx vite build --config apps/log-viewer/vite.config.ts apps/log-viewer",
        "cwd": "{workspaceRoot}"
      },
      "outputs": ["{workspaceRoot}/dist/apps/log-viewer"]
    }
  }
}
```

**Step 2: 루트 package.json에 스크립트 추가**

`package.json`의 `scripts`에 추가:
```json
"start:log-viewer:dev": "nx serve log-viewer"
```

**Step 3: 동작 확인**

```bash
pnpm run start:log-viewer:dev
```

브라우저에서 `http://localhost:5173` 접속하여 UI 확인.

**Step 4: 커밋**

```bash
git add apps/log-viewer/project.json package.json
git commit -m "feat(log-viewer): Nx 프로젝트 등록 및 dev 스크립트 추가"
```

---

### Task 9: 통합 검증

**Step 1: 인프라 구동**

```bash
docker-compose -f docker-compose.local.yml up -d
```

**Step 2: Gateway 로컬 실행**

```bash
LOG_STREAMER_URL=http://localhost:4003 \
LOG_STREAMER_WS_URL=ws://localhost:4003/ws/logs \
REDIS_HOST=localhost REDIS_PORT=6379 API_KEYS=test-api-key \
node dist/apps/gateway/main.js
```

**Step 3: Log Viewer 실행**

```bash
pnpm run start:log-viewer:dev
```

**Step 4: 브라우저 검증 체크리스트**

1. `http://localhost:5173` 접속 → UI 표시되는지 확인
2. 좌측 패널에 컨테이너 목록 표시되는지 확인
3. 컨테이너 클릭 → 우측 패널에 로그 실시간 표시되는지 확인
4. stdout(파란색)/stderr(빨간색) 색상 구분 확인
5. 로그 자동 스크롤 동작 확인
6. Clear 버튼 동작 확인
7. 다른 컨테이너 선택 시 로그 초기화 확인
