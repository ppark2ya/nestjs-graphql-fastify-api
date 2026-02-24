# Apache Reverse Proxy + DinD 2-Node Swarm E2E Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apache reverse proxy(HTTP+WS) 컨테이너를 추가하고, DinD 기반 2노드 Swarm 환경에서 log-viewer UI의 실시간 로그 스트리밍을 Playwright로 E2E 테스트한다.

**Architecture:** Apache httpd가 앞단에서 HTTP/WS를 게이트웨이로 리버스 프록시하며 경로별 IP 접근 제어를 적용한다. DinD 컨테이너를 worker 노드로 사용해 2노드 Swarm을 시뮬레이션하고, Playwright가 Apache 경유로 UI에 접근하여 subscription 로그 수신까지 검증한다.

**Tech Stack:** Apache httpd 2.4 (mod_proxy, mod_proxy_wstunnel, mod_rewrite), Docker Swarm (DinD), Playwright, TypeScript

---

### Task 1: Apache Dockerfile + httpd.conf 생성

**Files:**
- Create: `docker/apache/Dockerfile`
- Create: `docker/apache/httpd.conf`

**Step 1: Apache Dockerfile 작성**

`docker/apache/Dockerfile`:
```dockerfile
FROM httpd:2.4-alpine

# 기본 httpd.conf 교체
COPY httpd.conf /usr/local/apache2/conf/httpd.conf

EXPOSE 80
```

**Step 2: httpd.conf 작성 (리버스 프록시 + WS + 접근 제어)**

`docker/apache/httpd.conf`:
```apache
ServerRoot "/usr/local/apache2"
Listen 80

# 필수 모듈 로드
LoadModule mpm_event_module modules/mod_mpm_event.so
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule authz_host_module modules/mod_authz_host.so
LoadModule log_config_module modules/mod_log_config.so
LoadModule unixd_module modules/mod_unixd.so
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule headers_module modules/mod_headers.so
LoadModule dir_module modules/mod_dir.so

# 기본 설정
ServerAdmin admin@localhost
ServerName localhost

ErrorLog /proc/self/fd/2
CustomLog /proc/self/fd/1 common
LogLevel info

# 프록시 기본 설정
ProxyPreserveHost On
ProxyRequests Off

# WebSocket upgrade 감지 → ws:// 프록시
RewriteEngine On
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/graphql(.*)$ ws://gateway:4000/graphql$1 [P,L]

# HTTP 프록시
ProxyPass /graphql http://gateway:4000/graphql
ProxyPassReverse /graphql http://gateway:4000/graphql

# 정적 파일 (log-viewer SPA) 프록시
ProxyPass / http://gateway:4000/
ProxyPassReverse / http://gateway:4000/

# 경로별 접근 제어
# /admin - 모든 IP 허용
<Location /admin>
    Require all granted
</Location>

# /live-stream - 화이트리스트
<Location /live-stream>
    Require ip 127.0.0.1 172.0.0.0/8 10.0.0.0/8 192.168.0.0/16
</Location>

# /history - 화이트리스트
<Location /history>
    Require ip 127.0.0.1 172.0.0.0/8 10.0.0.0/8 192.168.0.0/16
</Location>

# 기본 접근 허용
<Directory />
    Require all granted
</Directory>
```

**Step 3: Apache 이미지 로컬 빌드 테스트**

Run: `docker build -t apache-proxy:local -f docker/apache/Dockerfile docker/apache/`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add docker/apache/
git commit -m "feat: Apache reverse proxy 설정 (mod_proxy + mod_proxy_wstunnel + IP 접근 제어)"
```

---

### Task 2: E2E 전용 docker-compose 파일 (DinD + Apache + Swarm)

**Files:**
- Create: `docker-compose.e2e-full.yml`

**Step 1: compose 파일 작성**

`docker-compose.e2e-full.yml` — DinD worker 노드 + Apache + Swarm 서비스:
```yaml
version: "3.8"

# === Phase 1: DinD worker 노드 + Apache (docker compose up) ===
# === Phase 2: Swarm 서비스 (docker stack deploy) ===

