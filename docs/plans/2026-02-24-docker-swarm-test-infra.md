# Docker Swarm 통합 테스트 인프라 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Docker Swarm 환경에서 전체 서비스(redis, mysql, gateway, auth, log-streamer, relay)를 이중화 배포하여 로그 스트리밍 통합 테스트 가능하게 만든다.

**Architecture:** 단일 Docker Stack으로 모든 서비스를 하나의 overlay network에 배치. 인프라(redis, mysql)는 replicas=1, 애플리케이션(gateway, auth, log-streamer, relay)은 replicas=2로 이중화. MySQL 초기화는 init SQL 스크립트로 처리.

**Tech Stack:** Docker Swarm, Docker Compose v3.8, MySQL 8, Redis 7, Node.js 24, Go 1.24

---

### Task 1: MySQL 초기화 SQL 작성

**Files:**
- Create: `scripts/docker/init-auth-db.sql`

**Step 1: auth DB 초기화 SQL 생성**

`apps/auth/src/database/schema.ts`의 Drizzle 스키마를 기반으로 MySQL 초기화 SQL을 작성한다. auth 서비스는 앱 시작 시 자동 마이그레이션을 하지 않으므로 컨테이너 초기화 시 테이블을 생성해야 한다.

```sql
-- scripts/docker/init-auth-db.sql
CREATE DATABASE IF NOT EXISTS auth;
USE auth;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  roles VARCHAR(1024) NOT NULL DEFAULT 'user',
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_secret VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  jti VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_tokens_user_id (user_id),
  INDEX idx_refresh_tokens_jti (jti)
);

-- 테스트용 사용자 (password: 'test1234' bcrypt hash)
INSERT INTO users (username, password_hash, roles)
VALUES ('admin', '$2b$10$PLACEHOLDER_HASH', 'admin')
ON DUPLICATE KEY UPDATE username = username;
```

> 참고: bcrypt 해시는 `scripts/swarm-test-up.sh`에서 실제 값으로 대체하거나, 배포 후 auth API로 사용자를 생성할 수 있다. 초기 테스트 사용자 없이 빈 테이블만 생성해도 무방하다.

**Step 2: Commit**

```bash
git add scripts/docker/init-auth-db.sql
git commit -m "chore: add MySQL init SQL for Docker Swarm test"
```

---

### Task 2: docker-stack.test.yml 작성

**Files:**
- Create: `docker-stack.test.yml`

**Step 1: Stack compose 파일 작성**

```yaml
version: "3.8"

# Docker Swarm 통합 테스트 환경
# 사용법:
#   1. scripts/swarm-test-up.sh 실행 (빌드 + 배포 자동화)
#   2. 또는 수동: docker stack deploy -c docker-stack.test.yml test-app

services:
  # --- 인프라 ---
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: "0.25"
          memory: 128M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s
    networks:
      - test-overlay

  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: auth
      MYSQL_USER: authuser
      MYSQL_PASSWORD: authpassword
    volumes:
      - mysql-data:/var/lib/mysql
    configs:
      - source: init-auth-db
        target: /docker-entrypoint-initdb.d/init-auth-db.sql
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
        reservations:
          cpus: "0.1"
          memory: 128M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-prootpassword"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - test-overlay

  # --- 애플리케이션 ---
  auth:
    image: auth:test
    environment:
      - NODE_ENV=production
      - AUTH_PORT=4001
      - AUTH_HTTP_PORT=4001
      - AUTH_TCP_PORT=4002
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_USERNAME=authuser
      - DB_PASSWORD=authpassword
      - DB_DATABASE=auth
      - JWT_PUBLIC_KEY_PATH=/run/secrets/jwt_public_key
      - JWT_PRIVATE_KEY_PATH=/run/secrets/jwt_private_key
    secrets:
      - jwt_public_key
      - jwt_private_key
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
        reservations:
          cpus: "0.1"
          memory: 64M
    networks:
      - test-overlay

  log-streamer:
    image: log-streamer:test
    environment:
      - LOG_STREAMER_PORT=4003
      - LOG_DIR=/opt/logs
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /opt/logs:/opt/logs:ro
    deploy:
      replicas: 2
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
      test: ["CMD", "wget", "-q", "-O", "-", "http://localhost:4003/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
    networks:
      - test-overlay

  gateway:
    image: gateway:test
    ports:
      - target: 4000
        published: 4000
        protocol: tcp
        mode: ingress
    environment:
      - NODE_ENV=production
      - PORT=4000
      - AUTH_SERVER_URL=http://auth:4001
      - LOG_STREAMER_URL=http://log-streamer:4003
      - LOG_STREAMER_WS_URL=ws://log-streamer:4003/ws/logs
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - API_KEYS=test-api-key
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
      rollback_config:
        parallelism: 1
        delay: 5s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
    healthcheck:
      test: ["CMD-SHELL", "wget -q --header='Content-Type: application/json' --post-data='{\"query\":\"{ health }\"}' -O - http://localhost:4000/graphql | grep -q '\"health\"' || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    volumes:
      - /var/log/app/gateway:/app/logs
    networks:
      - test-overlay

  relay:
    image: relay:test
    ports:
      - target: 8080
        published: 8080
        protocol: tcp
        mode: ingress
    volumes:
      - relay-data:/data
    environment:
      - DB_PATH=/data/relay.db
      - PORT=8080
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        order: start-first
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: "1"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - test-overlay

networks:
  test-overlay:
    driver: overlay
    attachable: true

volumes:
  redis-data:
  mysql-data:
  relay-data:

secrets:
  jwt_public_key:
    file: ./keys/public.pem
  jwt_private_key:
    file: ./keys/private.pem

configs:
  init-auth-db:
    file: ./scripts/docker/init-auth-db.sql
```

