# Nginx Proxy Service Design

## Overview

Gateway에서 담당하던 UI 정적 파일 서빙을 별도 Nginx 서비스로 분리하고, `/admin` 경로에 대한 IP whitelist를 Nginx에서 처리한다. Apache 서버 설정 변경을 최소화하면서 whitelist 관리 권한을 확보하는 것이 목적이다.

## Background

- 현재 Apache 서버가 리버스 프록시로 Gateway(:4000)에 요청을 포워딩
- `/admin` 경로에 대해 Apache에서 IP whitelist를 적용 중이나, Apache는 전사 공용이라 설정 변경 부담
- Gateway가 `@fastify/static`으로 UI 빌드 결과물(`dist/apps/ui/`)을 직접 서빙 중

## Architecture

### Before (현재)
```
Client → Apache → Gateway (:4000)
                    ├─ /graphql (API)
                    ├─ /admin/* (Apache에서 IP whitelist)
                    └─ /* (정적 파일 + SPA fallback)
```

### After (변경 후)
```
Client → Apache (pass-through) → Nginx (:4000) → Gateway (:4000 내부)
                                      │
                                      ├─ /admin/*  → IP whitelist → SPA (index.html)
                                      ├─ /graphql  → proxy_pass gateway:4000 (HTTP + WS)
                                      ├─ /api/*    → proxy_pass gateway:4000
                                      └─ /*        → React 정적 파일 / SPA fallback
```

### Key Changes
- **Nginx 서비스 추가**: UI 빌드 결과물을 포함하는 Docker 이미지, Swarm 서비스로 배포
- **Gateway 변경**: 정적 파일 서빙 코드 제거 (API 전용)
- **Gateway 포트**: 외부 노출 제거 (Nginx 뒤에서 내부 통신만)
- **Apache**: 포워딩 대상을 Nginx로 변경 (포트 동일하므로 IP만 변경)

## CORS Analysis

### 현재 문제
Apache → Gateway 구조에서 브라우저가 cross-origin으로 인식할 수 있음.

### Nginx 도입 후
- 브라우저 → Apache → Nginx에서 SPA와 `/graphql` API를 **같은 origin**에서 제공
- 모든 요청이 same-origin이 되므로 **CORS 이슈 해결**
- Gateway의 `app.enableCors()`는 유지해도 무방 (내부 통신에 영향 없음)

## IP Whitelist

### 실제 클라이언트 IP 확보
- Apache `mod_proxy`는 기본적으로 `X-Forwarded-For` 헤더 자동 추가 (`ProxyAddHeaders On` 기본값, Apache 2.4.6+)
- Nginx에서 `real_ip_header X-Forwarded-For` + `set_real_ip_from <Apache IP>`로 추출
- 배포 후 Nginx 로그로 `$http_x_forwarded_for` 확인 필요
- 없는 경우 Apache에 `RequestHeader set X-Forwarded-For "%{REMOTE_ADDR}s"` 한 줄 추가 요청

### Whitelist 적용
```nginx
# whitelist.conf (별도 파일)
geo $admin_allowed {
    default        0;
    192.168.1.0/24 1;   # 사내 IP
    10.0.0.0/8     1;   # VPN
}
```

```nginx
location /admin {
    if ($admin_allowed = 0) {
        return 403;
    }
    root /usr/share/nginx/html;
    try_files $uri /index.html;
}
```

## Nginx Docker Image

### Dockerfile (`docker/nginx/Dockerfile`)
- Multi-stage 빌드: `node:24-alpine` → UI 빌드 → `nginx:1.27-alpine` → 정적 파일 복사
- `nginx.conf`, `whitelist.conf` 포함

### Nginx Configuration (`docker/nginx/nginx.conf`)

| Location | 동작 |
|----------|------|
| `/admin` | IP whitelist 체크 → 허용 시 SPA fallback, 거부 시 403 |
| `/graphql` | Gateway proxy (HTTP + WebSocket upgrade 지원, timeout 86400s) |
| `/api` | Gateway proxy |
| `/` | 정적 파일 서빙 + SPA fallback (`try_files $uri $uri/ /index.html`) |

WebSocket 지원: `proxy_http_version 1.1`, `Upgrade`, `Connection "upgrade"` 헤더 설정.

## Docker Compose Changes

### 추가: `nginx` 서비스
```yaml
nginx:
  image: ${DOCKER_REPO_NGINX}:${TAG:-latest}
  ports:
    - target: 80
      published: 4000    # 기존 Gateway 외부 포트 유지
      protocol: tcp
      mode: host
  depends_on: [gateway]
  networks:
    - app-network
```

### 변경: `gateway` 서비스
- `ports` 섹션 제거 (외부 노출 X, 내부 overlay 네트워크 통신만)
- 나머지 설정 유지

## Gateway Code Changes

### `apps/gateway/src/main.ts`
- `@fastify/static` 플러그인 등록 코드 제거
- SPA fallback `GET /*` 라우트 제거
- `readFileSync`, `existsSync`, `join` 등 관련 import 정리

### `package.json`
- `@fastify/static` 의존성 제거 (선택)

## CI/CD (Drone)

### 추가: Nginx 파이프라인
```yaml
kind: pipeline
type: docker
name: nginx

trigger:
  branch: [main, develop]
  event: [push, tag]

steps:
  - name: build-and-push
    image: plugins/docker
    settings:
      repo: { from_secret: docker_repo_nginx }
      dockerfile: docker/nginx/Dockerfile
      tags: ["${DRONE_TAG}", "latest"]
```

### 기존 Gateway 파이프라인
- UI 빌드 의존성 제거 가능 (Nginx 이미지에서 UI 빌드)

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| Create | `docker/nginx/Dockerfile` | Nginx Docker 이미지 (UI 빌드 포함) |
| Create | `docker/nginx/nginx.conf` | Nginx 설정 |
| Create | `docker/nginx/whitelist.conf` | IP whitelist 설정 |
| Modify | `apps/gateway/src/main.ts` | 정적 파일 서빙 코드 제거 |
| Modify | `docker-compose.yml` | nginx 서비스 추가, gateway 포트 제거 |
| Modify | `.drone.yml` | nginx 빌드 파이프라인 추가 |
| Modify | `docker-stack.test.yml` | 테스트 환경에 nginx 추가 (선택) |
