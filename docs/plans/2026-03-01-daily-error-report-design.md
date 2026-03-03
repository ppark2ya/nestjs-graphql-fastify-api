# Daily ERROR Log Report Design

## Overview

Docker Swarm 이중화 환경(2노드)에서 서비스별 ERROR 로그를 매일 오전 8시(영업일)에 수집하여 Slack으로 알림을 보내는 기능.

## 결정 사항

| 항목 | 결정 |
|------|------|
| 로그 소스 | 로그 파일 (`/opt/logs/{app}/`) |
| 스캔 대상 | 앱 디렉토리 단위 (gateway, auth, relay 등) |
| 스캔 주기 | 매일 오전 8시, 월-금 (영업일) |
| 스캔 범위 | 전날 00:00 ~ 23:59 |
| 노티 내용 | 앱별 전체 ERROR 로그 내용 포함 |
| 메신저 | Slack (Incoming Webhook), Mattermost는 추후 확장 |
| 구현 언어 | Node.js (.mjs 단일 파일, npm 의존성 없음) |
| 스케줄링 | Docker Swarm 내 cron 컨테이너 (node:24-alpine + crond) |
| 멀티 노드 | `tasks.log-streamer` DNS 디스커버리로 전체 인스턴스 개별 호출 |

## Architecture

```
┌─────────────────────────────────────────────────┐
│               Docker Swarm (overlay network)    │
│                                                 │
│  ┌──────────────┐     ┌──────────────────────┐  │
│  │ log-streamer │     │ log-streamer          │  │
│  │  (node 1)    │     │  (node 2)             │  │
│  │  :4003       │     │  :4003                │  │
│  └──────┬───────┘     └──────────┬────────────┘  │
│         │   GET /api/logs/search │               │
│         │   ?level=ERROR         │               │
│         │   &from=YYYY-MM-DD     │               │
│  ┌──────┴────────────────────────┴────────────┐  │
│  │         error-reporter (node:24-alpine)     │  │
│  │         replicas: 1, crond                  │  │
│  │                                             │  │
│  │  crontab: 0 8 * * 1-5 (KST)               │  │
│  │  → node /app/daily-error-report.mjs         │  │
│  │    1. DNS resolve tasks.log-streamer        │  │
│  │    2. GET /api/logs/apps (앱 목록)          │  │
│  │    3. GET /api/logs/search per app per node │  │
│  │    4. merge & deduplicate results           │  │
│  │    5. format Slack message                  │  │
│  │    6. POST Slack Incoming Webhook           │  │
│  └─────────────────────────────────────────────┘  │
│                         │                         │
└─────────────────────────┼─────────────────────────┘
                          │ HTTPS
                          ▼
                   ┌─────────────┐
                   │    Slack    │
                   └─────────────┘
```

## Script Logic (`scripts/daily-error-report.mjs`)

### 1. 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `SLACK_WEBHOOK_URL` | (필수) | Slack Incoming Webhook URL |
| `LOG_STREAMER_HOST` | `tasks.log-streamer` | DNS 디스커버리 호스트 |
| `LOG_STREAMER_PORT` | `4003` | log-streamer 포트 |
| `TZ` | `Asia/Seoul` | 타임존 |
| `REPORT_NO_ERRORS` | `false` | ERROR 0건일 때도 알림 전송 여부 |

### 2. 실행 흐름

```
1. 환경변수 로드 및 검증 (SLACK_WEBHOOK_URL 필수)
2. 전날 날짜 계산 (YYYY-MM-DD)
3. DNS resolve: dns.resolve4(LOG_STREAMER_HOST) → IP 목록
4. 첫 번째 인스턴스에 GET /api/logs/apps → 앱 목록 획득
5. 각 앱 × 각 인스턴스에 병렬로 GET /api/logs/search 호출
   - params: app={app}, from={yesterday}, to={yesterday}, level=ERROR, limit=500
6. 결과 병합 (timestamp + message 기준 중복 제거)
7. 앱별로 정렬 및 Slack 메시지 포매팅
8. Slack Incoming Webhook으로 POST
```

### 3. 에러 처리

- log-streamer 인스턴스 접속 실패 → 해당 노드 건너뛰기, 다른 노드 결과 계속 수집
- DNS resolve 실패 → 에러 로그 출력 후 종료 (exit 1)
- Slack webhook 전송 실패 → stderr 에러 출력 (Docker 서비스 로그에서 확인)
- 전날 ERROR 0건 → `REPORT_NO_ERRORS=true`면 "ERROR 없음" 알림 전송, 아니면 스킵

### 4. Slack 메시지 포맷

```
📋 일일 ERROR 로그 리포트 (2026-02-28)

🔴 gateway (3건)
━━━━━━━━━━━━━━━━━━━━━
10:23:45 | c.e.GatewayService | Connection timeout to auth-server
14:05:12 | c.e.CircuitBreaker | Circuit opened for domain: auth-server
18:30:01 | c.e.AxiosService | ECONNREFUSED 10.0.1.5:4001

🔴 auth (1건)
━━━━━━━━━━━━━━━━━━━━━
22:15:33 | c.e.AuthService | JWT private key file not found

✅ relay — ERROR 없음
```

- Slack 메시지 길이 제한 (40,000자) 초과 시 → 마지막에 "...외 N건" 표시 후 잘라냄

## Docker Swarm 배포

### docker-compose.yml 추가 서비스

```yaml
error-reporter:
  image: node:24-alpine
  command: crond -f -d 8
  volumes:
    - ./scripts/crontab-error-report:/etc/crontabs/root:ro
    - ./scripts/daily-error-report.mjs:/app/daily-error-report.mjs:ro
  environment:
    - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
    - LOG_STREAMER_HOST=tasks.log-streamer
    - LOG_STREAMER_PORT=4003
    - TZ=Asia/Seoul
  networks:
    - app-network
  deploy:
    replicas: 1
    restart_policy:
      condition: on-failure
```

### crontab 파일 (`scripts/crontab-error-report`)

```
0 8 * * 1-5 node /app/daily-error-report.mjs >> /proc/1/fd/1 2>> /proc/1/fd/2
```

> `/proc/1/fd/1`로 리다이렉트하면 Docker 로그에 출력됨

## 파일 목록

| 파일 | 유형 | 설명 |
|------|------|------|
| `scripts/daily-error-report.mjs` | 신규 | 메인 스크립트 (Node.js, 단일 파일, 의존성 없음) |
| `scripts/crontab-error-report` | 신규 | crontab 설정 파일 |
| `docker-compose.yml` | 수정 | `error-reporter` 서비스 추가 |
| `docker-stack.test.yml` | 수정 | 테스트 환경에도 `error-reporter` 추가 |

## 확장 가능성

- **Mattermost 지원**: Mattermost도 Incoming Webhook 방식이 거의 동일 (URL만 변경). `MATTERMOST_WEBHOOK_URL` 환경변수 추가로 확장 가능
- **WARN 레벨 포함**: `level` 파라미터를 환경변수화하여 WARN 포함 가능
- **앱 필터링**: 특정 앱만 모니터링하도록 `APPS` 환경변수 추가 가능
