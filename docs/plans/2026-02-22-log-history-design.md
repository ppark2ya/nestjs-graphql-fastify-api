# Log History 서비스 설계

## 목표

파일 기반 로그(Log4j2 PatternLayout, Next.js JSON)를 UI에서 검색/조회할 수 있는 히스토리 서비스를 구축한다. 추가 DB 없이, 기존 Log-Streamer를 확장하여 호스트 로그 파일을 직접 읽는 방식으로 구현한다.

## 제약 조건

- DB 추가 불가
- Docker Swarm 2노드, 각 노드 로컬 디스크에 로그 저장 (비공유)
- 로그 파일 경로: `/opt/logs/{app-name}/*.log`
- 단일 로그 파일 최대 크기: 10MB
- 날짜 접미사 로테이션: `app.2024-01-15.log`

## 로그 포맷

### Spring (Log4j2 PatternLayout)

```
2024-01-15 10:30:45.123 INFO  c.e.MyClass - User logged in
```

필드: timestamp, level, source(class), message

### Next.js (JSON)

```json
{"timestamp":"2024-01-15T10:30:45","level":"info","msg":"request completed"}
```

필드: timestamp, level, message

### 파서 전략

1. 첫 줄이 `{`로 시작 → JSON 파서
2. 그 외 → Log4j2 PatternLayout 정규식
3. 파싱 실패 → message에 원본 라인, 나머지 null

## 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│  UI (/history) — shadcn/ui + Apollo Client                   │
│  필터: 앱 │ 날짜 범위 │ 레벨 │ 키워드 │ 노드                  │
│  요약 바 + 로그 라인 목록 (페이지네이션 100줄)                 │
└──────────────────────┬───────────────────────────────────────┘
                       │ GraphQL Query (Apollo useQuery)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Gateway (NestJS)                                            │
│  LogHistoryModule: Resolver + Service                        │
│  - tasks.log-streamer DNS로 모든 replica IP 발견             │
│  - 각 log-streamer에 병렬 HTTP 요청 (Axios + CircuitBreaker) │
│  - 노드별 결과 병합 + 타임스탬프 정렬                         │
└──────────┬─────────────────────────────┬─────────────────────┘
           │                             │
           ▼                             ▼
┌────────────────────┐      ┌────────────────────┐
│  log-streamer      │      │  log-streamer      │
│  (Node 1)          │      │  (Node 2)          │
│  /opt/logs/ mount  │      │  /opt/logs/ mount  │
│  REST endpoints    │      │  REST endpoints    │
└────────────────────┘      └────────────────────┘
```

## Log-Streamer 새 REST API

| Method | Path | 설명 | 파라미터 |
|--------|------|------|----------|
| GET | `/api/logs/apps` | 앱 목록 | - |
| GET | `/api/logs/files` | 로그 파일 목록 | `app`, `from`, `to` |
| GET | `/api/logs/search` | 로그 검색 | `app`, `from`, `to`, `level`, `keyword`, `cursor`, `limit` |
| GET | `/api/logs/stats` | 요약 통계 | `app`, `from`, `to` |

### /api/logs/search 응답

```json
{
  "lines": [
    {
      "timestamp": "2024-01-15 10:30:45.123",
      "level": "ERROR",
      "source": "c.e.OrderService",
      "message": "Order failed",
      "file": "app.2024-01-15.log",
      "lineNo": 1520
    }
  ],
  "node": "swarm-node-1",
  "total": 2340,
  "cursor": "app.2024-01-15.log:1620",
  "hasMore": true
}
```

### /api/logs/stats 응답

```json
{
  "node": "swarm-node-1",
  "totalLines": 15420,
  "errorCount": 234,
  "warnCount": 1520,
  "infoCount": 12000,
  "debugCount": 1666,
  "fileCount": 8
}
```

### 대용량 파일 처리

- `bufio.Scanner`로 라인 단위 스트림 읽기 (메모리 최소)
- 전체 파일을 메모리에 올리지 않음
- 커서 기반 페이지네이션: `파일명:라인번호`
- 서버사이드 필터링: level, keyword 필터 후 limit개만 반환

## Gateway GraphQL 스키마

```graphql
type LogLine {
  timestamp: String      # nullable — 파싱 불가 시 null
  level: String          # nullable
  source: String         # nullable
  message: String!       # 필수 — 파싱 실패 시 원본 라인 전체
  node: String!          # 필수
  file: String!          # 필수
}

