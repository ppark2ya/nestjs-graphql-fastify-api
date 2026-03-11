# Nginx Proxy Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gateway에서 UI 정적 파일 서빙을 분리하여 별도 Nginx Swarm 서비스로 배포하고, `/admin` 경로에 IP whitelist를 적용한다.

**Architecture:** Nginx를 Docker Swarm 서비스로 추가하여 UI 정적 파일 서빙 + `/admin` IP whitelist + Gateway 리버스 프록시를 담당한다. Gateway는 API 전용으로 변경하고 외부 포트 노출을 제거한다.

**Tech Stack:** Nginx 1.27 (Alpine), Docker multi-stage build, Vite (UI build), Drone CI

**Design doc:** `docs/plans/2026-03-06-nginx-proxy-design.md`

---

### Task 1: Nginx 설정 파일 생성

Nginx 핵심 설정과 IP whitelist 설정을 별도 파일로 생성한다.

**Files:**
- Create: `docker/nginx/nginx.conf`
- Create: `docker/nginx/whitelist.conf`

**Step 1: whitelist.conf 생성**

```nginx
# IP whitelist for /admin paths
# Apache 뒤에서 실제 클라이언트 IP를 X-Forwarded-For로 전달받아 사용
# 운영 환경에 맞게 IP 대역 수정 필요

geo $admin_allowed {
    default        0;
    127.0.0.1      1;
    192.168.1.0/24 1;   # 사내 IP (예시 — 실제 대역으로 교체)
    10.0.0.0/8     1;   # VPN (예시 — 실제 대역으로 교체)
}
```

파일 경로: `docker/nginx/whitelist.conf`

**Step 2: nginx.conf 생성**

```nginx
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;

    sendfile    on;
    tcp_nopush  on;
    keepalive_timeout 65;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;

    # Apache 뒤에서 실제 클라이언트 IP 확보
    # set_real_ip_from 값을 운영 Apache 서버 IP/대역으로 변경할 것
    set_real_ip_from 0.0.0.0/0;
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;

    # IP whitelist 로드
    include /etc/nginx/whitelist.conf;

    upstream gateway {
        server gateway:4000;
    }

    server {
        listen 80;
        server_name _;

        root /usr/share/nginx/html;
        index index.html;

        # /admin — IP whitelist + SPA fallback
        location /admin {
            if ($admin_allowed = 0) {
                return 403;
            }
            try_files $uri /index.html;
        }

        # /graphql — Gateway 프록시 (HTTP + WebSocket)
        location /graphql {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }

        # /api — Gateway 프록시
        location /api {
            proxy_pass http://gateway;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # 정적 파일 + SPA fallback
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

파일 경로: `docker/nginx/nginx.conf`

**Step 3: Commit**

```bash
git add docker/nginx/nginx.conf docker/nginx/whitelist.conf
git commit -m "feat(nginx): add nginx config with /admin IP whitelist and gateway proxy"
```

---

### Task 2: Nginx Dockerfile 생성

UI 빌드 결과물을 포함하는 Nginx Docker 이미지를 만든다. Multi-stage 빌드로 Node.js에서 UI를 빌드한 뒤 Nginx 이미지에 복사한다.

**Files:**
- Create: `docker/nginx/Dockerfile`

**Step 1: Dockerfile 작성**

```dockerfile
# ================================================================
# Nginx Dockerfile (UI 정적 파일 + 리버스 프록시)
# 빌드 컨텍스트: 프로젝트 루트
# 사용법: docker build -f docker/nginx/Dockerfile -t nginx-ui:tag .
# ================================================================

# ---- Stage 1: UI 빌드 ----
FROM node:24-alpine AS builder

ARG VITE_API_KEY
ENV VITE_API_KEY=$VITE_API_KEY

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.10.5 --activate

COPY pnpm-lock.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY tsconfig.base.json nx.json ./
COPY apps/ui ./apps/ui
COPY libs ./libs

