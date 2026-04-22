# LiveStream 로그 Copy & Pause 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 실시간 로그 뷰어에서 메시지만 드래그 복사할 수 있고, Pause 버튼으로 스크롤 밀림을 방지한다.

**Architecture:** LogRow 컴포넌트의 메타데이터 컬럼에 CSS `user-select: none`을 적용하고, useAutoScroll 훅에 `isPaused` 상태를 추가하여 명시적 스크롤 고정을 구현한다.

**Tech Stack:** React, Tailwind CSS (`select-none`), Lucide icons (`Pause`, `Play`)

---

### Task 1: LogRow 메타데이터 컬럼에 select-none 적용

**Files:**
- Modify: `apps/ui/src/features/live-stream/components/LogRow.tsx`

**Step 1: LogRow — timestamp, stream 컬럼에 `select-none` 추가**

```tsx
// LogRow: timestamp (line 18)
<span className="text-muted-foreground shrink-0 select-none">

// LogRow: stream (line 21-24)
<span
  className={`shrink-0 w-12 select-none ${
    log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
  }`}
>
```

**Step 2: ServiceLogRow — timestamp, containerId/nodeName, stream 컬럼에 `select-none` 추가**

```tsx
// ServiceLogRow: timestamp (line 59)
<span className="text-muted-foreground shrink-0 select-none">

// ServiceLogRow: containerId+nodeName (line 62)
<span className={`shrink-0 truncate select-none ${replicaColor}`}>

// ServiceLogRow: stream (line 66-69)
<span
  className={`shrink-0 w-12 select-none ${
    log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
  }`}
>
```

**Step 3: ServiceEventRow — timestamp 컬럼에 `select-none` 추가**

```tsx
// ServiceEventRow: timestamp (line 90)
<span className="text-muted-foreground shrink-0 text-xs select-none">
```

**Step 4: 개발 서버에서 확인**

Run: `nx serve ui`
확인: 로그 영역에서 드래그 시 메시지 텍스트만 선택되고, timestamp/stream/containerId는 선택되지 않음

**Step 5: Commit**

```bash
git add apps/ui/src/features/live-stream/components/LogRow.tsx
git commit -m "feat(ui): add select-none to log metadata columns for message-only copy"
```

---

### Task 2: useAutoScroll에 isPaused 상태 추가

**Files:**
- Modify: `apps/ui/src/hooks/useAutoScroll.ts`

**Step 1: isPaused 상태와 togglePause 함수 추가**

`useAutoScroll.ts` 전체를 다음으로 변경:

```typescript
import { useEffect, useRef, useState } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

interface UseAutoScrollOptions {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  itemCount: number;
  enabled?: boolean;
}

export function useAutoScroll({
  virtualizer,
  itemCount,
  enabled = true,
}: UseAutoScrollOptions) {
  const [isFollowing, setIsFollowing] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPaused) return;
    if (isFollowing && enabled && itemCount > 0) {
      virtualizer.scrollToIndex(itemCount - 1, { align: 'end' });
    }
  }, [itemCount, isFollowing, enabled, isPaused, virtualizer]);

  const handleScroll = () => {
    if (isPaused) return;
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsFollowing((prev) => (prev === isAtBottom ? prev : isAtBottom));
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const scrollToBottom = () => {
    setIsPaused(false);
    setIsFollowing(true);
    virtualizer.scrollToIndex(itemCount - 1, { align: 'end' });
  };

  return { scrollRef, isFollowing, isPaused, handleScroll, togglePause, scrollToBottom };
}
```

핵심 변경:
- `isPaused` 상태 추가 및 노출
- `useEffect`에서 `isPaused` 체크 → true면 스크롤 차단
- `handleScroll`에서 `isPaused`면 `isFollowing` 업데이트 차단 (스크롤해도 follow 상태 안 변함)
- `scrollToBottom`에서 `isPaused = false` 해제
- `togglePause` 함수 노출

**Step 2: Commit**

```bash
git add apps/ui/src/hooks/useAutoScroll.ts
git commit -m "feat(ui): add isPaused state to useAutoScroll hook"
```

---

### Task 3: LogViewer에 Pause/Resume 버튼 추가

**Files:**
- Modify: `apps/ui/src/features/live-stream/components/LogViewer.tsx`

**Step 1: import에 Pause, Play 아이콘 추가**

```tsx
import { Search, X, ListFilter, Pause, Play } from 'lucide-react';
```

**Step 2: useAutoScroll 디스트럭처링에 isPaused, togglePause 추가**

