# ECS JSON 로그 포맷 통일 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Winston 로그 파일 출력을 ECS(Elastic Common Schema) JSON 포맷으로 변경하고, log-streamer JSONParser가 ECS 필드를 인식하도록 확장한다.

**Architecture:** `@elastic/ecs-winston-format` 패키지로 파일 transport의 JSON 포맷을 ECS로 교체한다. `context` → `log.logger`, `trace` → `error.stack_trace` 필드 매핑을 커스텀 format으로 처리한다. `@timestamp`는 KST ISO 8601로 오버라이드한다. log-streamer JSONParser는 ECS 필드명을 우선 인식하되 기존 포맷도 하위 호환 유지한다.

**Tech Stack:** `@elastic/ecs-winston-format@1.5.3`, Winston 3.x, Go (log-streamer parser)

---

### Task 1: `@elastic/ecs-winston-format` 패키지 설치

**Files:**
- Modify: `package.json`

**Step 1: 패키지 설치**

Run: `pnpm add @elastic/ecs-winston-format`

**Step 2: 설치 확인**

Run: `pnpm list @elastic/ecs-winston-format`
Expected: `@elastic/ecs-winston-format 1.5.3`

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @elastic/ecs-winston-format package"
```

---

### Task 2: Winston 파일 transport에 ECS format 적용

**Files:**
- Modify: `libs/shared/src/common/logger/winston-logger.service.ts`

**Step 1: ECS format 적용 + 커스텀 매핑**

`winston-logger.service.ts` 변경사항:

```typescript
import { Injectable, LoggerService } from '@nestjs/common';
import { existsSync, mkdirSync, renameSync } from 'fs';
import { basename, join } from 'path';
import * as winston from 'winston';
import ecsFormat = require('@elastic/ecs-winston-format');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import DailyRotateFile = require('winston-daily-rotate-file');

// 레벨별 컬러 매핑
const levelColors: Record<string, string> = {
  error: '\x1b[31m', // red
  warn: '\x1b[33m', // yellow
  info: '\x1b[32m', // green
  debug: '\x1b[34m', // blue
  verbose: '\x1b[36m', // cyan
};
const resetColor = '\x1b[0m';

const nestLikeConsoleFormat = winston.format.printf((info) => {
  const { level, message, timestamp, context, ...meta } = info;
  const pid = process.pid;
  const color = levelColors[level] || '';
  const formattedLevel = `${color}${level.toUpperCase().padEnd(7)}${resetColor}`;
  const ctxLabel = typeof context === 'string' ? context : '';
  const contextStr = ctxLabel ? `\x1b[33m[${ctxLabel}]\x1b[0m ` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const ts = typeof timestamp === 'string' ? timestamp : '';

  // NestJS 스타일: [Nest] PID - TIMESTAMP LOG [Context] Message
  return `[Nest] ${pid} - ${ts} ${formattedLevel} ${contextStr}${String(message)}${metaStr}`;
});

const koreaTimestamp = winston.format.timestamp({
  format: () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }),
});

// ECS 필드 매핑: context → log.logger, trace → error.stack_trace
const ecsFieldMapping = winston.format((info) => {
  if (info.context) {
    info['log.logger'] = info.context;
    delete info.context;
  }
  if (info.trace) {
    info['error.stack_trace'] = info.trace;
    delete info.trace;
  }
  return info;
});

// @timestamp를 KST ISO 8601로 오버라이드
const kstTimestamp = winston.format((info) => {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset);
  info['@timestamp'] = kst.toISOString().replace('Z', '+09:00');
  return info;
});

const ARCHIVE_DIR = 'logs/archive';

