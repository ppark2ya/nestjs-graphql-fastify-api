# UI Transitions & Effects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Code splitting, 페이지/탭 crossfade 전환, 로그 행 fade-in 애니메이션, history 검색 로딩 skeleton UI를 추가한다.

**Architecture:** Framer Motion으로 페이지/탭 crossfade (keep-mounted, opacity+scale). 로그 행 애니메이션은 성능을 위해 CSS @keyframes로 처리. React.lazy로 code splitting.

**Tech Stack:** Framer Motion, React.lazy/Suspense, CSS @keyframes, shadcn/ui Skeleton

---

### Task 1: Setup — Install framer-motion, CSS keyframes, Skeleton component

**Step 1: Install framer-motion**

Run: `cd /Users/jtpark/workspace/nestjs-graphql-fastify-api && pnpm add framer-motion -w`

**Step 2: Add log-enter CSS keyframes to index.css**

Modify: `apps/ui/src/index.css`

`@layer base` 블록 끝 바로 위(scrollbar 규칙 뒤)에 추가:

```css
/* Log row enter animation */
@keyframes log-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-log-enter {
  animation: log-enter 150ms ease-out forwards;
}

/* Indeterminate progress bar */
@keyframes progress-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}
```

**Step 3: Create Skeleton component**

Create: `apps/ui/src/components/ui/skeleton.tsx`

```tsx
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-secondary', className)}
      {...props}
    />
  );
}

export { Skeleton };
```

**Step 4: Commit**

```bash
git add apps/ui/src/index.css apps/ui/src/components/ui/skeleton.tsx package.json pnpm-lock.yaml
git commit -m "feat(ui): add framer-motion, log-enter keyframes, and Skeleton component"
```

---

### Task 2: Code Splitting — React.lazy for page components

**Files:**
- Modify: `apps/ui/src/App.tsx`

**Step 1: Replace eager imports with React.lazy**

현재:
```tsx
import LoginPage from './features/auth/LoginPage';
import LiveStreamPage from './features/live-stream/LiveStreamPage';
import HistoryPage from './features/history/HistoryPage';
```

변경:
```tsx
import { lazy, Suspense } from 'react';

const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const LiveStreamPage = lazy(() => import('./features/live-stream/LiveStreamPage'));
const HistoryPage = lazy(() => import('./features/history/HistoryPage'));
```

**Step 2: Wrap with Suspense**

`AppRoutes` 컴포넌트의 return을 `<Suspense>`로 감싼다. fallback은 빈 화면 (페이지 전환 시 깜빡임 방지):

```tsx
function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();

  const isAuthenticatedPath = AUTHENTICATED_PATHS.includes(pathname);

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route
          path="/admin/login"
          element={
            !isLoading && isAuthenticated ? (
              <Navigate to="/admin/live-stream" replace />
            ) : (
              <LoginPage />
            )
          }
        />
        <Route path="/admin/live-stream" element={null} />
        <Route path="/admin/history" element={null} />
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {isAuthenticatedPath && <AuthenticatedApp />}
    </Suspense>
  );
}
```

**Step 3: Build 확인**

Run: `cd /Users/jtpark/workspace/nestjs-graphql-fastify-api && npx nx build ui`
Expected: 빌드 성공. output에 lazy chunk 파일들이 분리되어 보여야 함.

**Step 4: Commit**

```bash
git add apps/ui/src/App.tsx
git commit -m "feat(ui): add code splitting with React.lazy for page components"
```

---

### Task 3: Page Transition — Keep-mounted crossfade

**Files:**
- Modify: `apps/ui/src/App.tsx`

**Step 1: Import motion**

```tsx
import { motion } from 'framer-motion';
```

**Step 2: Replace display toggle with motion.div crossfade**

`AuthenticatedApp` 컴포넌트에서 `style={{ display: ... }}` 패턴을 `motion.div`로 교체한다.