RUN (pnpm nx build shared && pnpm nx build ui || true) \
    && test -f dist/apps/ui/index.html

# ---- Stage 2: Nginx ----
FROM nginx:1.27-alpine

# Nginx 설정 복사
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/whitelist.conf /etc/nginx/whitelist.conf

# UI 빌드 결과물 복사
COPY --from=builder /app/dist/apps/ui /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

파일 경로: `docker/nginx/Dockerfile`

**Step 2: 로컬 빌드 테스트**

```bash
docker build -f docker/nginx/Dockerfile -t nginx-ui:test .
```

Expected: 빌드 성공. `dist/apps/ui/index.html` 존재 검증 통과.

**Step 3: Commit**

```bash
git add docker/nginx/Dockerfile
git commit -m "feat(nginx): add multi-stage Dockerfile with UI build"
```

---

### Task 3: Gateway에서 정적 파일 서빙 코드 제거

Gateway가 더 이상 UI 정적 파일을 서빙하지 않도록 `main.ts`를 수정한다.

**Files:**
- Modify: `apps/gateway/src/main.ts` (lines 6-8, 23-49 제거)

**Step 1: main.ts 수정**

변경 후 `apps/gateway/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
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

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
  console.log(`📊 GraphQL endpoint: ${await app.getUrl()}/graphql`);
}
void bootstrap();
```

제거 항목:
- `import fastifyStatic from '@fastify/static';`
- `import { existsSync, readFileSync } from 'fs';`
- `import { join } from 'path';`
- 정적 파일 서빙 코드 블록 (lines 23-49): `staticRoot`, `fastifyStatic` 등록, SPA fallback

**Step 2: 타입 체크**

```bash
pnpm nx run gateway:build
```

Expected: 빌드 성공 (미사용 import 제거로 에러 없음)

**Step 3: Gateway E2E 테스트 실행**

```bash
pnpm run test:e2e:gateway
```

Expected: GraphQL 관련 테스트 통과 (정적 파일 테스트가 있다면 제거/수정 필요)

**Step 4: Commit**

```bash
git add apps/gateway/src/main.ts
git commit -m "refactor(gateway): remove static file serving (moved to nginx)"
```

---

### Task 4: Gateway Dockerfile에서 UI 빌드 의존성 제거

Gateway Docker 이미지에서 더 이상 UI를 빌드하지 않으므로 `apps/ui` 복사와 관련 빌드 명령을 제거한다.

**Files:**
- Modify: `apps/gateway/Dockerfile` (lines 23-24, 38-39, 44)

**Step 1: Dockerfile 수정**

변경 사항:
1. `ARG VITE_API_KEY` / `ENV VITE_API_KEY` 제거 (line 23-24)
2. `COPY apps/ui ./apps/ui` 제거 (line 38)
3. 빌드 명령에서 `build:gateway` → `nx build gateway`로 변경 (UI 빌드 불필요)

변경 후 `apps/gateway/Dockerfile`:

```dockerfile
# ================================================================
# Gateway Dockerfile
# 빌드 컨텍스트: 프로젝트 루트
# 사용법: docker build -f apps/gateway/Dockerfile -t gateway:tag .
# ================================================================

# ---- Stage 1: Production dependencies ----
FROM node:24-alpine AS deps

WORKDIR /app

# pnpm 활성화 (lockfile 버전과 일치시킴)
RUN corepack enable && corepack prepare pnpm@8.10.5 --activate

# 의존성 파일 복사 및 설치 (production only)
COPY pnpm-lock.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ---- Stage 2: Build ----
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.10.5 --activate

# 전체 의존성 설치 (devDependencies 포함)
COPY pnpm-lock.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 소스 코드 및 설정 파일 복사 (UI 제외)
COPY tsconfig.base.json nest-cli.json nx.json ./
COPY apps/gateway ./apps/gateway
COPY libs ./libs

# Shared 라이브러리 → Gateway 빌드
RUN (pnpm nx build shared && pnpm nx build gateway || true) \
    && test -f dist/apps/gateway/main.js

# ---- Stage 3: Production ----
FROM node:24-alpine AS production

WORKDIR /app

# 프로덕션 의존성만 복사
COPY --from=deps /app/node_modules ./node_modules

# 빌드 결과물 복사
COPY --from=build /app/dist ./dist

# package.json 복사 (버전 정보 등)
COPY package.json ./

# 로그 디렉토리 권한 설정
RUN mkdir -p logs && chown -R node:node .

# 보안: non-root 사용자로 실행
USER node

EXPOSE 4000

# 환경변수 기본값
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/apps/gateway/main.js"]
```

