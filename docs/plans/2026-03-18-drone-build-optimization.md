# Drone 빌드 최적화: Dockerfile 멀티스테이징 → Drone 빌드 + COPY 전환

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Docker 멀티스테이징 빌드를 제거하고, Drone step에서 빌드 후 결과물만 Dockerfile에 COPY하여 빌드 서버 CPU 부하를 줄인다.

**Architecture:** Drone pipeline의 Node.js 컨테이너에서 `pnpm install` + `pnpm build`를 수행하고, 빌드 산출물(`dist/`, `node_modules/`)을 Docker build context로 전달한다. Dockerfile은 단일 스테이지로 결과물 COPY + 런타임 설정만 담당한다. Drone Runner의 cgroup 리소스 제한이 빌드 프로세스에 적용되어 CPU 사용률이 관리된다.

**Tech Stack:** Drone CI, Docker, Node.js 24, pnpm, Go 1.24

---

## 변경 대상 파일

| 파일 | 변경 |
|------|------|
| `apps/gateway/Dockerfile` | 멀티스테이지 → 단일 스테이지 (COPY only) |
| `apps/auth/Dockerfile` | 멀티스테이지 → 단일 스테이지 (COPY only) |
| `apps/log-streamer/Dockerfile` | 멀티스테이지 → 단일 스테이지 (COPY only) |
| `.drone.yml` | dev 파이프라인에 빌드 step 추가 |
| `.drone.yml` | release 파이프라인을 `plugins/docker` → `docker:cli` 빌드로 전환 |

## 주의사항

- `node_modules/`는 production 의존성만 포함해야 한다 (`pnpm install --prod`)
- log-streamer는 Go 바이너리이므로 Drone step에서 Go 빌드 후 바이너리만 COPY
- `.dockerignore`가 빌드 산출물을 제외하지 않는지 확인 필요
- dev/release 파이프라인 모두 동일 구조로 통일

---

### Task 1: Gateway Dockerfile 단일 스테이지로 변환

**Files:**
- Modify: `apps/gateway/Dockerfile`

**Step 1: Dockerfile을 단일 스테이지로 재작성**

```dockerfile
# ================================================================
# Gateway Dockerfile (pre-built)
# 빌드 컨텍스트: 프로젝트 루트
# 전제: Drone CI에서 pnpm install --prod + pnpm build:gateway 완료
# 사용법: docker build -f apps/gateway/Dockerfile -t gateway:tag .
# ================================================================
FROM node:24-alpine

WORKDIR /app

# 프로덕션 의존성 복사
COPY node_modules ./node_modules

# 빌드 결과물 복사
COPY dist ./dist

# package.json 복사 (버전 정보 등)
COPY package.json ./

# 로그 디렉토리 권한 설정
RUN mkdir -p logs && chown -R node:node .

# 보안: non-root 사용자로 실행
USER node

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/apps/gateway/main.js"]
```

**Step 2: 변경 확인**

기존 멀티스테이지(deps, build, production) 3단계가 단일 FROM으로 축소되었는지 확인.

---

### Task 2: Auth Dockerfile 단일 스테이지로 변환

**Files:**
- Modify: `apps/auth/Dockerfile`

**Step 1: Dockerfile을 단일 스테이지로 재작성**

```dockerfile
# ================================================================
# Auth Dockerfile (pre-built)
# 빌드 컨텍스트: 프로젝트 루트
# 전제: Drone CI에서 pnpm install --prod + pnpm build:auth 완료
# 사용법: docker build -f apps/auth/Dockerfile -t auth:tag .
# ================================================================
FROM node:24-alpine

WORKDIR /app

# 프로덕션 의존성 복사
COPY node_modules ./node_modules

# 빌드 결과물 복사
COPY dist ./dist

# package.json 복사 (버전 정보 등)
COPY package.json ./

# 로그 디렉토리 권한 설정
RUN mkdir -p logs && chown -R node:node .

# 보안: non-root 사용자로 실행
USER node

EXPOSE 4001 4002

ENV NODE_ENV=production
ENV AUTH_HTTP_PORT=4001
ENV AUTH_TCP_PORT=4002

CMD ["node", "dist/apps/auth/main.js"]
```