```tsx
const { scrollRef, isFollowing, isPaused, handleScroll, togglePause, scrollToBottom } =
  useAutoScroll({
    virtualizer,
    itemCount: filteredLogs.length,
    enabled: !isGrepping,
  });
```

**Step 3: 헤더 우측 버튼 영역에 Pause/Resume 버튼 추가**

기존 `{!isFollowing && (` Follow 버튼 바로 앞에 추가:

```tsx
<div className="flex items-center gap-3">
  <span className="text-xs text-muted-foreground">
    {isFindMode && isGrepping
      ? `${totalMatches > 0 ? currentMatchIndex + 1 : 0}/${totalMatches} matches`
      : isGrepping
        ? `${filteredLogs.length}/${lineCount} lines`
        : `${lineCount} lines`}
  </span>
  <Button
    variant={isPaused ? 'secondary' : 'ghost'}
    size="sm"
    className="h-auto p-0"
    onClick={togglePause}
  >
    {isPaused ? (
      <Play className="h-3.5 w-3.5 mr-1" />
    ) : (
      <Pause className="h-3.5 w-3.5 mr-1" />
    )}
    {isPaused ? 'Resume' : 'Pause'}
  </Button>
  {!isFollowing && (
    <Button
      variant="link"
      size="sm"
      className="h-auto p-0"
      onClick={scrollToBottom}
    >
      Follow
    </Button>
  )}
  <Button
    variant="ghost"
    size="sm"
    className="h-auto p-0"
    onClick={clearLogs}
  >
    Clear
  </Button>
</div>
```

**Step 4: Commit**

```bash
git add apps/ui/src/features/live-stream/components/LogViewer.tsx
git commit -m "feat(ui): add Pause/Resume button to LogViewer"
```

---

### Task 4: ServiceLogViewer에 Pause/Resume 버튼 추가

**Files:**
- Modify: `apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx`

**Step 1: import에 Pause, Play 아이콘 추가**

```tsx
import { Search, X, ListFilter, Pause, Play } from 'lucide-react';
```

**Step 2: useAutoScroll 디스트럭처링에 isPaused, togglePause 추가**

```tsx
const { scrollRef, isFollowing, isPaused, handleScroll, togglePause, scrollToBottom } =
  useAutoScroll({
    virtualizer,
    itemCount: filteredLogs.length,
    enabled: !isGrepping,
  });
```

**Step 3: 헤더 우측 버튼 영역에 Pause/Resume 버튼 추가**

LogViewer와 동일한 패턴으로 버튼 영역 교체:

```tsx
<div className="flex items-center gap-3">
  <span className="text-xs text-muted-foreground">
    {isFindMode && isGrepping
      ? `${totalMatches > 0 ? currentMatchIndex + 1 : 0}/${totalMatches} matches`
      : isGrepping
        ? `${filteredLogs.length}/${lineCount} lines`
        : `${lineCount} lines`}
  </span>
  <Button
    variant={isPaused ? 'secondary' : 'ghost'}
    size="sm"
    className="h-auto p-0"
    onClick={togglePause}
  >
    {isPaused ? (
      <Play className="h-3.5 w-3.5 mr-1" />
    ) : (
      <Pause className="h-3.5 w-3.5 mr-1" />
    )}
    {isPaused ? 'Resume' : 'Pause'}
  </Button>
  {!isFollowing && (
    <Button
      variant="link"
      size="sm"
      className="h-auto p-0"
      onClick={scrollToBottom}
    >
      Follow
    </Button>
  )}
  <Button
    variant="ghost"
    size="sm"
    className="h-auto p-0"
    onClick={clearLogs}
  >
    Clear
  </Button>
</div>
```

**Step 4: Commit**

```bash
git add apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx
git commit -m "feat(ui): add Pause/Resume button to ServiceLogViewer"
```

---

### Task 5: 통합 확인

**Step 1: 개발 서버 실행 후 검증**

Run: `nx serve ui`

검증 체크리스트:
1. 로그 드래그 → 메시지만 선택되는지 확인 (timestamp, stream, containerId 미선택)
2. Ctrl+C → 클립보드에 메시지만 복사되는지 확인
3. Pause 클릭 → 새 로그 들어와도 스크롤 고정되는지 확인
4. Resume 클릭 → 다시 자동 스크롤 재개되는지 확인
5. Pause 상태에서 Follow 클릭 → pause 해제 + 맨 아래로 이동
6. ServiceLogViewer에서도 동일 동작 확인