type LogSummary {
  totalLines: Int!
  errorCount: Int!
  warnCount: Int!
  infoCount: Int!
  fileCount: Int!
}

type LogSearchResult {
  lines: [LogLine!]!
  total: Int!
  hasMore: Boolean!
  cursor: String
  summary: LogSummary!
}

type LogApp {
  name: String!
  node: String!
}

input LogSearchInput {
  app: String!
  from: String!          # YYYY-MM-DD
  to: String!            # YYYY-MM-DD
  level: String          # ERROR, WARN, INFO, DEBUG
  keyword: String
  node: String           # 특정 노드만 조회
  cursor: String
  limit: Int             # 기본 100
}

type Query {
  logApps: [LogApp!]!
  logSearch(input: LogSearchInput!): LogSearchResult!
}
```

## Gateway 집계 로직

```typescript
async search(input: LogSearchInput): Promise<LogSearchResult> {
  // 1. DNS resolve로 모든 log-streamer 인스턴스 발견
  const hosts = await dns.resolve4('tasks.log-streamer');

  // 2. 노드 필터 적용
  const targets = input.node
    ? hosts.filter(h => matchNode(h, input.node))
    : hosts;

  // 3. 병렬 요청 (CircuitBreaker)
  const results = await Promise.all(
    targets.map(host =>
      this.circuitBreaker.fire('log-history', () =>
        this.axios.get(`http://${host}:4003/api/logs/search`, { params: input })
      )
    )
  );

  // 4. 결과 병합 + 타임스탬프 정렬
  return mergeResults(results);
}
```

## UI (/history 페이지)

### 기술 스택

- **컴포넌트**: shadcn/ui (Button, Input, Select, Table, Badge 등)
- **데이터**: Apollo Client `useQuery`
- **라우팅**: react-router-dom (/ → live-stream, /history → 히스토리)
- **추가 의존성**: class-variance-authority, clsx, tailwind-merge

### 컴포넌트 구조

```
App.tsx (BrowserRouter)
├── / → LiveStreamPage (기존 ContainerList + LogViewer)
└── /history → HistoryPage
    ├── FilterBar
    │   ├── AppSelector (Select)
    │   ├── DateRangePicker (Input type="date" x2)
    │   ├── LevelFilter (toggle buttons)
    │   ├── KeywordInput (Input)
    │   └── NodeFilter (Select)
    ├── SummaryBar (Badge x4: total, error, warn, info)
    └── LogTable (Table + Pagination)
```

### 필터 요소

| 요소 | shadcn/ui 컴포넌트 | 설명 |
|------|-------------------|------|
| 앱 선택 | Select | /api/logs/apps 목록에서 선택 |
| 날짜 범위 | Input (date) x2 | from ~ to (기본: 오늘) |
| 로그 레벨 | Toggle Group | ERROR / WARN / INFO / DEBUG 다중 선택 |
| 키워드 | Input | 서버사이드 grep |
| 노드 | Select | Swarm 노드 선택 (기본: 전체) |

### 로그 테이블

- 컬럼: timestamp, level (컬러 Badge), source, message, node, file
- 레벨 컬러: ERROR=red, WARN=yellow, INFO=green, DEBUG=gray
- 페이지네이션: 이전/다음 버튼 + "1-100 of 2,340" 표시

## Docker Compose 변경

```yaml
log-streamer:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - /opt/logs:/opt/logs:ro  # 추가
  environment:
    - LOG_DIR=/opt/logs       # 추가
```

## 선택한 접근법

**Approach 1: Log-Streamer 확장 (파일 리더 추가)**

이유:
- 새 서비스 없음, 기존 아키텍처 자연스러운 확장
- DB/Redis 추가 부하 없음
- 날짜 접미사 로테이션으로 파일명만으로 날짜 필터링 가능
- bufio.Scanner 스트림 처리로 10MB 파일도 메모리 부담 없음
- 추후 인메모리 인덱스(Approach 3)로 점진 확장 가능