> 핵심 포인트:
> - secrets를 `file:` 방식으로 선언하여 `docker stack deploy` 시 자동 등록 (external 불필요)
> - configs로 MySQL init SQL을 `/docker-entrypoint-initdb.d/`에 마운트
> - gateway의 `AUTH_SERVER_URL`은 auth 서비스 DNS명 사용
> - log-streamer DNS 디스커버리: gateway에서 `tasks.log-streamer`로 멀티 노드 접근

**Step 2: Commit**

```bash
git add docker-stack.test.yml
git commit -m "chore: add Docker Swarm test stack compose"
```

---

### Task 3: 빌드 및 배포 자동화 스크립트

**Files:**
- Create: `scripts/swarm-test-up.sh`

**Step 1: swarm-test-up.sh 작성**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Docker Swarm 통합 테스트 환경 구성 스크립트
# 사용법: bash scripts/swarm-test-up.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELAY_ROOT="$HOME/workspace/relay"
STACK_NAME="test-app"

echo "=== Docker Swarm 통합 테스트 환경 구성 ==="
echo "프로젝트 루트: $PROJECT_ROOT"
echo ""

# 1. Docker Swarm 초기화
echo "--- [1/5] Docker Swarm 초기화 ---"
if ! docker info 2>/dev/null | grep -q "Swarm: active"; then
  echo "Swarm 활성화 중..."
  docker swarm init || true
else
  echo "Swarm 이미 활성화됨"
fi
echo ""

# 2. 로그 디렉토리 생성
echo "--- [2/5] 로그 디렉토리 생성 ---"
sudo mkdir -p /opt/logs /var/log/app/gateway
echo "생성 완료: /opt/logs, /var/log/app/gateway"
echo ""

# 3. Docker 이미지 빌드
echo "--- [3/5] Docker 이미지 빌드 ---"

echo "[3a] gateway 빌드..."
docker build -f "$PROJECT_ROOT/apps/gateway/Dockerfile" -t gateway:test "$PROJECT_ROOT"

echo "[3b] auth 빌드..."
docker build -f "$PROJECT_ROOT/apps/auth/Dockerfile" -t auth:test "$PROJECT_ROOT"

echo "[3c] log-streamer 빌드..."
docker build -f "$PROJECT_ROOT/apps/log-streamer/Dockerfile" -t log-streamer:test "$PROJECT_ROOT/apps/log-streamer"

echo "[3d] relay 빌드..."
docker build -t relay:test "$RELAY_ROOT"

echo "이미지 빌드 완료"
echo ""

# 4. 기존 스택 제거 (존재하는 경우)
echo "--- [4/5] 기존 스택 정리 ---"
if docker stack ls 2>/dev/null | grep -q "$STACK_NAME"; then
  echo "기존 $STACK_NAME 스택 제거 중..."
  docker stack rm "$STACK_NAME"
  echo "서비스 정리 대기 (15초)..."
  sleep 15