현재:
```tsx
<div
  className="flex-1 flex flex-col overflow-hidden"
  style={{ display: pathname === '/admin/live-stream' ? 'flex' : 'none' }}
>
  <LiveStreamPage />
</div>
<div
  className="flex-1 flex flex-col overflow-hidden"
  style={{ display: pathname === '/admin/history' ? 'flex' : 'none' }}
>
  <HistoryPage />
</div>
```

변경:
```tsx
<div className="flex-1 relative overflow-hidden">
  <motion.div
    className="absolute inset-0 flex flex-col overflow-hidden"
    animate={{
      opacity: pathname === '/admin/live-stream' ? 1 : 0,
      scale: pathname === '/admin/live-stream' ? 1 : 0.98,
    }}
    transition={{ duration: 0.15 }}
    style={{
      pointerEvents: pathname === '/admin/live-stream' ? 'auto' : 'none',
    }}
  >
    <LiveStreamPage />
  </motion.div>
  <motion.div
    className="absolute inset-0 flex flex-col overflow-hidden"
    animate={{
      opacity: pathname === '/admin/history' ? 1 : 0,
      scale: pathname === '/admin/history' ? 1 : 0.98,
    }}
    transition={{ duration: 0.15 }}
    style={{
      pointerEvents: pathname === '/admin/history' ? 'auto' : 'none',
    }}
  >
    <HistoryPage />
  </motion.div>
</div>
```

**주의**: 부모 `div`를 `relative`로, 자식을 `absolute inset-0`으로 변경하여 양쪽 페이지가 겹치도록 한다.

**Step 3: Build 확인**

Run: `npx nx build ui`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add apps/ui/src/App.tsx
git commit -m "feat(ui): add page crossfade transition with framer-motion"
```

---

### Task 4: Tab Content Transition — LiveStreamPage

**Files:**
- Modify: `apps/ui/src/features/live-stream/LiveStreamPage.tsx`

**Step 1: Import motion**

```tsx
import { motion } from 'framer-motion';
```

**Step 2: Replace tab content display toggle with motion.div**

`mainContent` 내부의 탭 렌더링 부분:

현재:
```tsx
<div className="flex-1 relative overflow-hidden">
  {tabs.map((tab) => (
    <div
      key={tab.id}
      className="absolute inset-0 flex-col"
      style={{
        display: tab.id === activeTabId ? 'flex' : 'none',
      }}
    >
      {tab.data.type === 'service' ? (
        <ServiceLogViewer service={tab.data.service} />
      ) : (
        <LogViewer
          containerId={tab.data.container.id}
          containerName={tab.data.container.name}
        />
      )}
    </div>
  ))}
</div>
```

변경:
```tsx
<div className="flex-1 relative overflow-hidden">
  {tabs.map((tab) => (
    <motion.div
      key={tab.id}
      className="absolute inset-0 flex flex-col"
      animate={{
        opacity: tab.id === activeTabId ? 1 : 0,
        scale: tab.id === activeTabId ? 1 : 0.98,
      }}
      transition={{ duration: 0.15 }}
      style={{
        pointerEvents: tab.id === activeTabId ? 'auto' : 'none',
      }}
    >
      {tab.data.type === 'service' ? (
        <ServiceLogViewer service={tab.data.service} />
      ) : (
        <LogViewer
          containerId={tab.data.container.id}
          containerName={tab.data.container.name}
        />
      )}
    </motion.div>
  ))}
</div>
```

**Step 3: Build 확인**

Run: `npx nx build ui`

**Step 4: Commit**

```bash
git add apps/ui/src/features/live-stream/LiveStreamPage.tsx
git commit -m "feat(ui): add tab crossfade transition to LiveStreamPage"
```

---

### Task 5: Tab Content Transition — HistoryPage

**Files:**
- Modify: `apps/ui/src/features/history/HistoryPage.tsx`

**Step 1: Import motion**

```tsx
import { motion } from 'framer-motion';
```

**Step 2: Replace tab content display toggle with motion.div**

현재:
```tsx
<div className="flex-1 relative overflow-hidden">
  {tabs.map((tab) => (
    <div
      key={tab.id}
      className="absolute inset-0 flex-col"
      style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
    >
      <SearchPanel
        appsData={apps}
        onLabelChange={(label) => updateTabLabel(tab.id, label)}
      />
    </div>
  ))}
