# Container Stats Monitoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** LiveStream 사이드바에 각 컨테이너의 CPU/메모리 사용량을 표시하고, 리소스 사용량에 따라 상태 dot 색상을 코딩한다.

**Architecture:** Log Streamer(Go)에 Docker ContainerStats API 기반 `GET /api/stats` 엔드포인트 추가 → Gateway에서 멀티노드 병합 후 GraphQL `containerStats` query 제공 → UI에서 10초 폴링으로 ContainerList에 서브텍스트 표시.

**Tech Stack:** Go (Docker SDK v23), NestJS (Code-First GraphQL), React (Apollo Client, Tailwind CSS)

**Design Doc:** `docs/plans/2026-03-06-container-stats-design.md`

---

### Task 1: Log Streamer — Docker Client stats 수집

**Files:**
- Modify: `apps/log-streamer/internal/docker/client.go`

**Step 1: `ContainerStats` 구조체 추가**

`client.go`의 `ContainerInfo` 구조체(line 19-30) 아래에 추가:

```go
type ContainerStats struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	CPUPercent float64 `json:"cpuPercent"`
	MemUsage   uint64  `json:"memUsage"`
	MemLimit   uint64  `json:"memLimit"`
}
```

**Step 2: `GetAllContainerStats` 메서드 구현**

`Ping` 메서드(line 177-182) 아래에 추가. import에 `"encoding/json"`, `"log/slog"` 추가:

```go
func (c *Client) GetAllContainerStats(ctx context.Context) ([]ContainerStats, error) {
	c.mu.RLock()
	containers, err := c.cli.ContainerList(ctx, types.ContainerListOptions{All: false})
	c.mu.RUnlock()
	if err != nil {
		return nil, err
	}

	type result struct {
		stats ContainerStats
		err   error
	}

	ch := make(chan result, len(containers))
	var wg sync.WaitGroup

	for _, ctr := range containers {
		if ctr.State != "running" {
			continue
		}
		wg.Add(1)
		go func(ctr types.Container) {
			defer wg.Done()

			c.mu.RLock()
			resp, err := c.cli.ContainerStats(ctx, ctr.ID, false)
			c.mu.RUnlock()
			if err != nil {
				slog.Warn("stats failed", "container", ctr.ID[:12], "error", err)
				ch <- result{err: err}
				return
			}
			defer resp.Body.Close()

			var v types.StatsJSON
			if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
				ch <- result{err: err}
				return
			}

			name := ""
			if len(ctr.Names) > 0 {
				name = ctr.Names[0]
				if len(name) > 0 && name[0] == '/' {
					name = name[1:]
				}
			}

			cpuPercent := calculateCPUPercent(&v)

			ch <- result{stats: ContainerStats{
				ID:         ctr.ID[:12],
				Name:       name,
				CPUPercent: cpuPercent,
				MemUsage:   v.MemoryStats.Usage,
				MemLimit:   v.MemoryStats.Limit,
			}}
		}(ctr)
	}

	go func() {
		wg.Wait()
		close(ch)
	}()

	var stats []ContainerStats
	for r := range ch {
		if r.err == nil {
			stats = append(stats, r.stats)
		}
	}
	return stats, nil
}

func calculateCPUPercent(v *types.StatsJSON) float64 {
	cpuDelta := float64(v.CPUStats.CPUUsage.TotalUsage - v.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(v.CPUStats.SystemUsage - v.PreCPUStats.SystemUsage)
	if systemDelta <= 0 || cpuDelta < 0 {
		return 0.0
	}
	numCPUs := float64(v.CPUStats.OnlineCPUs)
	if numCPUs == 0 {
		numCPUs = float64(len(v.CPUStats.CPUUsage.PercpuUsage))
	}
	if numCPUs == 0 {
		numCPUs = 1.0
	}
	return (cpuDelta / systemDelta) * numCPUs * 100.0
}
```

**Step 3: Log Streamer Go 빌드 확인**

Run: `cd apps/log-streamer && go build ./...`
Expected: 빌드 성공 (에러 없음)

**Step 4: Commit**

```bash
git add apps/log-streamer/internal/docker/client.go
git commit -m "feat(log-streamer): add Docker container stats collection"
```

---