@Injectable()
export class WinstonLoggerService implements LoggerService {
  private logger: winston.Logger;
  private context?: string;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      transports: [
        // 콘솔: NestJS 스타일 포맷 (변경 없음)
        new winston.transports.Console({
          format: winston.format.combine(koreaTimestamp, nestLikeConsoleFormat),
        }),
        // 파일: ECS JSON 포맷
        this.createFileTransport(),
      ],
    });
  }

  private createFileTransport(): DailyRotateFile {
    // archive 디렉토리 생성
    if (!existsSync(ARCHIVE_DIR)) {
      mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    const serviceName = process.env.SERVICE_NAME || 'app';

    const transport = new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '14d',
      format: winston.format.combine(
        ecsFieldMapping(),
        ecsFormat({ apmIntegration: false }),
        kstTimestamp(),
        // service.name 추가
        winston.format((info) => {
          info['service.name'] = serviceName;
          return info;
        })(),
      ),
    });

    // 로테이션 시 archive 디렉토리로 이동
    transport.on('rotate', (oldFilename: string) => {
      const fileName = basename(oldFilename);
      const archivePath = join(ARCHIVE_DIR, fileName);
      try {
        renameSync(oldFilename, archivePath);
      } catch {
        // 파일이 이미 이동되었거나 존재하지 않을 경우 무시
      }
    });

    return transport;
  }

  // ... (나머지 메서드는 변경 없음)
}
```

핵심 변경:
- `ecsFieldMapping()`: `context` → `log.logger`, `trace` → `error.stack_trace` 매핑 (ECS format 전에 실행)
- `ecsFormat({ apmIntegration: false })`: ECS JSON 포맷 적용 (`@timestamp`, `log.level`, `ecs.version`, `process.pid` 자동 추가)
- `kstTimestamp()`: `@timestamp`를 KST ISO 8601로 오버라이드 (ECS format 후에 실행)
- `service.name`: 환경변수 `SERVICE_NAME`으로 주입

출력 예시:
```json
{"@timestamp":"2026-03-06T15:09:17.123+09:00","log.level":"info","message":"POST /graphql 200","ecs.version":"8.11.0","process.pid":12345,"log.logger":"HTTP","service.name":"gateway","correlationId":"abc-123","method":"POST","statusCode":200}
```

**Step 2: 빌드 확인**

Run: `pnpm run build`
Expected: 빌드 성공 (타입 에러 없음)

**Step 3: 로컬 실행으로 출력 확인**

Run: `SERVICE_NAME=gateway pnpm run start:gateway:dev`
Expected: 콘솔은 기존 NestJS 스타일, `logs/app-*.log` 파일은 ECS JSON

**Step 4: Commit**

```bash
git add libs/shared/src/common/logger/winston-logger.service.ts
git commit -m "feat(shared): apply ECS JSON format to Winston file transport

- Add ecsFormat for file transport (console unchanged)
- Map context → log.logger, trace → error.stack_trace
- Override @timestamp to KST ISO 8601
- Add service.name from SERVICE_NAME env var"
```

---

### Task 3: log-streamer JSONParser ECS 필드 인식 - 테스트 작성

**Files:**
- Modify: `apps/log-streamer/internal/logreader/parser_test.go`

**Step 1: ECS format 테스트 추가**

`parser_test.go`에 다음 테스트 추가:

```go
func TestJSONParserECSFormat(t *testing.T) {
	p := &JSONParser{}
	line := `{"@timestamp":"2026-03-06T15:09:17.123+09:00","log.level":"info","message":"POST /graphql 200","ecs.version":"8.11.0","process.pid":12345,"log.logger":"HTTP","service.name":"gateway","correlationId":"abc-123"}`
	result := p.Parse(line)

	if result.Timestamp != "2026-03-06T15:09:17.123+09:00" {
		t.Errorf("timestamp = %q, want %q", result.Timestamp, "2026-03-06T15:09:17.123+09:00")
	}
	if result.Level != "INFO" {
		t.Errorf("level = %q, want %q", result.Level, "INFO")
	}
	if result.Source != "HTTP" {
		t.Errorf("source = %q, want %q", result.Source, "HTTP")
	}
	if result.Message != "POST /graphql 200" {
		t.Errorf("message = %q, want %q", result.Message, "POST /graphql 200")
	}

	// ECS 메타 키는 metadata에서 제외
	var meta map[string]any
	if err := json.Unmarshal([]byte(result.Metadata), &meta); err != nil {
		t.Fatalf("metadata JSON parse error: %v", err)
	}
	if _, ok := meta["ecs.version"]; ok {
		t.Error("metadata should not contain ecs.version")
	}
	if _, ok := meta["process.pid"]; ok {
		t.Error("metadata should not contain process.pid")
	}
	if _, ok := meta["service.name"]; ok {
		t.Error("metadata should not contain service.name")
	}
	if _, ok := meta["log.level"]; ok {
		t.Error("metadata should not contain log.level")
	}
	if _, ok := meta["log.logger"]; ok {
		t.Error("metadata should not contain log.logger")
	}
	// correlationId는 metadata에 포함
	if meta["correlationId"] != "abc-123" {
		t.Errorf("metadata correlationId = %v, want %q", meta["correlationId"], "abc-123")
	}
}