services:
  # DinD worker 노드 (docker compose로 먼저 시작)
  dind-worker:
    image: docker:dind
    privileged: true
    environment:
      - DOCKER_TLS_CERTDIR=
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "docker", "info"]
      interval: 5s
      timeout: 5s
      retries: 10

  # Apache reverse proxy (docker compose로 시작, host 포트 80 노출)
  apache:
    build:
      context: ./docker/apache
      dockerfile: Dockerfile
    ports:
      - "80:80"
    networks:
      - app-network
    depends_on:
      dind-worker:
        condition: service_healthy

networks:
  app-network:
    driver: overlay
    attachable: true
```

**Step 2: Swarm 서비스용 compose 분리 파일 확인**

기존 `docker-compose.swarm-e2e.yml`을 Swarm stack deploy에 재활용한다. Apache는 overlay 네트워크에 직접 attach하므로 gateway 서비스와 통신 가능.

**Step 3: Commit**

```bash
git add docker-compose.e2e-full.yml
git commit -m "feat: DinD + Apache E2E compose 파일 추가"
```

---

### Task 3: Swarm 셋업/정리 스크립트

**Files:**
- Create: `scripts/e2e-swarm-setup.sh`
- Create: `scripts/e2e-swarm-teardown.sh`

**Step 1: 셋업 스크립트 작성**

`scripts/e2e-swarm-setup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STACK_NAME="e2e"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.e2e-full.yml"
SWARM_COMPOSE="$PROJECT_DIR/docker-compose.swarm-e2e.yml"

echo "=== [1/7] Building application images ==="
docker build -f "$PROJECT_DIR/apps/gateway/Dockerfile" -t gateway:local "$PROJECT_DIR"
docker build -f "$PROJECT_DIR/apps/log-streamer/Dockerfile" -t log-streamer:local "$PROJECT_DIR/apps/log-streamer"
docker build -t apache-proxy:local -f "$PROJECT_DIR/docker/apache/Dockerfile" "$PROJECT_DIR/docker/apache"

echo "=== [2/7] Initializing Docker Swarm ==="
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
  docker swarm init --advertise-addr 127.0.0.1 || true
fi

echo "=== [3/7] Creating overlay network ==="
docker network create --driver overlay --attachable app-network 2>/dev/null || true

echo "=== [4/7] Starting DinD worker + Apache ==="
docker compose -f "$COMPOSE_FILE" up -d --build --wait

echo "=== [5/7] Joining DinD worker to Swarm ==="
WORKER_TOKEN=$(docker swarm join-token -q worker)
MANAGER_IP=$(docker info --format '{{.Swarm.NodeAddr}}')
DIND_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q dind-worker)

# 이미지를 DinD worker에 로드
echo "Loading images into DinD worker..."
docker save gateway:local log-streamer:local | docker exec -i "$DIND_CONTAINER" docker load

# Swarm join
docker exec "$DIND_CONTAINER" docker swarm join --token "$WORKER_TOKEN" "$MANAGER_IP":2377 || true

echo "=== [6/7] Verifying 2-node Swarm cluster ==="
docker node ls

echo "=== [7/7] Deploying stack ==="
# relay 서비스 제거한 swarm compose 사용 (relay 이미지 없을 수 있음)
docker stack deploy -c "$SWARM_COMPOSE" "$STACK_NAME" --resolve-image=never 2>/dev/null || \
  docker stack deploy -c "$SWARM_COMPOSE" "$STACK_NAME"

echo ""
echo "Waiting for services to be ready..."
sleep 10

# 헬스체크 대기
for i in $(seq 1 30); do
  if curl -sf http://localhost:80 > /dev/null 2>&1; then
    echo "Apache is ready!"
    break
  fi
  echo "Waiting for Apache... ($i/30)"
  sleep 2
done

echo ""
echo "=== Setup complete ==="
echo "  Apache:    http://localhost:80"
echo "  Gateway:   http://localhost:4000 (direct)"
echo "  Swarm nodes: $(docker node ls --format '{{.Hostname}}' | wc -l | tr -d ' ')"
docker node ls
docker stack services "$STACK_NAME"
```

**Step 2: 정리 스크립트 작성**

`scripts/e2e-swarm-teardown.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STACK_NAME="e2e"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.e2e-full.yml"