### Task 2: Log Streamer — Stats REST 엔드포인트

**Files:**
- Create: `apps/log-streamer/internal/handler/stats.go`
- Modify: `apps/log-streamer/internal/router/router.go`

**Step 1: Stats handler 생성**

기존 `containers.go` 패턴을 따라 작성:

```go
// apps/log-streamer/internal/handler/stats.go
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

func ContainerStats(dockerClient *docker.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		stats, err := dockerClient.GetAllContainerStats(r.Context())
		if err != nil {
			slog.Error("get container stats failed", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "failed to get container stats: " + err.Error(),
			})
			return
		}

		if stats == nil {
			stats = []docker.ContainerStats{}
		}

		slog.Debug("container stats", "count", len(stats))
		json.NewEncoder(w).Encode(stats)
	}
}
```

**Step 2: 라우터에 엔드포인트 등록**

`router.go`의 `/api` 라우트 블록(line 24-33)에서 containers 라우트 아래에 추가:

```go
r.Get("/stats", handler.ContainerStats(dockerClient))
```

기존 코드:
```go
r.Route("/api", func(r chi.Router) {
    r.Get("/containers", handler.Containers(dockerClient))
    // ... logs routes
})
```

변경 후:
```go
r.Route("/api", func(r chi.Router) {
    r.Get("/containers", handler.Containers(dockerClient))
    r.Get("/stats", handler.ContainerStats(dockerClient))
    // ... logs routes
})
```

**Step 3: 빌드 확인**

Run: `cd apps/log-streamer && go build ./...`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add apps/log-streamer/internal/handler/stats.go apps/log-streamer/internal/router/router.go
git commit -m "feat(log-streamer): add GET /api/stats endpoint"
```

---

### Task 3: Gateway — ContainerStats GraphQL 모델

**Files:**
- Create: `apps/gateway/src/log-streamer-proxy/models/container-stats.model.ts`

**Step 1: 모델 생성**

기존 `container.model.ts` 패턴을 따라 작성:

```typescript
// apps/gateway/src/log-streamer-proxy/models/container-stats.model.ts
import { ObjectType, Field, Float } from '@nestjs/graphql';

@ObjectType({ description: 'Docker container resource usage statistics' })
export class ContainerStats {
  @Field(() => String, { description: 'Container ID (short format)' })
  id: string;

  @Field(() => String, { description: 'Container name' })
  name: string;

  @Field(() => Float, { description: 'CPU usage percentage' })
  cpuPercent: number;

  @Field(() => Float, { description: 'Memory usage in bytes' })
  memUsage: number;

  @Field(() => Float, { description: 'Memory limit in bytes' })
  memLimit: number;
}
```

**Step 2: Commit**

```bash
git add apps/gateway/src/log-streamer-proxy/models/container-stats.model.ts
git commit -m "feat(gateway): add ContainerStats GraphQL model"
```

---

### Task 4: Gateway — Service 및 Resolver 확장

**Files:**
- Modify: `apps/gateway/src/log-streamer-proxy/log-streamer-proxy.service.ts`
- Modify: `apps/gateway/src/log-streamer-proxy/log-streamer-proxy.resolver.ts`

**Step 1: Service에 `getContainerStats()` 추가**

`log-streamer-proxy.service.ts`의 import에 `ContainerStats` 추가 (line 15 부근):

```typescript
import { ContainerStats } from './models/container-stats.model';
```

`listContainers()` 메서드(line 263-278) 아래에 동일한 패턴으로 추가:

```typescript
async getContainerStats(): Promise<ContainerStats[]> {
  const hosts = await discoverLogStreamers(this.logStreamerBaseUrl);
  const results = await Promise.allSettled(
    hosts.map((host) =>
      this.circuitBreaker.fire('log-streamer', async () => {
        const url = `http://${host}:${this.logStreamerPort}`;
        const response = await firstValueFrom(
          this.httpService.get<ContainerStats[]>(`${url}/api/stats`),
        );
        return response.data;
      }),
    ),
  );

  const seen = new Set<string>();
  const stats: ContainerStats[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const s of result.value) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          stats.push(s);
        }
      }
    }
  }
  return stats;
}
```

**Step 2: Resolver에 `containerStats` query 추가**

`log-streamer-proxy.resolver.ts`의 import에 `ContainerStats` 추가:

```typescript
import { ContainerStats } from './models/container-stats.model';
```

`containers()` query(line 12-15) 아래에 추가:

```typescript
@Query(() => [ContainerStats], {
  description: 'Get resource usage statistics for all running containers',
})
async containerStats(): Promise<ContainerStats[]> {
  return this.service.getContainerStats();
}
```

**Step 3: Gateway 빌드 확인**

Run: `pnpm run build:gateway`
Expected: 빌드 성공, `schema.gql`에 `containerStats` query 자동 생성

**Step 4: Commit**

```bash
git add apps/gateway/src/log-streamer-proxy/log-streamer-proxy.service.ts apps/gateway/src/log-streamer-proxy/log-streamer-proxy.resolver.ts
git commit -m "feat(gateway): add containerStats GraphQL query with multi-node support"
```

---

### Task 5: UI — GraphQL query 및 타입 추가

**Files:**
- Modify: `apps/ui/src/features/live-stream/graphql.ts`
- Modify: `apps/ui/src/lib/utils.ts`

**Step 1: `ContainerStatsData` 인터페이스 및 query 추가**

`graphql.ts` 끝(line 76 부근)에 추가:

```typescript
export interface ContainerStatsData {
  id: string;
  name: string;
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
}

