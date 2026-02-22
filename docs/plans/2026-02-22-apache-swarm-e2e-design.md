# Apache Reverse Proxy + DinD 2-Node Swarm E2E 설계

## 개요

운영 환경과 동일하게 Apache reverse proxy를 앞단에 두고, Docker Swarm 2노드 환경에서 log-viewer UI의 실시간 로그 확인 기능을 E2E 테스트한다.

## 아키텍처

```
[Playwright Browser]
       │
       ▼ http://localhost:80
  ┌──────────┐
  │  Apache   │  mod_proxy + mod_proxy_wstunnel
  │  (host)   │  IP-based access control per path
  └────┬──────┘
       │ overlay network (app-network)
  ┌────▼──────────────────────────────┐
  │        Docker Swarm (overlay)      │
  │                                    │
  │  Manager (local Docker)            │
  │   ├─ gateway replica 1            │
  │   ├─ log-streamer replica 1       │
  │   └─ redis                        │
  │                                    │
  │  Worker (DinD container)           │
  │   ├─ gateway replica 2            │
  │   └─ log-streamer replica 2       │
  └────────────────────────────────────┘
```

## Apache 설정

### Reverse Proxy

- `mod_proxy`, `mod_proxy_http`, `mod_proxy_wstunnel` 활성화
- `/graphql` → `gateway:4000/graphql` (HTTP + WebSocket)
- `/` → `gateway:4000/` (log-viewer SPA 정적 파일)
- `RewriteEngine`으로 WebSocket upgrade 감지 후 `ws://` 프록시

### 경로별 접근 제어

| 경로 | 접근 제어 |
|------|----------|
| `/admin` | 모든 IP 허용 (`Require all granted`) |
| `/live-stream` | 화이트리스트 (`Require ip 127.0.0.1 172.0.0.0/8 10.0.0.0/8 192.168.0.0/16`) |
| `/history` | 화이트리스트 (동일) |
| 기타 | 기본 허용 |

## DinD 2노드 구성

1. `docker swarm init` (manager)
2. `docker:dind` 컨테이너 실행 (privileged) → worker 노드
3. `docker swarm join --token <worker-token>` 으로 클러스터 합류
4. `docker save` → `docker load`로 이미지 worker에 전파
5. `docker stack deploy`로 서비스 배포

## Playwright E2E 시나리오

1. Apache(80) 경유 log-viewer UI 접속
2. 컨테이너 목록 로드 확인 (Swarm 서비스 포함)
3. 서비스 그룹 클릭 → 2개 replica 표시 확인
4. 실시간 로그 수신 확인 (GraphQL Subscription over WebSocket)
5. nodeName 필드로 다른 노드 로그도 수신되는지 확인
6. `/admin` 경로 접근 가능 확인
7. `/live-stream`, `/history` 경로 접근 제어 확인

## 파일 목록

| 파일 | 설명 |
|------|------|
| `docker/apache/httpd.conf` | Apache reverse proxy + 접근 제어 설정 |
| `docker/apache/Dockerfile` | Apache 이미지 빌드 |
| `docker-compose.e2e-full.yml` | DinD worker + Apache + Swarm 서비스 |
| `scripts/e2e-swarm-setup.sh` | Swarm init, 이미지 빌드/로드, stack deploy |
| `scripts/e2e-swarm-teardown.sh` | 정리 스크립트 |
| `tests/e2e-swarm/playwright.config.ts` | Playwright 설정 |
| `tests/e2e-swarm/log-viewer.spec.ts` | E2E 테스트 |

## 참고

- E2E 테스트용 임시 UI 페이지(/admin, /live-stream, /history)는 테스트 후 제거
- Apache 설정은 운영 환경 참조용으로 유지