echo "=== Tearing down E2E environment ==="

echo "[1/4] Removing stack..."
docker stack rm "$STACK_NAME" 2>/dev/null || true
sleep 5

echo "[2/4] Stopping DinD + Apache..."
docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true

echo "[3/4] Leaving Swarm..."
docker swarm leave --force 2>/dev/null || true

echo "[4/4] Removing overlay network..."
docker network rm app-network 2>/dev/null || true

echo "=== Teardown complete ==="
```

**Step 3: 실행 권한 부여**

Run: `chmod +x scripts/e2e-swarm-setup.sh scripts/e2e-swarm-teardown.sh`

**Step 4: Commit**

```bash
git add scripts/e2e-swarm-setup.sh scripts/e2e-swarm-teardown.sh
git commit -m "feat: Swarm E2E 셋업/정리 스크립트"
```

---

### Task 4: Playwright 설치 및 설정

**Files:**
- Modify: `package.json` (devDependencies에 playwright 추가)
- Create: `tests/e2e-swarm/playwright.config.ts`

**Step 1: Playwright 설치**

Run: `pnpm add -D @playwright/test`
Run: `pnpm exec playwright install chromium`

**Step 2: Playwright 설정 작성**

`tests/e2e-swarm/playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:80',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
});
```

**Step 3: package.json에 테스트 스크립트 추가**

`package.json`에 추가:
```json
{
  "scripts": {
    "test:e2e:swarm": "playwright test --config tests/e2e-swarm/playwright.config.ts",
    "test:e2e:swarm:setup": "bash scripts/e2e-swarm-setup.sh",
    "test:e2e:swarm:teardown": "bash scripts/e2e-swarm-teardown.sh"
  }
}
```

**Step 4: Commit**

```bash
git add tests/e2e-swarm/playwright.config.ts package.json pnpm-lock.yaml
git commit -m "feat: Playwright E2E 테스트 설정"
```

---

### Task 5: Playwright E2E 테스트 작성

**Files:**
- Create: `tests/e2e-swarm/log-viewer.spec.ts`

**Step 1: E2E 테스트 작성**

`tests/e2e-swarm/log-viewer.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Log Viewer E2E (Apache + Swarm)', () => {
  test('should load log-viewer UI via Apache reverse proxy', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Docker Log Viewer');
    await expect(page.locator('h2')).toContainText('Containers');
  });

  test('should display container list from Swarm', async ({ page }) => {
    await page.goto('/');

    // 컨테이너 목록 로드 대기
    await expect(page.locator('text=Loading containers...')).toBeHidden({ timeout: 15_000 });

    // 컨테이너가 1개 이상 표시되어야 함
    const containerCount = page.locator('text=/\\d+ containers/');
    await expect(containerCount).toBeVisible({ timeout: 10_000 });
  });

  test('should show Swarm service groups with replicas', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Loading containers...')).toBeHidden({ timeout: 15_000 });

    // Swarm 서비스 그룹이 표시되어야 함 (e2e_gateway 또는 e2e_log-streamer)
    const serviceGroup = page.locator('text=/replicas/').first();
    await expect(serviceGroup).toBeVisible({ timeout: 10_000 });

    // 2개 이상의 replica가 표시되어야 함
    const replicaText = await serviceGroup.textContent();
    const replicaCount = parseInt(replicaText?.match(/(\d+)\s*replicas/)?.[1] ?? '0');
    expect(replicaCount).toBeGreaterThanOrEqual(2);
  });

  test('should receive real-time logs via GraphQL Subscription', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Loading containers...')).toBeHidden({ timeout: 15_000 });

    // 첫 번째 서비스 그룹 클릭
    const serviceGroup = page.locator('button:has-text("replicas")').first();
    await serviceGroup.click();

    // 로그 뷰어가 열리고 로그가 수신되길 대기
    // "Waiting for logs" 텍스트가 표시된 후 실제 로그로 대체되어야 함
    await expect(page.locator('text=Waiting for logs')).toBeVisible({ timeout: 5_000 });

    // 로그가 수신될 때까지 대기 (최대 30초)
    // 로그 라인은 stdout 또는 stderr 텍스트를 포함
    const logLine = page.locator('text=/stdout|stderr/').first();
    await expect(logLine).toBeVisible({ timeout: 30_000 });

    // 로그 카운트가 증가했는지 확인
    const lineCount = page.locator('text=/\\d+ lines/');
    await expect(lineCount).toBeVisible();
    const countText = await lineCount.textContent();
    const count = parseInt(countText?.match(/(\d+)/)?.[1] ?? '0');
    expect(count).toBeGreaterThan(0);
  });

  test('should show logs from multiple nodes (nodeName)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Loading containers...')).toBeHidden({ timeout: 15_000 });

    // 서비스 그룹 클릭
    const serviceGroup = page.locator('button:has-text("replicas")').first();
    await serviceGroup.click();

    // replica legend에 노드 정보(@hostname)가 표시되는지 확인
    // ServiceLogViewer의 replica legend에 @nodeName 이 표시됨
    const nodeBadge = page.locator('text=/@/').first();
    await expect(nodeBadge).toBeVisible({ timeout: 10_000 });
  });

  test('/admin should be accessible', async ({ page }) => {
    const response = await page.goto('/admin');
    // Apache가 허용하고 gateway로 프록시 → SPA 200 응답
    expect(response?.status()).toBe(200);
  });

  test('/live-stream should be accessible from local', async ({ page }) => {
    // 테스트는 로컬(Docker 네트워크 내)에서 실행되므로 화이트리스트에 포함
    const response = await page.goto('/live-stream');
    expect(response?.status()).toBe(200);
  });

  test('/history should be accessible from local', async ({ page }) => {
    const response = await page.goto('/history');
    expect(response?.status()).toBe(200);
  });
});
```

**Step 2: Commit**

```bash
git add tests/e2e-swarm/log-viewer.spec.ts
git commit -m "feat: Playwright E2E 테스트 (Apache + Swarm 실시간 로그)"
```

---

### Task 6: Swarm E2E compose에서 relay 서비스 제거 (선택)

기존 `docker-compose.swarm-e2e.yml`에 `relay` 서비스가 있는데, relay 이미지가 없으면 stack deploy가 실패할 수 있다. relay 서비스가 E2E에 불필요하면 제거한다.

**Files:**
- Modify: `docker-compose.swarm-e2e.yml:70-86` (relay 서비스 블록)

**Step 1: relay 서비스 블록 + relay-data 볼륨 제거**

`docker-compose.swarm-e2e.yml`에서 `relay` 서비스(lines 70-86)와 `relay-data` 볼륨(line 93) 제거.

**Step 2: Commit**

```bash
git add docker-compose.swarm-e2e.yml
git commit -m "fix: E2E compose에서 relay 서비스 제거"
```

---

### Task 7: 전체 E2E 실행 및 검증

**Step 1: Swarm 환경 셋업**

Run: `bash scripts/e2e-swarm-setup.sh`
Expected: 2노드 Swarm 클러스터 + Apache(80) + 서비스 배포 완료

**Step 2: 수동 확인 (옵션)**

Run: `curl -s http://localhost:80 | head -20`
Expected: log-viewer HTML 반환

Run: `curl -s -H "Content-Type: application/json" -H "X-API-Key: test-api-key" -d '{"query":"{ containers { id name serviceName nodeName } }"}' http://localhost:80/graphql`
Expected: 컨테이너 목록 JSON 반환 (서비스별 2개 이상)

**Step 3: Playwright 테스트 실행**

Run: `pnpm test:e2e:swarm`
Expected: 모든 테스트 PASS

**Step 4: 정리**

Run: `bash scripts/e2e-swarm-teardown.sh`
Expected: 환경 정리 완료

---

### Task 8: 임시 UI 코드 정리

테스트 완료 후, 이 task에서 추가한 임시 UI 관련 코드가 있다면 정리한다. (이 계획에서는 실제 UI 페이지 코드를 추가하지 않았으므로, Apache 설정만 유지)

**Note:** `/admin`, `/live-stream`, `/history` 경로는 Apache에서 gateway로 프록시되며, gateway의 SPA fallback으로 200 응답을 반환한다. 별도 UI 페이지 구현 없이도 접근 제어 테스트가 가능하다.
