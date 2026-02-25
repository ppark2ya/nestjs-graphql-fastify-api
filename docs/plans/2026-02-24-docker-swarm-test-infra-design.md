# Docker Swarm 통합 테스트 인프라 설계

## 목적

로그 스트리밍 서비스를 포함한 전체 시스템을 Docker Swarm 환경에서 이중화하여 통합 테스트.

## 아키텍처

단일 Stack (`test-app`)으로 모든 서비스를 하나의 overlay network에 배치.

```
[Stack: test-app]
├── redis (1 replica) — PubSub, 캐시
├── mysql (1 replica) — auth DB
├── gateway (2 replicas) → redis, auth, log-streamer
├── auth (2 replicas) → mysql, jwt secrets
├── log-streamer (2 replicas) → docker.sock, /opt/logs
└── relay (2 replicas) → SQLite (볼륨)

Network: test-overlay (overlay, attachable)
Secrets: jwt_public_key, jwt_private_key (file-based)
```

## 서비스 상세

### 인프라 서비스

| 서비스 | 이미지 | 레플리카 | 포트 | 비고 |
|--------|--------|----------|------|------|
| redis | redis:7-alpine | 1 | 6379 (internal) | appendonly, healthcheck |
| mysql | mysql:8 | 1 | 3306 (internal) | 환경변수로 DB/유저 자동 생성 |

### 애플리케이션 서비스

| 서비스 | 이미지 | 레플리카 | 포트 | 의존성 |
|--------|--------|----------|------|--------|
| gateway | gateway:test | 2 | 4000 (ingress) | redis, auth, log-streamer |
| auth | auth:test | 2 | 내부만 | mysql, jwt secrets |
| log-streamer | log-streamer:test | 2 | 내부만 | docker.sock, /opt/logs |
| relay | relay:test | 2 | 8080 (ingress) | SQLite (볼륨) |

## 구현 산출물

1. `docker-stack.test.yml` — Swarm stack compose 파일
2. `scripts/swarm-test-up.sh` — 빌드 + Swarm init + secrets + stack deploy 자동화
3. `scripts/swarm-test-down.sh` — 정리 스크립트

## 이미지 빌드 전략

- gateway: `docker build -f apps/gateway/Dockerfile -t gateway:test .` (프로젝트 루트에서)
- auth: `docker build -f apps/auth/Dockerfile -t auth:test .` (프로젝트 루트에서)
- log-streamer: `docker build -f apps/log-streamer/Dockerfile -t log-streamer:test apps/log-streamer/`
- relay: `docker build -t relay:test ~/workspace/relay/`

## 네트워킹

- 모든 서비스가 `test-overlay` network에 참여
- 서비스 디스커버리: Docker Swarm DNS (서비스명으로 접근)
- gateway → `http://auth:4001`, `http://log-streamer:4003`, `ws://log-streamer:4003/ws/logs`
- auth → `mysql:3306`
- log-streamer DNS 디스커버리: `tasks.log-streamer`로 멀티 노드 접근

## JWT Secrets

- `keys/private.pem`, `keys/public.pem` → Docker secret으로 등록
- 이미 존재하면 skip

## MySQL 초기화

- `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` 환경변수로 자동 초기화
- auth 서비스가 Drizzle로 스키마 push (앱 시작 시)

## 외부 접근

- Gateway: `http://localhost:4000` (GraphQL + UI)
- Relay: `http://localhost:8080`