func TestJSONParserECSErrorFormat(t *testing.T) {
	p := &JSONParser{}
	line := `{"@timestamp":"2026-03-06T15:09:17.123+09:00","log.level":"error","message":"Request failed","log.logger":"HTTP","error.stack_trace":"Error: timeout\n  at Object.<anonymous>","service.name":"gateway"}`
	result := p.Parse(line)

	if result.Level != "ERROR" {
		t.Errorf("level = %q, want %q", result.Level, "ERROR")
	}
	if result.Source != "HTTP" {
		t.Errorf("source = %q, want %q", result.Source, "HTTP")
	}

	var meta map[string]any
	if err := json.Unmarshal([]byte(result.Metadata), &meta); err != nil {
		t.Fatalf("metadata JSON parse error: %v", err)
	}
	// error.stack_trace는 metadata에 포함 (검색 가능)
	if meta["error.stack_trace"] == nil {
		t.Error("metadata should contain error.stack_trace")
	}
}

func TestJSONParserECSSpringFormat(t *testing.T) {
	// Spring ecs-logging-java 출력 형식
	p := &JSONParser{}
	line := `{"@timestamp":"2026-03-06T15:09:17.123+09:00","log.level":"INFO","message":"User logged in","ecs.version":"8.11.0","process.thread.name":"http-nio-8080-exec-1","log.logger":"c.e.s.MyService","service.name":"my-spring-app","correlationId":"abc-123","userId":"user01"}`
	result := p.Parse(line)

	if result.Timestamp != "2026-03-06T15:09:17.123+09:00" {
		t.Errorf("timestamp = %q", result.Timestamp)
	}
	if result.Level != "INFO" {
		t.Errorf("level = %q, want %q", result.Level, "INFO")
	}
	if result.Source != "c.e.s.MyService" {
		t.Errorf("source = %q, want %q", result.Source, "c.e.s.MyService")
	}

	var meta map[string]any
	if err := json.Unmarshal([]byte(result.Metadata), &meta); err != nil {
		t.Fatalf("metadata JSON parse error: %v", err)
	}
	if meta["correlationId"] != "abc-123" {
		t.Errorf("correlationId = %v", meta["correlationId"])
	}
	if meta["userId"] != "user01" {
		t.Errorf("userId = %v", meta["userId"])
	}
}