**Step 2: 로컬 빌드 테스트**

```bash
docker build -f apps/gateway/Dockerfile -t gateway:test .
```

Expected: UI 없이 Gateway만 빌드 성공

**Step 3: Commit**

```bash
git add apps/gateway/Dockerfile
git commit -m "refactor(gateway): remove UI build dependency from Dockerfile"
```

---

### Task 5: docker-compose.yml 수정

프로덕션 Swarm 스택에 Nginx 서비스를 추가하고 Gateway의 외부 포트 노출을 제거한다.

**Files:**
- Modify: `docker-compose.yml` (gateway ports 제거, nginx 서비스 추가)

**Step 1: gateway 서비스에서 ports 제거**

`docker-compose.yml`의 gateway 서비스에서 다음을 제거:

```yaml
    ports:
      - target: 4000
        published: 4000
        protocol: tcp
        mode: host
```

**Step 2: nginx 서비스 추가**

`gateway:` 서비스 바로 앞 (또는 뒤)에 다음을 추가:

```yaml
  nginx:
    image: ${DOCKER_REPO_NGINX:-ppark2ya/nginx-ui}:${TAG:-latest}
    ports:
      - target: 80
        published: 4000
        protocol: tcp
        mode: host
    deploy:
      replicas: 1
      update_config:
        parallelism: 1
        delay: 10s
        order: stop-first
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: "0.5"
          memory: 128M
        reservations:
          cpus: "0.1"
          memory: 64M
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://127.0.0.1:80/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
    networks:
      - app-network
```

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(infra): add nginx service, remove gateway external port"
```

---

### Task 6: Drone CI 파이프라인 추가

Nginx 이미지 빌드를 위한 Drone 파이프라인을 추가한다. Gateway 파이프라인의 변경 감지에서 `apps/ui/` 제거하고, 새 Nginx 파이프라인에서 `apps/ui/` + `docker/nginx/` 변경을 감지한다.

**Files:**
- Modify: `.drone.yml`

**Step 1: Gateway 파이프라인 변경 감지 수정**

`dev-gateway` 파이프라인의 `detect-changes` step에서 변경 감지 패턴 수정:

Before (line 58):
```bash
if echo "$CHANGED" | grep -qE '^(apps/gateway/|apps/ui/|libs/shared/|package\.json|pnpm-lock\.yaml|tsconfig\.base\.json|nest-cli\.json|nx\.json|\.swcrc)'; then
```

After:
```bash
if echo "$CHANGED" | grep -qE '^(apps/gateway/|libs/shared/|package\.json|pnpm-lock\.yaml|tsconfig\.base\.json|nest-cli\.json|nx\.json|\.swcrc)'; then
```

동일하게 `release-gateway-detect` 파이프라인(line 278)에서도 `apps/ui/` 제거.

Gateway dev 파이프라인의 `build-and-push` step에서 `VITE_API_KEY` 환경변수와 `--build-arg` 제거.

Release Gateway 파이프라인에서도 `build_args_from_env: VITE_API_KEY` 와 관련 environment 제거.

**Step 2: Nginx Dev 파이프라인 추가**

`.drone.yml` 끝에 추가 (dev-log-streamer 뒤에):

```yaml
---
# ================== Dev: Nginx ==================
kind: pipeline
type: docker
name: dev-nginx

