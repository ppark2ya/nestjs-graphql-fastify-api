# Daily ERROR Log Report Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Docker Swarm 환경에서 서비스별 ERROR 로그를 매일 오전 8시(영업일)에 수집하여 Slack으로 알림을 보내는 스크립트 및 배포 구성을 만든다.

**Architecture:** Swarm overlay network 내에 `error-reporter` 서비스(node:24-alpine + crond)를 추가하여, Node.js 단일 스크립트(.mjs)가 `tasks.log-streamer` DNS 디스커버리로 모든 log-streamer 인스턴스에 `/api/logs/search?level=ERROR` 요청을 보내고, 결과를 병합하여 Slack Incoming Webhook으로 전송한다.

**Tech Stack:** Node.js v24 (내장 `fetch`, `dns/promises`), BusyBox crond, Docker Swarm overlay network, Slack Incoming Webhook API

**Design Doc:** `docs/plans/2026-03-01-daily-error-report-design.md`

---

## Task 1: Node.js 스크립트 작성 — 환경변수 및 유틸리티

**Files:**
- Create: `scripts/daily-error-report.mjs`

**Step 1: 스크립트 기본 구조 작성**

`scripts/daily-error-report.mjs` 파일을 생성하고 환경변수 로드, 날짜 계산, 유틸리티 함수를 작성한다.

```javascript
#!/usr/bin/env node

/**
 * Daily ERROR Log Report
 *
 * Docker Swarm 환경에서 서비스별 ERROR 로그를 수집하여 Slack으로 알림을 보낸다.
 * cron으로 매일 오전 8시(월-금) 실행.
 *
 * 환경변수:
 *   SLACK_WEBHOOK_URL (필수) - Slack Incoming Webhook URL
 *   LOG_STREAMER_HOST       - DNS 디스커버리 호스트 (기본: tasks.log-streamer)
 *   LOG_STREAMER_PORT       - log-streamer 포트 (기본: 4003)
 *   REPORT_NO_ERRORS        - ERROR 0건일 때도 알림 전송 (기본: false)
 *
 * 의존성: 없음 (Node.js 내장 API만 사용)
 */

import { resolve4 } from 'node:dns/promises';

// --- Config ---

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const LOG_STREAMER_HOST = process.env.LOG_STREAMER_HOST || 'tasks.log-streamer';
const LOG_STREAMER_PORT = process.env.LOG_STREAMER_PORT || '4003';
const REPORT_NO_ERRORS = process.env.REPORT_NO_ERRORS === 'true';

if (!SLACK_WEBHOOK_URL) {
  console.error('[ERROR] SLACK_WEBHOOK_URL is required');
  process.exit(1);
}

// --- Utility ---

/** 전날 날짜를 YYYY-MM-DD 형식으로 반환 */
function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** HTTP GET 요청. 실패 시 null 반환 */
async function httpGet(url, timeoutMs = 10000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[WARN] GET ${url} failed: ${err.message}`);
    return null;
  }
}
```

**Step 2: 로컬에서 구문 확인**

Run: `node --check scripts/daily-error-report.mjs`
Expected: 에러 없이 종료

**Step 3: Commit**

```bash
git add scripts/daily-error-report.mjs
git commit -m "feat: add daily-error-report script skeleton with config and utils"
```

---

## Task 2: 로그 수집 로직 구현

**Files:**
- Modify: `scripts/daily-error-report.mjs`

**Step 1: DNS 디스커버리 + 앱 목록 조회 + ERROR 로그 수집 함수 추가**

`httpGet` 함수 아래에 다음 코드를 추가한다:

```javascript
// --- Log Collection ---

/** tasks.log-streamer DNS resolve → 모든 인스턴스 IP */
async function discoverInstances() {
  try {
    const ips = await resolve4(LOG_STREAMER_HOST);
    console.log(`[INFO] Discovered ${ips.length} log-streamer instance(s): ${ips.join(', ')}`);
    return ips;
  } catch (err) {
    console.error(`[ERROR] DNS resolve failed for ${LOG_STREAMER_HOST}: ${err.message}`);
    process.exit(1);
  }
}

/** 앱 목록 조회 (첫 번째 인스턴스에서) */
async function fetchApps(ips) {
  for (const ip of ips) {
    const data = await httpGet(`http://${ip}:${LOG_STREAMER_PORT}/api/logs/apps`);
    if (data?.apps) return data.apps.map((a) => a.name);
  }
  console.error('[ERROR] Failed to fetch app list from all instances');
  process.exit(1);
}

/**
 * 모든 인스턴스에서 특정 앱의 ERROR 로그 수집.
 * 노드별 결과를 병합하고 timestamp+message 기준으로 중복 제거.
 */