// 기존 포맷 하위 호환성 테스트
func TestJSONParserLegacyFormatStillWorks(t *testing.T) {
	p := &JSONParser{}
	line := `{"timestamp":"2026-03-06 15:09:17","level":"info","message":"POST /graphql 200","context":"HTTP","correlationId":"abc-123"}`
	result := p.Parse(line)

	if result.Timestamp != "2026-03-06 15:09:17" {
		t.Errorf("timestamp = %q", result.Timestamp)
	}
	if result.Level != "INFO" {
		t.Errorf("level = %q, want %q", result.Level, "INFO")
	}
	if result.Message != "POST /graphql 200" {
		t.Errorf("message = %q", result.Message)
	}
}
```

**Step 2: 테스트 실행 - 실패 확인**

Run: `cd apps/log-streamer && go test ./internal/logreader/ -run "TestJSONParserECS" -v`
Expected: `TestJSONParserECSFormat` 실패 (`log.level`, `log.logger` 키를 인식하지 못함)

**Step 3: Commit (실패 테스트)**

```bash
git add apps/log-streamer/internal/logreader/parser_test.go
git commit -m "test(log-streamer): add ECS JSON format parser tests"
```

---

### Task 4: log-streamer JSONParser ECS 필드 인식 - 구현

**Files:**
- Modify: `apps/log-streamer/internal/logreader/parser.go`

**Step 1: `jsonStandardKeys`에 ECS 키 추가**

```go
// JSON 표준 키 (metadata에서 제외)
var jsonStandardKeys = map[string]bool{
	// 기존 (하위 호환)
	"timestamp": true, "@timestamp": true, "time": true,
	"level": true, "severity": true,
	"logger": true, "source": true, "name": true, "module": true,
	"msg": true, "message": true,
	// ECS 표준 키
	"log.level": true, "log.logger": true,
	"ecs.version": true,
	"process.pid": true, "process.thread.name": true,
	"service.name": true,
}
```

**Step 2: `JSONParser.Parse()`에서 ECS 키 우선 인식**

```go
func (p *JSONParser) Parse(line string) LogLine {
	var data map[string]any
	if err := json.Unmarshal([]byte(line), &data); err != nil {
		return LogLine{Message: line}
	}

	result := LogLine{
		Timestamp: firstStr(data, "@timestamp", "timestamp", "time"),
		Level:     strings.ToUpper(firstStr(data, "log.level", "level", "severity")),
		Source:    firstStr(data, "log.logger", "logger", "source", "name", "module"),
		Message:   firstStr(data, "message", "msg"),
	}

	// 표준 키 외 추가 필드를 metadata로 수집
	meta := make(map[string]any)
	for k, v := range data {
		if !jsonStandardKeys[k] {
			meta[k] = v
		}
	}
	if len(meta) > 0 {
		if b, err := json.Marshal(meta); err == nil {
			result.Metadata = string(b)
		}
	}

	return result
}
```

변경 핵심:
- `firstStr` 호출에서 ECS 키를 기존 키보다 **앞에** 배치 (우선 인식)
- `jsonStandardKeys`에 ECS 메타 키 추가 (metadata에서 제외)
- 기존 키도 유지하여 **하위 호환성** 보장

**Step 3: 테스트 실행 - 성공 확인**

Run: `cd apps/log-streamer && go test ./internal/logreader/ -v`
Expected: 전체 테스트 PASS (기존 테스트 + ECS 테스트 모두)

**Step 4: Commit**

```bash
git add apps/log-streamer/internal/logreader/parser.go
git commit -m "feat(log-streamer): support ECS JSON field names in JSONParser

- Add ECS keys to jsonStandardKeys (log.level, log.logger, ecs.version, etc.)
- Prioritize ECS keys in Parse() field extraction
- Maintain backward compatibility with legacy format"
```

---

### Task 5: 환경변수 문서화 및 최종 검증

**Files:**
- Modify: `CLAUDE.md` (환경변수 섹션)

**Step 1: CLAUDE.md 환경변수에 SERVICE_NAME 추가**

Gateway 환경변수 섹션에 추가:
```
- `SERVICE_NAME` (`gateway`/`auth`): ECS 로그의 service.name 필드
```

**Step 2: 전체 빌드 확인**

Run: `pnpm run build`
Expected: 전체 빌드 성공

**Step 3: log-streamer 전체 테스트**

Run: `cd apps/log-streamer && go test ./... -v`
Expected: 전체 PASS

**Step 4: gateway 테스트**

Run: `pnpm run test:e2e:gateway`
Expected: E2E 테스트 PASS

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add SERVICE_NAME env var for ECS logging"
```

---

## 변경 요약

| 파일 | 변경 | 비고 |
|------|------|------|
| `package.json` | `@elastic/ecs-winston-format` 추가 | |
| `libs/shared/.../winston-logger.service.ts` | 파일 transport ECS format 적용 | 콘솔 변경 없음 |
| `apps/log-streamer/.../parser.go` | ECS 필드 인식 추가 | 하위 호환 유지 |
| `apps/log-streamer/.../parser_test.go` | ECS format 테스트 추가 | |
| `CLAUDE.md` | SERVICE_NAME 환경변수 문서화 | |

## 배포 순서

1. **log-streamer 먼저 배포** (하위 호환 — 기존+ECS 모두 인식)
2. **NestJS 앱 배포** (ECS format 출력 시작)
3. **Spring 앱 EcsLayout 적용** (별도 repo, 별도 배포)