depends_on:
  - dev-log-streamer

trigger:
  branch:
    - develop
    - dev-*
  event:
    - push

volumes:
  - name: dockersock
    host:
      path: /var/run/docker.sock

steps:
  - name: detect-changes
    image: alpine/git
    commands:
      - |
        BEFORE=$(git rev-parse HEAD~1 2>/dev/null)
        if [ $? -ne 0 ]; then
          echo ">>> Build required (no parent commit, initial commit)"
          exit 0
        fi
        CHANGED=$(git diff --name-only "$BEFORE"..HEAD)
        echo "Changed files ($BEFORE..HEAD):"
        echo "$CHANGED"
        echo "---"
        if echo "$CHANGED" | grep -qE '^(apps/ui/|docker/nginx/|libs/shared/|package\.json|pnpm-lock\.yaml|tsconfig\.base\.json|nx\.json)'; then
          echo ">>> Nginx build required"
        else
          echo ">>> No nginx changes, skipping build"
          touch .skip-build
        fi

  - name: build-and-push
    image: docker:cli
    volumes:
      - name: dockersock
        path: /var/run/docker.sock
    environment:
      DOCKER_REPO:
        from_secret: docker_repo_nginx
      DOCKER_USERNAME:
        from_secret: docker_username
      DOCKER_PASSWORD:
        from_secret: docker_password
      VITE_API_KEY:
        from_secret: vite_api_key
    commands:
      - |
        if [ -f .skip-build ]; then
          echo "Build skipped (no relevant changes)"
          exit 0
        fi
        TAG="${DRONE_BRANCH}-$(echo ${DRONE_COMMIT_SHA} | cut -c1-8)"
        REGISTRY=$(echo "$DOCKER_REPO" | cut -d'/' -f1)
        if echo "$REGISTRY" | grep -qE '[.:]'; then
          echo "$DOCKER_PASSWORD" | docker login "$REGISTRY" -u "$DOCKER_USERNAME" --password-stdin
        else
          echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
        fi
        docker build -f docker/nginx/Dockerfile --build-arg VITE_API_KEY="$VITE_API_KEY" -t "$DOCKER_REPO:$TAG" -t "$DOCKER_REPO:latest" .
        docker push "$DOCKER_REPO:$TAG"
        docker push "$DOCKER_REPO:latest"
        echo ">>> Pushed $DOCKER_REPO:$TAG"
    when:
      status:
        - success
```

**Step 3: Nginx Release 파이프라인 추가**

```yaml
---
# ================== Release Detect: Nginx ==================
kind: pipeline
type: docker
name: release-nginx-detect

trigger:
  event:
    - tag
  ref:
    - refs/tags/v*

steps:
  - name: detect-changes
    image: alpine/git
    commands:
      - |
        PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null)
        if [ $? -ne 0 ]; then
          echo ">>> Build required (first release, no previous tag)"
          exit 0
        fi
        echo "Previous tag: $PREV_TAG"
        CHANGED=$(git diff --name-only "$PREV_TAG"..HEAD)
        echo "Changed files ($PREV_TAG..HEAD):"
        echo "$CHANGED"
        echo "---"
        if echo "$CHANGED" | grep -qE '^(apps/ui/|docker/nginx/|libs/shared/|package\.json|pnpm-lock\.yaml|tsconfig\.base\.json|nx\.json)'; then
          echo ">>> Nginx build required"
        else
          echo ">>> No nginx changes, skipping build"
          exit 1
        fi

---
# ================== Release: Nginx ==================
kind: pipeline
type: docker
name: release-nginx

depends_on:
  - release-nginx-detect

trigger:
  event:
    - tag
  ref:
    - refs/tags/v*