export const CONTAINER_STATS_QUERY = gql`
  query ContainerStats {
    containerStats {
      id
      name
      cpuPercent
      memUsage
      memLimit
    }
  }
`;
```

**Step 2: `formatBytes` 유틸 추가**

`utils.ts` 끝(line 14 부근)에 추가:

```typescript
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}${units[i]}`;
}
```

**Step 3: Commit**

```bash
git add apps/ui/src/features/live-stream/graphql.ts apps/ui/src/lib/utils.ts
git commit -m "feat(ui): add ContainerStats query and formatBytes utility"
```

---

### Task 6: UI — ContainerList에 stats 표시 및 색상 코딩

**Files:**
- Modify: `apps/ui/src/features/live-stream/components/ContainerList.tsx`

**Step 1: stats query 및 유틸 import 추가**

`ContainerList.tsx` import 섹션에 추가:

```typescript
import { CONTAINER_STATS_QUERY, ContainerStatsData } from '../graphql';
import { formatBytes } from '@/lib/utils';
```

**Step 2: 색상 코딩 헬퍼 함수 추가**

컴포넌트 밖(`makeFavoriteId` 함수 아래, line 51 부근)에 추가:

```typescript
function getResourceColor(stats: ContainerStatsData | undefined): string {
  if (!stats) return 'bg-green-500';
  if (stats.cpuPercent >= 80 || (stats.memLimit > 0 && stats.memUsage / stats.memLimit >= 0.9)) {
    return 'bg-red-500';
  }
  if (stats.cpuPercent >= 50 || (stats.memLimit > 0 && stats.memUsage / stats.memLimit >= 0.7)) {
    return 'bg-yellow-500';
  }
  return 'bg-green-500';
}

function formatStatsText(stats: ContainerStatsData): string {
  const cpu = `CPU ${stats.cpuPercent.toFixed(1)}%`;
  if (stats.memLimit > 0) {
    return `${cpu} · ${formatBytes(stats.memUsage)}/${formatBytes(stats.memLimit)}`;
  }
  return `${cpu} · ${formatBytes(stats.memUsage)}`;
}
```

**Step 3: `ContainerList` 컴포넌트에 stats query 추가**

컴포넌트 내부, 기존 `useQuery` (line 63-64) 아래에 추가:

```typescript
const { data: statsData } = useQuery<{ containerStats: ContainerStatsData[] }>(
  CONTAINER_STATS_QUERY,
  { pollInterval: 10_000 },
);

const statsMap = new Map<string, ContainerStatsData>();
if (statsData?.containerStats) {
  for (const s of statsData.containerStats) {
    statsMap.set(s.id, s);
  }
}
```

**Step 4: 서비스 그룹 내 각 컨테이너 상태 dot에 색상 코딩 적용**

서비스 그룹의 replica dot 렌더링(line 167-171 부근):