async function fetchErrors(ips, app, date) {
  const params = new URLSearchParams({
    app,
    from: date,
    to: date,
    level: 'ERROR',
    limit: '500',
  });

  const results = await Promise.all(
    ips.map((ip) => httpGet(`http://${ip}:${LOG_STREAMER_PORT}/api/logs/search?${params}`)),
  );

  // 병합 + 중복 제거 (timestamp + message)
  const seen = new Set();
  const merged = [];

  for (const data of results) {
    if (!data?.lines) continue;
    for (const line of data.lines) {
      const key = `${line.timestamp}|${line.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...line, node: data.node });
      }
    }
  }

  // timestamp 기준 정렬
  merged.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  return merged;
}
```

**Step 2: 구문 확인**

Run: `node --check scripts/daily-error-report.mjs`
Expected: 에러 없이 종료

**Step 3: Commit**

```bash
git add scripts/daily-error-report.mjs
git commit -m "feat(error-report): add DNS discovery and log collection logic"
```

---

## Task 3: Slack 메시지 포매팅 및 전송

**Files:**
- Modify: `scripts/daily-error-report.mjs`

**Step 1: Slack 메시지 포매팅 + 전송 + main 함수 추가**

로그 수집 함수 아래에 다음 코드를 추가한다:

```javascript
// --- Slack Notification ---

const SLACK_MAX_LENGTH = 39000; // Slack 제한 40,000자에서 여유분

/** 로그 라인을 텍스트 한 줄로 포매팅 */
function formatLogLine(line) {
  const time = line.timestamp ? line.timestamp.slice(11, 19) : '??:??:??';
  const source = line.source || '-';
  // 메시지에서 줄바꿈을 공백으로 치환 (Slack에서 한 줄로 표시)
  const msg = (line.message || '').split('\n')[0].slice(0, 200);
  return `${time} | ${source} | ${msg}`;
}

/** 앱별 ERROR 결과를 Slack mrkdwn 메시지로 포매팅 */
function buildSlackMessage(date, appResults) {
  const lines = [`*Daily ERROR Log Report (${date})*\n`];
  let totalErrors = 0;

  for (const { app, errors } of appResults) {
    if (errors.length === 0) {
      lines.push(`>:white_check_mark: *${app}* — ERROR 없음\n`);
      continue;
    }

    totalErrors += errors.length;
    lines.push(`>:red_circle: *${app}* (${errors.length}건)`);

    for (const line of errors) {
      lines.push(`>\`${formatLogLine(line)}\``);
    }
    lines.push('');
  }

  if (totalErrors === 0 && !REPORT_NO_ERRORS) return null;

  let text = lines.join('\n');

  // Slack 메시지 길이 제한
  if (text.length > SLACK_MAX_LENGTH) {
    text = text.slice(0, SLACK_MAX_LENGTH) + `\n\n... (메시지가 너무 길어 잘렸습니다)`;
  }

  return text;
}

/** Slack Incoming Webhook으로 전송 */
async function sendSlack(text) {
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    console.log('[INFO] Slack notification sent successfully');
  } catch (err) {
    console.error(`[ERROR] Failed to send Slack notification: ${err.message}`);
    process.exit(1);
  }
}

// --- Main ---

async function main() {
  const date = getYesterday();
  console.log(`[INFO] Scanning ERROR logs for ${date}`);

  const ips = await discoverInstances();
  const apps = await fetchApps(ips);
  console.log(`[INFO] Found ${apps.length} app(s): ${apps.join(', ')}`);

  const appResults = [];
  for (const app of apps) {
    const errors = await fetchErrors(ips, app, date);
    appResults.push({ app, errors });
    if (errors.length > 0) {
      console.log(`[INFO] ${app}: ${errors.length} ERROR(s)`);
    }
  }

  const text = buildSlackMessage(date, appResults);
  if (!text) {
    console.log('[INFO] No errors found. Skipping notification.');
    return;
  }

  await sendSlack(text);
}