fi
echo ""

# 5. Stack 배포
echo "--- [5/5] Stack 배포 ---"
docker stack deploy -c "$PROJECT_ROOT/docker-stack.test.yml" "$STACK_NAME"
echo ""

# 상태 확인
echo "=== 배포 완료 ==="
echo ""
echo "서비스 상태 확인 (수렴까지 약 30-60초 소요):"
echo "  docker stack services $STACK_NAME"
echo "  docker stack ps $STACK_NAME"
echo ""
echo "접속:"
echo "  Gateway:  http://localhost:4000"
echo "  GraphQL:  http://localhost:4000/graphql"
echo "  Relay:    http://localhost:8080"
echo ""
echo "로그 확인:"
echo "  docker service logs -f ${STACK_NAME}_gateway"
echo "  docker service logs -f ${STACK_NAME}_auth"
echo "  docker service logs -f ${STACK_NAME}_log-streamer"
echo "  docker service logs -f ${STACK_NAME}_relay"
echo ""
echo "테스트:"
echo "  bash scripts/load-test.sh"
echo "  node scripts/test-subscription.js test-redis"
echo ""
echo "종료: bash scripts/swarm-test-down.sh"
```

**Step 2: 실행 권한 부여**

```bash
chmod +x scripts/swarm-test-up.sh
```

**Step 3: Commit**

```bash
git add scripts/swarm-test-up.sh
git commit -m "chore: add Swarm test environment setup script"
```

---

### Task 4: 정리 스크립트

**Files:**
- Create: `scripts/swarm-test-down.sh`

**Step 1: swarm-test-down.sh 작성**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Docker Swarm 통합 테스트 환경 정리 스크립트
# 사용법: bash scripts/swarm-test-down.sh

STACK_NAME="test-app"

echo "=== Docker Swarm 테스트 환경 정리 ==="

# 1. Stack 제거
echo "--- [1/3] Stack 제거 ---"
if docker stack ls 2>/dev/null | grep -q "$STACK_NAME"; then
  docker stack rm "$STACK_NAME"
  echo "서비스 정리 대기 (15초)..."
  sleep 15
else
  echo "스택 없음, 건너뜀"
fi

# 2. 볼륨 정리
echo "--- [2/3] 볼륨 정리 ---"
for vol in ${STACK_NAME}_redis-data ${STACK_NAME}_mysql-data ${STACK_NAME}_relay-data; do
  if docker volume ls -q | grep -q "^${vol}$"; then
    docker volume rm "$vol" && echo "삭제: $vol" || echo "삭제 실패 (사용 중): $vol"
  fi
done

# 3. Swarm 비활성화 (선택)
echo ""
echo "--- [3/3] Swarm 비활성화 ---"
read -p "Docker Swarm을 비활성화할까요? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  docker swarm leave --force
  echo "Swarm 비활성화 완료"
else
  echo "Swarm 유지"
fi

echo ""
echo "=== 정리 완료 ==="
```

**Step 2: 실행 권한 부여**

```bash
chmod +x scripts/swarm-test-down.sh
```

**Step 3: Commit**

```bash
git add scripts/swarm-test-down.sh
git commit -m "chore: add Swarm test environment teardown script"
```

---

### Task 5: 검증

**Step 1: 스크립트 실행하여 전체 환경 구성**

```bash
bash scripts/swarm-test-up.sh
```

빌드에 수 분 소요. 완료 후:

**Step 2: 서비스 상태 확인**

```bash
docker stack services test-app
```

Expected: 모든 서비스 REPLICAS가 목표치에 도달 (redis 1/1, mysql 1/1, gateway 2/2, auth 2/2, log-streamer 2/2, relay 2/2)

**Step 3: 헬스체크**

```bash
# Gateway GraphQL
curl -s -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: test-api-key' \
  -d '{"query":"{ health }"}' | grep health

# Relay
curl -s http://localhost:8080/health
```

**Step 4: 로그 스트리밍 테스트**

```bash
# Log Streamer 컨테이너 목록 (gateway 경유)
curl -s -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: test-api-key' \
  -d '{"query":"{ containers { id name state } }"}'

# GraphQL Subscription 테스트
node scripts/test-subscription.js test-redis
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: Docker Swarm test infrastructure setup complete"
```