steps:
  - name: build-and-push
    image: plugins/docker
    settings:
      dockerfile: docker/nginx/Dockerfile
      context: .
      repo:
        from_secret: docker_repo_nginx
      tags:
        - ${DRONE_TAG}
        - latest
      username:
        from_secret: docker_username
      password:
        from_secret: docker_password
      build_args_from_env:
        - VITE_API_KEY
    environment:
      VITE_API_KEY:
        from_secret: vite_api_key
```

**Step 4: Commit**

```bash
git add .drone.yml
git commit -m "ci: add nginx pipeline, remove UI from gateway pipeline"
```

---

### Task 7: Swarm 테스트 환경 업데이트 (선택)

`docker-stack.test.yml`과 `scripts/swarm-test-up.sh`에 Nginx 서비스를 추가한다.

**Files:**
- Modify: `docker-stack.test.yml` (nginx 서비스 추가, gateway ports 변경)
- Modify: `scripts/swarm-test-up.sh` (nginx 빌드 추가)

**Step 1: docker-stack.test.yml에 nginx 서비스 추가**

gateway 서비스의 ports를 제거하고, nginx 서비스를 추가:

```yaml
  nginx:
    image: nginx-ui:test
    ports:
      - target: 80
        published: 4000
        protocol: tcp
        mode: ingress
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: "0.5"
          memory: 128M
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "-", "http://127.0.0.1:80/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
    networks:
      - test-overlay
```

**Step 2: swarm-test-up.sh에 nginx 빌드 추가**

Gateway 빌드 명령 뒤에 추가:

```bash
echo ">>> Building nginx-ui..."
docker build -f docker/nginx/Dockerfile -t nginx-ui:test .
```

**Step 3: Commit**

```bash
git add docker-stack.test.yml scripts/swarm-test-up.sh
git commit -m "test(infra): add nginx service to swarm test environment"
```

---

### Task 8: CLAUDE.md 업데이트

프로젝트 문서에 Nginx 서비스 관련 정보를 추가한다.

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 프로젝트 개요에 Nginx 추가**

프로젝트 개요 섹션의 애플리케이션 목록에 추가:

```markdown
- **Nginx** (port 80→4000): UI 정적 파일 서빙 + 리버스 프록시. `/admin` 경로 IP whitelist, `/graphql`·`/api` 요청을 Gateway로 프록시한다.
```

**Step 2: 디렉토리 구조에 추가**

```markdown
├── docker/
│   ├── nginx/
│   │   ├── Dockerfile               # Nginx Docker 이미지 (UI 빌드 포함)
│   │   ├── nginx.conf               # Nginx 설정 (프록시 + SPA fallback)
│   │   └── whitelist.conf           # /admin IP whitelist
│   └── apache/
│       ├── httpd.conf
│       └── Dockerfile
```

**Step 3: Gateway 정적 파일 서빙 섹션 수정**

"Gateway 정적 파일 서빙 (SPA)" 섹션을 "Nginx 정적 파일 서빙" 으로 변경하거나 제거하고, Nginx 아키텍처 설명을 추가.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with nginx service architecture"
```

---

## Summary

| Task | Description | Estimated Effort |
|------|-------------|-----------------|
| 1 | Nginx 설정 파일 (nginx.conf + whitelist.conf) | Small |
| 2 | Nginx Dockerfile (multi-stage UI build) | Small |
| 3 | Gateway main.ts 정적 파일 서빙 제거 | Small |
| 4 | Gateway Dockerfile UI 빌드 의존성 제거 | Small |
| 5 | docker-compose.yml nginx 서비스 추가 | Small |
| 6 | Drone CI 파이프라인 추가/수정 | Medium |
| 7 | Swarm 테스트 환경 업데이트 (선택) | Small |
| 8 | CLAUDE.md 문서 업데이트 | Small |

## Drone CI Secrets 추가 필요

구현 완료 후 Drone에 다음 secret 추가 필요:
- `docker_repo_nginx`: Nginx 이미지 저장소 주소