main().catch((err) => {
  console.error(`[ERROR] Unexpected error: ${err.message}`);
  process.exit(1);
});
```

**Step 2: 구문 확인**

Run: `node --check scripts/daily-error-report.mjs`
Expected: 에러 없이 종료

**Step 3: Commit**

```bash
git add scripts/daily-error-report.mjs
git commit -m "feat(error-report): add Slack formatting, notification, and main entry"
```

---

## Task 4: crontab 설정 파일 생성

**Files:**
- Create: `scripts/crontab-error-report`

**Step 1: crontab 파일 생성**

```
# 월-금 오전 8시 (KST, TZ=Asia/Seoul 설정 필요)
0 8 * * 1-5 node /app/daily-error-report.mjs >> /proc/1/fd/1 2>> /proc/1/fd/2
```

> `/proc/1/fd/1`로 stdout을, `/proc/1/fd/2`로 stderr를 리다이렉트하면 `docker service logs`에서 출력을 확인할 수 있다.

**Step 2: 파일 끝에 빈 줄 확인**

crontab 파일은 반드시 마지막에 빈 줄(newline)로 끝나야 한다. 빈 줄이 없으면 crond가 마지막 항목을 무시할 수 있다.

**Step 3: Commit**

```bash
git add scripts/crontab-error-report
git commit -m "feat(error-report): add crontab schedule file for daily error report"
```

---

## Task 5: Docker Compose 배포 구성 수정

**Files:**
- Modify: `docker-compose.yml` (프로덕션 Stack)
- Modify: `docker-stack.test.yml` (테스트 Stack)

**Step 1: `docker-compose.yml`에 error-reporter 서비스 추가**

`auth` 서비스와 `networks` 섹션 사이에 다음을 추가한다:

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
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: "0.1"
          memory: 64M
        reservations:
          cpus: "0.05"
          memory: 32M
      restart_policy:
        condition: on-failure
        delay: 30s
        max_attempts: 3
    networks:
      - app-network
```

**Step 2: `docker-stack.test.yml`에 error-reporter 서비스 추가**

`relay` 서비스와 `networks` 섹션 사이에 동일한 서비스를 추가한다. 네트워크 이름만 `test-overlay`로 변경:

```yaml
  error-reporter:
    image: node:24-alpine
    command: crond -f -d 8
    volumes:
      - ./scripts/crontab-error-report:/etc/crontabs/root:ro
      - ./scripts/daily-error-report.mjs:/app/daily-error-report.mjs:ro
    environment:
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-https://hooks.slack.com/services/test}
      - LOG_STREAMER_HOST=tasks.log-streamer
      - LOG_STREAMER_PORT=4003
      - TZ=Asia/Seoul
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: "0.1"
          memory: 64M
        reservations:
          cpus: "0.05"
          memory: 32M
      restart_policy:
        condition: on-failure
        delay: 30s
        max_attempts: 3
    networks:
      - test-overlay
```

**Step 3: Commit**

```bash
git add docker-compose.yml docker-stack.test.yml
git commit -m "feat(error-report): add error-reporter service to Docker Swarm stacks"
```

---

## Task 6: 로컬 수동 테스트

**Files:** 없음 (기존 파일만 사용)

**Step 1: 스크립트 단독 실행 테스트 (log-streamer 없이)**

DNS resolve 실패가 정상적으로 처리되는지 확인:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/test \
LOG_STREAMER_HOST=localhost \
node scripts/daily-error-report.mjs
```

Expected: `[ERROR] DNS resolve failed for localhost` 출력 후 exit 1

**Step 2: 로컬 log-streamer가 있는 경우 통합 테스트**

`docker-compose.local.yml`로 log-streamer를 실행 중이라면:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/test \
LOG_STREAMER_HOST=localhost \
LOG_STREAMER_PORT=4003 \
node scripts/daily-error-report.mjs
```

> DNS resolve4는 `localhost`를 resolve하지 못하므로, 로컬 테스트 시에는 `LOG_STREAMER_HOST`에 `127.0.0.1`을 사용하거나, 스크립트의 `discoverInstances()`를 임시로 수정하여 IP 배열을 직접 반환하도록 한다.

**Step 3: Slack Webhook 실제 전송 테스트**

실제 Slack Webhook URL이 있다면:

```bash
# 직접 webhook 테스트
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"테스트 메시지"}' \
  https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Slack 채널에 메시지가 도착하면 성공.

---

## Task 7: CLAUDE.md 업데이트 (선택)

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 프로젝트 개요 또는 관련 섹션에 error-reporter 설명 추가**

`docker-compose.yml` 설명이 있는 섹션에 `error-reporter` 서비스에 대한 간단한 설명을 추가한다:

```markdown
- **Error Reporter**: Docker Swarm 내 cron 컨테이너. 매일 오전 8시(영업일) 전날 ERROR 로그를 수집하여 Slack으로 알림 전송. `scripts/daily-error-report.mjs` 실행.
```

환경변수 섹션에도 추가:

```markdown
**Error Reporter**:
- `SLACK_WEBHOOK_URL` (필수): Slack Incoming Webhook URL
- `LOG_STREAMER_HOST` (`tasks.log-streamer`): DNS 디스커버리 호스트
- `LOG_STREAMER_PORT` (`4003`): log-streamer 포트
- `TZ` (`Asia/Seoul`): 타임존
- `REPORT_NO_ERRORS` (`false`): ERROR 0건일 때도 알림 전송 여부
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add error-reporter service description to CLAUDE.md"
```