</div>
```

변경:
```tsx
<div className="flex-1 relative overflow-hidden">
  {tabs.map((tab) => (
    <motion.div
      key={tab.id}
      className="absolute inset-0 flex flex-col"
      animate={{
        opacity: tab.id === activeTabId ? 1 : 0,
        scale: tab.id === activeTabId ? 1 : 0.98,
      }}
      transition={{ duration: 0.15 }}
      style={{
        pointerEvents: tab.id === activeTabId ? 'auto' : 'none',
      }}
    >
      <SearchPanel
        appsData={apps}
        onLabelChange={(label) => updateTabLabel(tab.id, label)}
      />
    </motion.div>
  ))}
</div>
```

**Step 3: Build 확인**

Run: `npx nx build ui`

**Step 4: Commit**

```bash
git add apps/ui/src/features/history/HistoryPage.tsx
git commit -m "feat(ui): add tab crossfade transition to HistoryPage"
```

---

### Task 6: Log Row Animation — useLogBuffer + LogViewer + ServiceLogViewer

**Files:**
- Modify: `apps/ui/src/hooks/useLogBuffer.ts`
- Modify: `apps/ui/src/features/live-stream/components/LogViewer.tsx`
- Modify: `apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx`

**Step 1: Add batchStartIndex to useLogBuffer**

`useLogBuffer.ts`에 `batchStartIndex` ref를 추가한다. flushBatch에서 현재 로그 길이를 기록한 뒤 새 배치를 추가한다.

현재 `flushBatch`:
```ts
const flushBatch = () => {
  rafRef.current = 0;
  const batch = batchRef.current;
  if (batch.length === 0) return;
  batchRef.current = [];
  setLogs((prev) => {
    const next = prev.concat(batch);
    // ...
    return next.length > maxLines ? next.slice(-maxLines) : next;
  });
};
```

변경 — `batchStartRef` 추가:
```ts
const batchStartRef = useRef(0);

const flushBatch = () => {
  rafRef.current = 0;
  const batch = batchRef.current;
  if (batch.length === 0) return;
  batchRef.current = [];
  setLogs((prev) => {
    batchStartRef.current = prev.length;
    const next = prev.concat(batch);
    if (
      sortByTimestamp &&
      prev.length > 0 &&
      batch.some((e) => e.timestamp < prev[prev.length - 1].timestamp)
    ) {
      next.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      // sorted 시 batchStart 의미 없으므로 애니메이션 비활성화
      batchStartRef.current = next.length;
    }
    if (next.length > maxLines) {
      const trimmed = next.slice(-maxLines);
      batchStartRef.current = Math.max(0, batchStartRef.current - (next.length - maxLines));
      return trimmed;
    }
    return next;
  });
};
```

`clearLogs` 수정:
```ts
const clearLogs = () => {
  batchRef.current = [];
  batchStartRef.current = 0;
  // ...
};
```

return에 추가:
```ts
return { logs, addLog, clearLogs, lineCount: logs.length, batchStartIndex: batchStartRef.current };
```

**Step 2: LogViewer에 애니메이션 클래스 적용**

`LogViewer.tsx`에서 `batchStartIndex`를 받아 virtualizer row에 조건부 클래스를 추가한다.

```tsx
const { logs, addLog, clearLogs, lineCount, batchStartIndex } = useLogBuffer<LogEntry>();
```

virtualizer row div에 className 추가:
```tsx
<div
  key={virtualRow.key}
  data-index={virtualRow.index}
  className={
    isFollowing && !isGrepping && virtualRow.index >= batchStartIndex
      ? 'animate-log-enter'
      : undefined
  }
  style={{
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    transform: `translateY(${virtualRow.start}px)`,
  }}