기존:
```tsx
{svc.containers.map((c) => (
  <span
    key={c.id}
    className={`w-1.5 h-1.5 rounded-full ${
      c.state === 'running' ? 'bg-green-500' : 'bg-gray-500'
    }`}
    title={`${c.name} (${c.id})${c.nodeName ? ` @ ${c.nodeName}` : ''}`}
  />
))}
```

변경:
```tsx
{svc.containers.map((c) => (
  <span
    key={c.id}
    className={`w-1.5 h-1.5 rounded-full ${
      c.state === 'running' ? getResourceColor(statsMap.get(c.id)) : 'bg-gray-500'
    }`}
    title={`${c.name} (${c.id})${c.nodeName ? ` @ ${c.nodeName}` : ''}${
      statsMap.has(c.id) ? ` — ${formatStatsText(statsMap.get(c.id)!)}` : ''
    }`}
  />
))}
```

**Step 5: 서비스 그룹에 stats 서브텍스트 추가**

서비스 이미지 텍스트(line 164-166 부근) 아래에 서비스 내 running 컨테이너들의 합산 stats 표시:

기존 (`</p>` 닫힌 후, `<div className="flex gap-1 mt-1 flex-wrap">` 전):
```tsx
<p className="text-xs text-muted-foreground mt-1 truncate" title={svc.containers[0].image}>
  {svc.containers[0].image}
</p>
```

아래에 추가:
```tsx
{(() => {
  const svcStats = svc.containers
    .map((c) => statsMap.get(c.id))
    .filter((s): s is ContainerStatsData => s !== undefined);
  if (svcStats.length === 0) return null;
  const totalCpu = svcStats.reduce((sum, s) => sum + s.cpuPercent, 0);
  const totalMem = svcStats.reduce((sum, s) => sum + s.memUsage, 0);
  const totalLimit = svcStats.reduce((sum, s) => sum + s.memLimit, 0);
  return (
    <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono">
      CPU {totalCpu.toFixed(1)}% · {formatBytes(totalMem)}
      {totalLimit > 0 ? `/${formatBytes(totalLimit)}` : ''}
    </p>
  );
})()}
```

**Step 6: standalone 컨테이너에 색상 코딩 적용**

standalone 컨테이너의 상태 dot(line 183-185 부근):

기존:
```tsx
<span
  className={`w-2 h-2 rounded-full ${
    c.state === 'running' ? 'bg-green-500' : 'bg-gray-500'
  }`}
/>
```

변경:
```tsx
<span
  className={`w-2 h-2 rounded-full ${
    c.state === 'running' ? getResourceColor(statsMap.get(c.id)) : 'bg-gray-500'
  }`}
/>
```

**Step 7: standalone 컨테이너에 stats 서브텍스트 추가**

standalone 컨테이너의 status 텍스트(line 197 부근) 아래에 추가:

기존:
```tsx
<p className="text-xs text-muted-foreground mt-0.5">{c.status}</p>
```

아래에 추가:
```tsx
{statsMap.has(c.id) && (
  <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono">
    {formatStatsText(statsMap.get(c.id)!)}
  </p>
)}
```

**Step 8: UI 빌드 확인**

Run: `nx build ui`
Expected: 빌드 성공

**Step 9: Commit**

```bash
git add apps/ui/src/features/live-stream/components/ContainerList.tsx
git commit -m "feat(ui): display container CPU/memory stats with color-coded status indicators"
```

---

### Task 7: 통합 테스트 및 최종 확인

**Step 1: Gateway 빌드 (UI 의존성 포함)**

Run: `pnpm run build:gateway`
Expected: 빌드 성공 (gateway + ui 모두 빌드)

**Step 2: Log Streamer 빌드**

Run: `pnpm run build:log-streamer`
Expected: 빌드 성공

**Step 3: 전체 lint**

Run: `pnpm run lint`
Expected: 에러 없음

**Step 4: 전체 테스트**

Run: `pnpm run test`
Expected: 기존 테스트 모두 통과

**Step 5: schema.gql 확인**

`apps/gateway/src/schema.gql`에 자동 생성된 `containerStats` query와 `ContainerStats` 타입 확인.

**Step 6: 최종 Commit (필요 시)**

```bash
git add -A
git commit -m "feat: add container resource stats monitoring to LiveStream sidebar"
```