---

### Task 3: Log Streamer Dockerfile 단일 스테이지로 변환

**Files:**
- Modify: `apps/log-streamer/Dockerfile`

**Step 1: Dockerfile을 단일 스테이지로 재작성**

```dockerfile
# ================================================================
# Log Streamer Dockerfile (pre-built)
# 빌드 컨텍스트: apps/log-streamer/
# 전제: Drone CI에서 Go 바이너리 빌드 완료
# 사용법: docker build -f apps/log-streamer/Dockerfile -t log-streamer:tag apps/log-streamer/
# ================================================================
FROM alpine:3.19

RUN apk --no-cache add ca-certificates

WORKDIR /app

# 빌드된 바이너리 복사
COPY log-streamer .

# non-root 사용자 생성
RUN adduser -D -g '' appuser
USER appuser

EXPOSE 4003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost:4003/health || exit 1

ENTRYPOINT ["./log-streamer"]
```

---

### Task 4: .drone.yml dev 파이프라인 수정 — Gateway

**Files:**
- Modify: `.drone.yml` (dev-gateway 파이프라인)

**Step 1: dev-gateway 파이프라인을 빌드+이미지 구조로 변경**

detect-changes step은 그대로 유지. build-and-push step을 `build` + `dockerize` 2개 step으로 분리:

```yaml
# ================== Dev: Gateway ==================
kind: pipeline
type: docker
name: dev-gateway

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
        if echo "$CHANGED" | grep -qE '^(apps/gateway/|apps/ui/|libs/shared/|package\.json|pnpm-lock\.yaml|tsconfig\.base\.json|nest-cli\.json|nx\.json|\.swcrc)'; then
          echo ">>> Gateway build required"
        else
          echo ">>> No gateway changes, skipping build"
          touch .skip-build
        fi

  - name: build
    image: node:24-alpine
    environment:
      VITE_API_KEY:
        from_secret: vite_api_key
    commands:
      - |
        if [ -f .skip-build ]; then
          echo "Build skipped (no relevant changes)"
          exit 0
        fi
        corepack enable && corepack prepare pnpm@8.10.5 --activate
        pnpm install --frozen-lockfile
        pnpm nx build shared
        VITE_API_KEY="$VITE_API_KEY" pnpm build:gateway
        # production 의존성으로 교체
        rm -rf node_modules
        pnpm install --frozen-lockfile --prod
    when:
      status:
        - success

  - name: dockerize
    image: docker:cli
    volumes:
      - name: dockersock
        path: /var/run/docker.sock
    environment:
      DOCKER_REPO:
        from_secret: docker_repo_gateway
      DOCKER_USERNAME:
        from_secret: docker_username
      DOCKER_PASSWORD:
        from_secret: docker_password
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
        docker build -f apps/gateway/Dockerfile -t "$DOCKER_REPO:$TAG" -t "$DOCKER_REPO:latest" .
        docker push "$DOCKER_REPO:$TAG"
        docker push "$DOCKER_REPO:latest"
        echo ">>> Pushed $DOCKER_REPO:$TAG"
    when:
      status:
        - success
```

**핵심 포인트:**
- `build` step: `node:24-alpine`에서 pnpm install + 빌드 → production deps로 교체
- `dockerize` step: 빌드된 `dist/`와 `node_modules/`가 workspace에 있으므로 단일 스테이지 Dockerfile로 COPY
- Drone workspace는 step 간 공유되므로 빌드 산출물이 자동 전달됨

---

### Task 5: .drone.yml dev 파이프라인 수정 — Auth

**Files:**
- Modify: `.drone.yml` (dev-auth 파이프라인)

**Step 1: dev-auth 파이프라인을 빌드+이미지 구조로 변경**