>
```

**Step 3: ServiceLogViewer에 동일한 패턴 적용**

`ServiceLogViewer.tsx`에서도 `batchStartIndex`를 받아 동일한 조건부 클래스를 적용한다.

```tsx
const { logs, addLog, clearLogs, lineCount, batchStartIndex } = useLogBuffer<LogEntry>({
  sortByTimestamp: true,
});
```

virtualizer row div에:
```tsx
<div
  key={virtualRow.key}
  data-index={virtualRow.index}
  className={
    isFollowing && !isGrepping && virtualRow.index >= batchStartIndex
      ? 'animate-log-enter'
      : undefined
  }
  style={{ ... }}
>
```

**Step 4: Build 확인**

Run: `npx nx build ui`

**Step 5: Commit**

```bash
git add apps/ui/src/hooks/useLogBuffer.ts apps/ui/src/features/live-stream/components/LogViewer.tsx apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx
git commit -m "feat(ui): add fade-in slide animation for new log rows"
```

---

### Task 7: History Search Loading — Skeleton + Progress Bar

**Files:**
- Modify: `apps/ui/src/features/history/components/SearchPanel.tsx`

**Step 1: Import Skeleton**

```tsx
import { Skeleton } from '@/components/ui/skeleton';
```

**Step 2: Add indeterminate progress bar below filter bar**

`{/* Filter Bar */}` div 바로 아래, `{/* Summary Bar */}` 위에 추가:

```tsx
{/* Loading Progress */}
{loading && (
  <div className="h-0.5 w-full overflow-hidden bg-secondary">
    <div
      className="h-full w-1/4 bg-primary rounded-full"
      style={{
        animation: 'progress-indeterminate 1.5s ease-in-out infinite',
      }}
    />
  </div>
)}
```

**Step 3: Add skeleton table when loading without prior results**

`{/* Log Table */}` 섹션의 `{!result && !loading && ...}` 조건 위에 loading skeleton을 추가한다:

현재:
```tsx
{!result && !loading && (
  <div className="flex items-center justify-center h-full text-muted-foreground">
    <p>Select an app and date range to search logs</p>
  </div>
)}
```

이 부분을 다음으로 교체:
```tsx
{loading && !result && (
  <div className="p-4 space-y-3">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex gap-3 items-center">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>
    ))}
  </div>
)}

{!result && !loading && (
  <div className="flex items-center justify-center h-full text-muted-foreground">
    <p>Select an app and date range to search logs</p>
  </div>
)}
```

**Step 4: Build 확인**

Run: `npx nx build ui`

**Step 5: Commit**

```bash
git add apps/ui/src/features/history/components/SearchPanel.tsx
git commit -m "feat(ui): add skeleton loading and progress bar to history search"
```

---

### Task 8: ContainerList Skeleton Loading

**Files:**
- Modify: `apps/ui/src/features/live-stream/components/ContainerList.tsx`

**Step 1: Import Skeleton**

```tsx
import { Skeleton } from '@/components/ui/skeleton';
```

**Step 2: Replace loading text with skeleton cards**

현재:
```tsx
if (loading) {
  return (
    <div className="p-4 text-muted-foreground">Loading containers...</div>
  );
}
```

변경:
```tsx
if (loading) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Skeleton className="w-2 h-2 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16 ml-auto" />
          </div>
          <Skeleton className="h-3 w-48 mt-2" />
          <div className="flex gap-1 mt-1">
            <Skeleton className="w-1.5 h-1.5 rounded-full" />
            <Skeleton className="w-1.5 h-1.5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 3: Build 확인**

Run: `npx nx build ui`

**Step 4: Commit**

```bash
git add apps/ui/src/features/live-stream/components/ContainerList.tsx
git commit -m "feat(ui): add skeleton loading to ContainerList"
```

---

### Task 9: Final Build & Lint 확인

**Step 1: Full lint**

Run: `pnpm run lint`
Expected: 에러 없음

**Step 2: Full build**

Run: `pnpm run build`
Expected: 전체 빌드 성공

**Step 3: Commit (필요 시)**

lint/build 수정 사항이 있으면 커밋.
