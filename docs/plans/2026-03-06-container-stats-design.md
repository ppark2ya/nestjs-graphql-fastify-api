# Container Stats Monitoring Design

## Summary

LiveStream 페이지의 ContainerList 사이드바에 각 컨테이너의 CPU 사용률과 메모리 사용량을 실시간으로 표시한다. 기존 `Log Streamer → Gateway → UI` 프록시 패턴을 따르며, REST 폴링(10초) 방식으로 데이터를 수집한다.

## Architecture

```
Docker ContainerStats API (one-shot, stream=false)
  → Log Streamer: GET /api/stats (새 엔드포인트, goroutine 병렬 조회)
  → Gateway: GraphQL Query containerStats (멀티노드 병합, Circuit Breaker)
  → UI: Apollo pollInterval 10초 polling
  → ContainerList: 컨테이너명 아래 서브텍스트 + 상태 dot 색상 코딩
```

## Data Model

### ContainerStats

| Field | Type | Description |
|-------|------|-------------|
| id | string | 컨테이너 12-char short ID |
| name | string | 컨테이너 이름 |
| cpuPercent | float64 | CPU 사용률 (%) |
| memUsage | uint64 | 현재 메모리 사용량 (bytes) |
| memLimit | uint64 | 메모리 제한 (bytes) |

## Layer Design

### 1. Log Streamer (Go)

**Docker Client** (`internal/docker/client.go`):
- `ContainerStats` 구조체 추가
- `GetAllContainerStats(ctx) ([]ContainerStats, error)` 메서드 추가
- Docker SDK `ContainerStats(ctx, id, false)` 사용 (one-shot, non-streaming)
- running 상태 컨테이너만 대상
- goroutine으로 병렬 조회 후 결과 합산
- CPU% 계산: `(delta_cpu / delta_system) * numCPU * 100`

**REST Handler** (`internal/handler/stats.go`):
- `GET /api/stats` 엔드포인트
- `dockerClient.GetAllContainerStats()` 호출 → JSON 배열 반환

**Response Example**:
```json
[
  { "id": "abc123", "name": "gateway.1", "cpuPercent": 3.2, "memUsage": 134217728, "memLimit": 536870912 },
  { "id": "def456", "name": "auth.1", "cpuPercent": 1.8, "memUsage": 100663296, "memLimit": 536870912 }
]
```

### 2. Gateway (NestJS)

**GraphQL Model** (`models/container-stats.model.ts`):
```typescript
@ObjectType()
export class ContainerStats {
  @Field() id: string;
  @Field() name: string;
  @Field(() => Float) cpuPercent: number;
  @Field(() => Float) memUsage: number;
  @Field(() => Float) memLimit: number;
}
```

**Resolver**: `LogStreamerProxyResolver`에 `@Query(() => [ContainerStats]) containerStats()` 추가

**Service**: `LogStreamerProxyService.getContainerStats()` — 기존 `listContainers()`와 동일한 패턴 (멀티노드 병렬 호출 → 결과 병합, Circuit Breaker, ID 중복 제거)

### 3. UI (React)

**GraphQL Query**:
```graphql
query ContainerStats {
  containerStats { id name cpuPercent memUsage memLimit }
}
```
- `pollInterval: 10_000` (10초)

**ContainerList 변경**:
- `containerStats`를 `Map<containerId, stats>`로 변환
- 각 컨테이너 렌더링 시 이름 아래 서브텍스트 행 추가: `CPU 3.2% · 128/512MB`
- stats 없는 경우 (stopped 컨테이너): 서브텍스트 미표시

**상태 dot 색상 코딩**:

| 조건 | 색상 | 의미 |
|------|------|------|
| CPU < 50% AND Mem < 70% | 녹색 | 정상 |
| CPU >= 50% OR Mem >= 70% | 노란색 | 주의 |
| CPU >= 80% OR Mem >= 90% | 빨간색 | 위험 |

- running + stats 데이터 있을 때만 적용, stopped는 기존 회색 유지

**포맷팅**:
- CPU: 소수점 1자리 (e.g., `3.2%`)
- 메모리: 자동 단위 변환 (e.g., `128MB`, `1.2GB`)
- 메모리 표시 형식: `사용량/제한` (e.g., `128/512MB`)

## Decisions

- **REST 폴링 선택**: WebSocket 스트림 대비 구현이 간단하고, 10초 간격 stats 수집에 실시간성이 불필요
- **별도 query 분리**: 기존 `containers` query (30초 폴링)에 stats를 합치면 성능 저하. 독립 query로 분리하여 각각의 폴링 주기 유지
- **Gateway 프록시 경유**: 기존 아키텍처 패턴(Circuit Breaker, 멀티노드 병합, API Key 인증) 활용
- **서브텍스트 표시**: 사이드바 폭 제약으로 인라인 대신 컨테이너명 아래 별도 줄에 표시

## Files to Modify

### New Files
- `apps/log-streamer/internal/handler/stats.go` — Stats REST handler
- `apps/gateway/src/log-streamer-proxy/models/container-stats.model.ts` — GraphQL ObjectType

### Modified Files
- `apps/log-streamer/internal/docker/client.go` — `ContainerStats` struct, `GetAllContainerStats()`
- `apps/log-streamer/internal/router/router.go` — `/api/stats` 라우트 등록
- `apps/gateway/src/log-streamer-proxy/log-streamer-proxy.service.ts` — `getContainerStats()`
- `apps/gateway/src/log-streamer-proxy/log-streamer-proxy.resolver.ts` — `containerStats` query
- `apps/ui/src/features/live-stream/graphql.ts` — `CONTAINER_STATS_QUERY`
- `apps/ui/src/features/live-stream/components/ContainerList.tsx` — stats 표시 + 색상 코딩