Gateway와 동일한 패턴. build step에서 auth 빌드:

```yaml
  - name: build
    image: node:24-alpine
    commands:
      - |
        if [ -f .skip-build ]; then
          echo "Build skipped (no relevant changes)"
          exit 0
        fi
        corepack enable && corepack prepare pnpm@8.10.5 --activate
        pnpm install --frozen-lockfile
        pnpm build:auth
        rm -rf node_modules
        pnpm install --frozen-lockfile --prod
    when:
      status:
        - success
```

dockerize step은 gateway와 동일 패턴 (Dockerfile 경로만 `apps/auth/Dockerfile`로 변경).

---

### Task 6: .drone.yml dev 파이프라인 수정 — Log Streamer

**Files:**
- Modify: `.drone.yml` (dev-log-streamer 파이프라인)

**Step 1: dev-log-streamer 파이프라인을 빌드+이미지 구조로 변경**

Go 바이너리 빌드 후 Dockerfile context에 바이너리 배치:

```yaml
  - name: build
    image: golang:1.24-alpine
    commands:
      - |
        if [ -f .skip-build ]; then
          echo "Build skipped (no relevant changes)"
          exit 0
        fi
        cd apps/log-streamer
        CGO_ENABLED=0 GOOS=linux go build -ldflags='-s -w' -o log-streamer ./cmd/server
    when:
      status:
        - success
```

dockerize step의 Docker build context는 `apps/log-streamer/`:

```yaml
    commands:
      - |
        ...
        docker build -f apps/log-streamer/Dockerfile -t "$DOCKER_REPO:$TAG" -t "$DOCKER_REPO:latest" apps/log-streamer/
        ...
```

---

### Task 7: .drone.yml release 파이프라인 수정

**Files:**
- Modify: `.drone.yml` (release-gateway, release-auth, release-log-streamer 파이프라인)

**Step 1: release 파이프라인을 `plugins/docker` → `build` + `dockerize` 구조로 전환**

기존 `plugins/docker` 단일 step을 dev와 동일한 2-step 구조로 변경. Docker socket 마운트 추가.

각 release 파이프라인에 volumes + build step + dockerize step 추가. 태그는 `${DRONE_TAG}` + `latest` 유지.

---

### Task 8: 로컬 테스트

**Step 1: Gateway Dockerfile 로컬 빌드 테스트**

```bash
# 의존성 설치 + 빌드
pnpm install --frozen-lockfile
pnpm nx build shared && pnpm build:gateway
rm -rf node_modules && pnpm install --frozen-lockfile --prod

# Docker 이미지 빌드 (멀티스테이지 없이)
docker build -f apps/gateway/Dockerfile -t gateway:test .

# 확인
docker run --rm gateway:test node -e "console.log('OK')"
```

**Step 2: Auth Dockerfile 로컬 빌드 테스트**

```bash
pnpm install --frozen-lockfile
pnpm build:auth
rm -rf node_modules && pnpm install --frozen-lockfile --prod

docker build -f apps/auth/Dockerfile -t auth:test .
docker run --rm auth:test node -e "console.log('OK')"
```

**Step 3: Log Streamer Dockerfile 로컬 빌드 테스트**

```bash
cd apps/log-streamer
CGO_ENABLED=0 GOOS=linux go build -ldflags='-s -w' -o log-streamer ./cmd/server
docker build -f Dockerfile -t log-streamer:test .
docker run --rm log-streamer:test ./log-streamer --help || true
```

---

### Task 9: 커밋

**Step 1: 변경사항 커밋**

```bash
git add apps/gateway/Dockerfile apps/auth/Dockerfile apps/log-streamer/Dockerfile .drone.yml
git commit -m "ci: move build step from Dockerfile to Drone pipeline

Eliminates multi-stage Docker builds to reduce CPU usage on build server.
Build runs inside Drone Runner container (cgroup-limited) instead of
Docker daemon process (unlimited)."
```
