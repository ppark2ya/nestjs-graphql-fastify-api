# UI Pages & Components 구조 리팩토링 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** UI 앱의 디렉토리 구조를 feature-based로 재편하고, 중복 로직을 공유 훅으로 추출한다.

**Architecture:** `pages/`와 `auth/`를 `features/` 디렉토리 아래로 재배치하고, LogViewer/ServiceLogViewer 간 중복되는 로그 버퍼, 오토스크롤, 필터링 로직을 커스텀 훅으로 분리한다. 탭 관리 로직도 LiveStreamPage와 HistoryPage에서 공유 훅으로 통합한다.

**Tech Stack:** React 19, TypeScript, @tanstack/react-virtual, Apollo Client

---

### Task 1: Feature 디렉토리 생성 및 파일 이동

디렉토리 구조를 feature-based로 재편한다. import 경로만 수정하고 코드 로직은 변경하지 않는다.

**Files:**
- Create: `apps/ui/src/features/auth/` (move from `apps/ui/src/auth/`)
- Create: `apps/ui/src/features/live-stream/` (move from `apps/ui/src/pages/live-stream/`)
- Create: `apps/ui/src/features/live-stream/components/` (하위 컴포넌트 이동)
- Create: `apps/ui/src/features/history/` (move from `apps/ui/src/pages/history/`)
- Create: `apps/ui/src/features/history/components/` (하위 컴포넌트 이동)
- Move: `apps/ui/src/pages/LoginPage.tsx` → `apps/ui/src/features/auth/LoginPage.tsx`
- Move: `apps/ui/src/pages/NotFoundPage.tsx` → `apps/ui/src/components/NotFoundPage.tsx`
- Modify: `apps/ui/src/App.tsx` (import 경로 변경)
- Delete: `apps/ui/src/pages/` (빈 디렉토리 삭제)
- Delete: `apps/ui/src/auth/` (이동 후 삭제)

**Step 1: 디렉토리 생성**

```bash
mkdir -p apps/ui/src/features/auth
mkdir -p apps/ui/src/features/live-stream/components
mkdir -p apps/ui/src/features/live-stream/hooks
mkdir -p apps/ui/src/features/history/components
mkdir -p apps/ui/src/features/history/hooks
```

**Step 2: auth 파일 이동**

```bash
mv apps/ui/src/auth/AuthContext.tsx apps/ui/src/features/auth/
mv apps/ui/src/auth/AuthGuard.tsx apps/ui/src/features/auth/
mv apps/ui/src/auth/token.ts apps/ui/src/features/auth/
mv apps/ui/src/auth/graphql.ts apps/ui/src/features/auth/
mv apps/ui/src/pages/LoginPage.tsx apps/ui/src/features/auth/
rmdir apps/ui/src/auth
```

**Step 3: live-stream 파일 이동**

```bash
mv apps/ui/src/pages/live-stream/LiveStreamPage.tsx apps/ui/src/features/live-stream/
mv apps/ui/src/pages/live-stream/graphql.ts apps/ui/src/features/live-stream/
mv apps/ui/src/pages/live-stream/ContainerList.tsx apps/ui/src/features/live-stream/components/
mv apps/ui/src/pages/live-stream/LogViewer.tsx apps/ui/src/features/live-stream/components/
mv apps/ui/src/pages/live-stream/ServiceLogViewer.tsx apps/ui/src/features/live-stream/components/
mv apps/ui/src/pages/live-stream/LogRow.tsx apps/ui/src/features/live-stream/components/
mv apps/ui/src/pages/live-stream/TabBar.tsx apps/ui/src/features/live-stream/components/
```

**Step 4: history 파일 이동**

```bash
mv apps/ui/src/pages/history/HistoryPage.tsx apps/ui/src/features/history/
mv apps/ui/src/pages/history/graphql.ts apps/ui/src/features/history/
mv apps/ui/src/pages/history/SearchPanel.tsx apps/ui/src/features/history/components/
mv apps/ui/src/pages/history/HistoryTabBar.tsx apps/ui/src/features/history/components/
```

**Step 5: NotFoundPage 이동 및 빈 디렉토리 삭제**

```bash
mv apps/ui/src/pages/NotFoundPage.tsx apps/ui/src/components/
rm -rf apps/ui/src/pages
```

**Step 6: 모든 파일의 import 경로 수정**

아래 파일들의 import 경로를 새 위치에 맞게 수정한다.

`apps/ui/src/App.tsx`:
```typescript
// 변경 전:
import { AuthProvider, useAuth } from './auth/AuthContext';
import AuthGuard from './auth/AuthGuard';
import LoginPage from './pages/LoginPage';
import LiveStreamPage from './pages/live-stream/LiveStreamPage';
import HistoryPage from './pages/history/HistoryPage';
import NotFoundPage from './pages/NotFoundPage';

// 변경 후:
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import AuthGuard from './features/auth/AuthGuard';
import LoginPage from './features/auth/LoginPage';
import LiveStreamPage from './features/live-stream/LiveStreamPage';
import HistoryPage from './features/history/HistoryPage';
import NotFoundPage from './components/NotFoundPage';
```

`apps/ui/src/features/auth/LoginPage.tsx`:
```typescript
// 변경 전:
import { useAuth } from '@/auth/AuthContext';
import { LOGIN_MUTATION, VERIFY_TWO_FACTOR_MUTATION, ... } from '@/auth/graphql';

// 변경 후:
import { useAuth } from '@/features/auth/AuthContext';
import { LOGIN_MUTATION, VERIFY_TWO_FACTOR_MUTATION, ... } from '@/features/auth/graphql';
```

`apps/ui/src/features/auth/AuthContext.tsx`:
```typescript
// 변경 전:
import { REFRESH_TOKEN_MUTATION, ... } from './graphql';
import { getAccessToken, ... } from './token';

// 변경 후: (상대경로이므로 변경 없음 — 같은 디렉토리 내 이동)
```

`apps/ui/src/features/live-stream/LiveStreamPage.tsx`:
```typescript
// 변경 전:
import ContainerList from './ContainerList';
import LogViewer from './LogViewer';
import ServiceLogViewer from './ServiceLogViewer';
import TabBar from './TabBar';
import { Container, MAX_TABS, ServiceGroup, Tab } from './graphql';

// 변경 후:
import ContainerList from './components/ContainerList';
import LogViewer from './components/LogViewer';
import ServiceLogViewer from './components/ServiceLogViewer';
import TabBar from './components/TabBar';
import { Container, MAX_TABS, ServiceGroup, Tab } from './graphql';
```

`apps/ui/src/features/live-stream/components/LogViewer.tsx`:
```typescript
// 변경 전:
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry, MAX_LOG_LINES } from './graphql';
import { LogRow } from './LogRow';

// 변경 후:
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry, MAX_LOG_LINES } from '../graphql';
import { LogRow } from './LogRow';
```

`apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx`:
```typescript
// 변경 전:
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry, MAX_LOG_LINES, ServiceGroup } from './graphql';
import { ServiceLogRow } from './LogRow';

// 변경 후:
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry, MAX_LOG_LINES, ServiceGroup } from '../graphql';
import { ServiceLogRow } from './LogRow';
```

`apps/ui/src/features/live-stream/components/ContainerList.tsx`:
```typescript
// 변경 전:
import { CONTAINERS_QUERY, Container, ServiceGroup } from './graphql';

// 변경 후:
import { CONTAINERS_QUERY, Container, ServiceGroup } from '../graphql';
```

`apps/ui/src/features/live-stream/components/TabBar.tsx`:
```typescript
// 변경 전:
import { Tab } from './graphql';

// 변경 후:
import { Tab } from '../graphql';
```

`apps/ui/src/features/live-stream/components/LogRow.tsx`:
```typescript
// 변경 전:
import type { LogEntry } from './graphql';

// 변경 후:
import type { LogEntry } from '../graphql';
```

`apps/ui/src/features/history/HistoryPage.tsx`:
```typescript
// 변경 전:
import { LOG_APPS_QUERY, LogApp, SearchTab, MAX_SEARCH_TABS } from './graphql';
import HistoryTabBar from './HistoryTabBar';
import SearchPanel from './SearchPanel';

// 변경 후:
import { LOG_APPS_QUERY, LogApp, SearchTab, MAX_SEARCH_TABS } from './graphql';
import HistoryTabBar from './components/HistoryTabBar';
import SearchPanel from './components/SearchPanel';
```

`apps/ui/src/features/history/components/HistoryTabBar.tsx`:
```typescript
// 변경 전:
import { SearchTab, MAX_SEARCH_TABS } from './graphql';

// 변경 후:
import { SearchTab, MAX_SEARCH_TABS } from '../graphql';
```

`apps/ui/src/features/history/components/SearchPanel.tsx`:
```typescript
// 변경 전:
import { LOG_SEARCH_QUERY, LogApp, HistoryLogLine, LogSearchResult } from './graphql';

// 변경 후:
import { LOG_SEARCH_QUERY, LogApp, HistoryLogLine, LogSearchResult } from '../graphql';
```

`apps/ui/src/components/Navigation.tsx`:
```typescript
// 변경 전:
import { useAuth } from '@/auth/AuthContext';

// 변경 후:
import { useAuth } from '@/features/auth/AuthContext';
```

**Step 7: 빌드 확인**

Run: `cd apps/ui && npx tsc --noEmit`
Expected: 에러 없음

Run: `pnpm run lint`
Expected: 에러 없음

**Step 8: 커밋**

```bash
git add apps/ui/src/
git commit -m "refactor(ui): reorganize to feature-based directory structure

Move pages and auth to features/ directory.
Move sub-components into components/ subdirectories.
Update all import paths."
```

---

### Task 2: useTabs 공유 훅 추출

LiveStreamPage와 HistoryPage에서 중복되는 탭 관리 로직을 공유 훅으로 추출한다.

**Files:**
- Create: `apps/ui/src/hooks/useTabs.ts`
- Modify: `apps/ui/src/features/live-stream/LiveStreamPage.tsx`
- Modify: `apps/ui/src/features/history/HistoryPage.tsx`

**Step 1: useTabs 훅 작성**

Create `apps/ui/src/hooks/useTabs.ts`:

```typescript
import { useEffect, useState } from 'react';

export interface Tab<T = unknown> {
  id: string;
  label: string;
  data: T;
}

interface UseTabsOptions<T> {
  maxTabs: number;
  storageKey?: string;
  initialTabs?: Tab<T>[];
  initialActiveTabId?: string | null;
}

interface PersistedState<T> {
  tabs: Tab<T>[];
  activeTabId: string | null;
}

function loadState<T>(storageKey: string): PersistedState<T> | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState<T>;
      if (Array.isArray(parsed.tabs)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveState<T>(storageKey: string, tabs: Tab<T>[], activeTabId: string | null) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ tabs, activeTabId }));
  } catch {
    /* ignore */
  }
}

export function useTabs<T = unknown>(options: UseTabsOptions<T>) {
  const { maxTabs, storageKey, initialTabs = [], initialActiveTabId = null } = options;

  const [tabs, setTabs] = useState<Tab<T>[]>(() => {
    if (storageKey) {
      const persisted = loadState<T>(storageKey);
      if (persisted) return persisted.tabs;
    }
    return initialTabs;
  });

  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    if (storageKey) {
      const persisted = loadState<T>(storageKey);
      if (persisted) return persisted.activeTabId;
    }
    return initialActiveTabId;
  });

  useEffect(() => {
    if (storageKey) {
      saveState(storageKey, tabs, activeTabId);
    }
  }, [tabs, activeTabId, storageKey]);

  const openTab = (tab: Tab<T>) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.id === tab.id);
      if (existing) {
        setActiveTabId(tab.id);
        return prev;
      }
      let next = [...prev, tab];
      if (next.length > maxTabs) {
        const oldestInactive = next.find((t) => t.id !== activeTabId);
        if (oldestInactive) {
          next = next.filter((t) => t.id !== oldestInactive.id);
        }
      }
      setActiveTabId(tab.id);
      return next;
    });
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      if (tabId === activeTabId && next.length > 0) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
      } else if (next.length === 0) {
        setActiveTabId(null);
      }
      return next;
    });
  };

  const updateTabLabel = (tabId: string, label: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, label } : t)));
  };

  return { tabs, activeTabId, openTab, closeTab, setActiveTabId, updateTabLabel };
}
```

**Step 2: LiveStreamPage에 useTabs 적용**

`apps/ui/src/features/live-stream/LiveStreamPage.tsx`를 수정한다.

live-stream의 `Tab` 타입은 유니온 타입이므로, `useTabs`의 제네릭 `data` 필드에 컨테이너/서비스 정보를 담고, 별도 `type` 필드는 data에 포함시킨다.

graphql.ts의 기존 `Tab` 타입을 `LiveStreamTabData`로 변경한다.

먼저 `apps/ui/src/features/live-stream/graphql.ts`에서 `Tab` 타입을 수정:

```typescript
// 기존 Tab 타입 제거하고 TabData 타입 추가:
export type LiveStreamTabData =
  | { type: 'container'; container: Container }
  | { type: 'service'; service: ServiceGroup };
```

그리고 `LiveStreamPage.tsx`를 수정:

```typescript
import { useState } from 'react';
import ContainerList from './components/ContainerList';
import LogViewer from './components/LogViewer';
import ServiceLogViewer from './components/ServiceLogViewer';
import TabBar from './components/TabBar';
import { Container, ServiceGroup, LiveStreamTabData } from './graphql';
import { useTabs } from '@/hooks/useTabs';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from '@/components/ui/resizable';
import { PanelLeft } from 'lucide-react';

const MAX_TABS = 10;

function makeTabId(type: 'container' | 'service', key: string): string {
  return `${type}-${key}`;
}

export default function LiveStreamPage() {
  const { tabs, activeTabId, openTab, closeTab, setActiveTabId } =
    useTabs<LiveStreamTabData>({
      maxTabs: MAX_TABS,
      storageKey: 'live-stream-tabs',
    });
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSelectContainer = (c: Container, closeSheet?: boolean) => {
    openTab({
      id: makeTabId('container', c.id),
      label: c.name,
      data: { type: 'container', container: c },
    });
    if (closeSheet) setSheetOpen(false);
  };

  const handleSelectService = (s: ServiceGroup, closeSheet?: boolean) => {
    openTab({
      id: makeTabId('service', s.serviceName),
      label: s.serviceName,
      data: { type: 'service', service: s },
    });
    if (closeSheet) setSheetOpen(false);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const containerListProps = {
    selectedId:
      activeTab?.data.type === 'container' ? activeTab.data.container.id : null,
    selectedServiceName:
      activeTab?.data.type === 'service' ? activeTab.data.service.serviceName : null,
  };

  // sidebarContent, mainContent, return문은 기존과 동일하되
  // tab.type → tab.data.type, tab.container → tab.data.container,
  // tab.service → tab.data.service로 변경
  // ...
}
```

TabBar도 제네릭 Tab을 받도록 수정:

`apps/ui/src/features/live-stream/components/TabBar.tsx`:
```typescript
import { X } from 'lucide-react';
import type { Tab } from '@/hooks/useTabs';
import type { LiveStreamTabData } from '../graphql';

interface Props {
  tabs: Tab<LiveStreamTabData>[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export default function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  if (tabs.length === 0) return null;
  return (
    <div className="flex items-center border-b border-border overflow-x-auto bg-card/50">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`group relative flex items-center gap-1.5 px-3 py-2 text-xs shrink-0 border-r border-border transition-colors ${
              isActive
                ? 'bg-background text-foreground border-b-2 border-b-primary'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                tab.data.type === 'service' ? 'bg-purple-500' : 'bg-green-500'
              }`}
            />
            <span className="max-w-[180px] truncate">{tab.label}</span>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              className={`ml-1 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive shrink-0 ${
                isActive
                  ? 'opacity-60 hover:opacity-100'
                  : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
              }`}
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

**Step 3: HistoryPage에 useTabs 적용**

`apps/ui/src/features/history/HistoryPage.tsx`:

```typescript
import { useQuery } from '@apollo/client/react';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOG_APPS_QUERY, LogApp, MAX_SEARCH_TABS } from './graphql';
import { useTabs } from '@/hooks/useTabs';
import HistoryTabBar from './components/HistoryTabBar';
import SearchPanel from './components/SearchPanel';

function createTab() {
  return {
    id: `search-${Date.now()}`,
    label: 'New Search',
    data: null,
  };
}

export default function HistoryPage() {
  const initialTab = createTab();
  const { tabs, activeTabId, openTab, closeTab, setActiveTabId, updateTabLabel } =
    useTabs<null>({
      maxTabs: MAX_SEARCH_TABS,
      initialTabs: [initialTab],
      initialActiveTabId: initialTab.id,
    });

  const { data: appsData } = useQuery<{ logApps: LogApp[] }>(LOG_APPS_QUERY);
  const apps = appsData?.logApps ?? [];

  const addTab = () => {
    openTab(createTab());
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <HistoryTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onNewTab={addTab}
      />
      {tabs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <Search className="h-10 w-10 opacity-30" />
          <p>No search tabs open</p>
          <Button variant="secondary" size="sm" onClick={addTab}>
            <Plus className="h-4 w-4 mr-1" />
            New Search
          </Button>
        </div>
      ) : (
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
      )}
    </div>
  );
}
```

HistoryTabBar도 제네릭 Tab을 사용하도록 수정:

`apps/ui/src/features/history/components/HistoryTabBar.tsx`:
```typescript
import { Plus, Search, X } from 'lucide-react';
import type { Tab } from '@/hooks/useTabs';
import { MAX_SEARCH_TABS } from '../graphql';

interface Props {
  tabs: Tab<null>[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

// ... (기존 UI 코드 유지)
```

history/graphql.ts에서 `SearchTab` 타입은 더 이상 필요 없으므로 제거한다.

**Step 4: graphql.ts 정리**

`apps/ui/src/features/live-stream/graphql.ts`에서 기존 `Tab` 타입과 `MAX_TABS` 제거 (MAX_TABS는 LiveStreamPage 로컬 상수로 이동):

```typescript
// 제거: export type Tab = ...
// 제거: export const MAX_TABS = 10;
// 추가:
export type LiveStreamTabData =
  | { type: 'container'; container: Container }
  | { type: 'service'; service: ServiceGroup };
```

`apps/ui/src/features/history/graphql.ts`에서 `SearchTab` 타입 제거:

```typescript
// 제거: export interface SearchTab { ... }
```

**Step 5: 빌드 확인**

Run: `cd apps/ui && npx tsc --noEmit`
Expected: 에러 없음

**Step 6: 커밋**

```bash
git add apps/ui/src/hooks/useTabs.ts apps/ui/src/features/
git commit -m "refactor(ui): extract useTabs shared hook

Consolidate tab management logic from LiveStreamPage and HistoryPage
into a reusable useTabs hook with generic data support and optional
sessionStorage persistence."
```

---

### Task 3: useLogBuffer 훅 추출

LogViewer와 ServiceLogViewer에서 중복되는 로그 버퍼 관리 로직(로그 축적, MAX_LOG_LINES 트리밍, rAF 배칭)을 공유 훅으로 추출한다.

**Files:**
- Create: `apps/ui/src/hooks/useLogBuffer.ts`
- Modify: `apps/ui/src/features/live-stream/components/LogViewer.tsx`
- Modify: `apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx`

**Step 1: useLogBuffer 훅 작성**

Create `apps/ui/src/hooks/useLogBuffer.ts`:

```typescript
import { useEffect, useRef, useState } from 'react';

interface UseLogBufferOptions {
  maxLines?: number;
  sortByTimestamp?: boolean;
}

export function useLogBuffer<T extends { timestamp: string }>(
  options: UseLogBufferOptions = {},
) {
  const { maxLines = 5000, sortByTimestamp = false } = options;
  const [logs, setLogs] = useState<T[]>([]);

  const batchRef = useRef<T[]>([]);
  const rafRef = useRef(0);

  const flushBatch = () => {
    rafRef.current = 0;
    const batch = batchRef.current;
    if (batch.length === 0) return;
    batchRef.current = [];
    setLogs((prev) => {
      const next = prev.concat(batch);
      if (
        sortByTimestamp &&
        prev.length > 0 &&
        batch.some((e) => e.timestamp < prev[prev.length - 1].timestamp)
      ) {
        next.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      return next.length > maxLines ? next.slice(-maxLines) : next;
    });
  };

  const addLog = (log: T) => {
    batchRef.current.push(log);
    if (rafRef.current === 0) {
      rafRef.current = requestAnimationFrame(flushBatch);
    }
  };

  const clearLogs = () => {
    batchRef.current = [];
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setLogs([]);
  };

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return { logs, addLog, clearLogs, lineCount: logs.length };
}
```

**Step 2: LogViewer에 useLogBuffer 적용**

`apps/ui/src/features/live-stream/components/LogViewer.tsx`:

```typescript
import { useSubscription } from '@apollo/client/react';
import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry } from '../graphql';
import { LogRow } from './LogRow';
import { useLogBuffer } from '@/hooks/useLogBuffer';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
// useEffect import 제거 (rAF cleanup이 useLogBuffer로 이동)
// batchRef, rafRef, flushBatch, MAX_LOG_LINES import 제거

// ... (나머지는 기존과 동일하되 useLogBuffer 사용)
```

주요 변경:
- `useState<LogEntry[]>([])` → `useLogBuffer<LogEntry>()`
- `batchRef`, `rafRef`, `flushBatch`, rAF cleanup useEffect 제거
- `onData` 콜백에서 직접 `addLog` 호출
- `setLogs([])` → `clearLogs()`

**Step 3: ServiceLogViewer에 useLogBuffer 적용**

`apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx`:

주요 변경:
- `useState<LogEntry[]>([])` → `useLogBuffer<LogEntry>({ sortByTimestamp: true })`
- `batchRef`, `rafRef`, `flushBatch`, `handleLog`, rAF cleanup useEffect 제거
- `ContainerSubscription`의 `onLog`에서 `addLog` 직접 호출
- `setLogs([])` → `clearLogs()`

**Step 4: 빌드 확인**

Run: `cd apps/ui && npx tsc --noEmit`
Expected: 에러 없음

**Step 5: 커밋**

```bash
git add apps/ui/src/hooks/useLogBuffer.ts apps/ui/src/features/live-stream/components/LogViewer.tsx apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx
git commit -m "refactor(ui): extract useLogBuffer shared hook

Consolidate log buffer management (rAF batching, max line trimming,
optional timestamp sorting) from LogViewer and ServiceLogViewer."
```

---

### Task 4: useAutoScroll 훅 추출

LogViewer와 ServiceLogViewer에서 중복되는 오토스크롤 로직을 공유 훅으로 추출한다.

**Files:**
- Create: `apps/ui/src/hooks/useAutoScroll.ts`
- Modify: `apps/ui/src/features/live-stream/components/LogViewer.tsx`
- Modify: `apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx`

**Step 1: useAutoScroll 훅 작성**

Create `apps/ui/src/hooks/useAutoScroll.ts`:

```typescript
import { useEffect, useRef, useState } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

interface UseAutoScrollOptions {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  itemCount: number;
  enabled?: boolean;
}

export function useAutoScroll({ virtualizer, itemCount, enabled = true }: UseAutoScrollOptions) {
  const [isFollowing, setIsFollowing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFollowing && enabled && itemCount > 0) {
      virtualizer.scrollToIndex(itemCount - 1, { align: 'end' });
    }
  }, [itemCount, isFollowing, enabled, virtualizer]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsFollowing((prev) => (prev === isAtBottom ? prev : isAtBottom));
  };

  const scrollToBottom = () => {
    setIsFollowing(true);
    virtualizer.scrollToIndex(itemCount - 1, { align: 'end' });
  };

  return { scrollRef, isFollowing, handleScroll, scrollToBottom };
}
```

**Step 2: LogViewer에 useAutoScroll 적용**

`apps/ui/src/features/live-stream/components/LogViewer.tsx`:

주요 변경:
- `useState(true)` (autoScroll) 제거
- `useRef<HTMLDivElement>(null)` (scrollRef) 제거
- autoScroll useEffect 제거
- `handleScroll` 함수 제거
- `useAutoScroll` 훅 사용:

```typescript
const { scrollRef, isFollowing, handleScroll, scrollToBottom } = useAutoScroll({
  virtualizer,
  itemCount: filteredLogs.length,
  enabled: !isGrepping,
});
```

- Follow 버튼: `!autoScroll` → `!isFollowing`, onClick → `scrollToBottom()`

**Step 3: ServiceLogViewer에 useAutoScroll 적용**

동일한 패턴으로 적용.

**Step 4: 빌드 확인**

Run: `cd apps/ui && npx tsc --noEmit`
Expected: 에러 없음

**Step 5: 커밋**

```bash
git add apps/ui/src/hooks/useAutoScroll.ts apps/ui/src/features/live-stream/components/LogViewer.tsx apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx
git commit -m "refactor(ui): extract useAutoScroll shared hook

Consolidate auto-scroll logic (follow mode, scroll detection,
scroll-to-bottom) from LogViewer and ServiceLogViewer."
```

---

### Task 5: useLogFilter 훅 추출

LogViewer와 ServiceLogViewer에서 중복되는 그립 필터링 로직을 공유 훅으로 추출한다.

**Files:**
- Create: `apps/ui/src/hooks/useLogFilter.ts`
- Modify: `apps/ui/src/features/live-stream/components/LogViewer.tsx`
- Modify: `apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx`

**Step 1: useLogFilter 훅 작성**

Create `apps/ui/src/hooks/useLogFilter.ts`:

```typescript
import { useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

export function useLogFilter<T extends { message: string }>(
  logs: T[],
  delay: number = 300,
) {
  const [grepQuery, setGrepQuery] = useState('');
  const debouncedGrep = useDebouncedValue(grepQuery, delay);
  const isGrepping = debouncedGrep.trim().length > 0;

  const filteredLogs = isGrepping
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(debouncedGrep.trim().toLowerCase()),
      )
    : logs;

  return { grepQuery, setGrepQuery, filteredLogs, isGrepping };
}
```

**Step 2: LogViewer에 useLogFilter 적용**

`apps/ui/src/features/live-stream/components/LogViewer.tsx`:

주요 변경:
- `useState('')` (grepQuery) 제거
- `useDebouncedValue` import 제거
- `debouncedGrep`, `isGrepping`, `filteredLogs` 계산 제거
- `useLogFilter` 훅 사용:

```typescript
const { grepQuery, setGrepQuery, filteredLogs, isGrepping } = useLogFilter(logs);
```

**Step 3: ServiceLogViewer에 useLogFilter 적용**

동일한 패턴으로 적용.

**Step 4: 빌드 확인**

Run: `cd apps/ui && npx tsc --noEmit`
Expected: 에러 없음

**Step 5: 커밋**

```bash
git add apps/ui/src/hooks/useLogFilter.ts apps/ui/src/features/live-stream/components/LogViewer.tsx apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx
git commit -m "refactor(ui): extract useLogFilter shared hook

Consolidate grep filtering logic (debounced search, case-insensitive
matching) from LogViewer and ServiceLogViewer."
```

---

### Task 6: 정리 및 최종 검증

빈 디렉토리 삭제, 미사용 import 정리, 전체 빌드/린트 확인.

**Files:**
- Verify: 전체 `apps/ui/src/` 디렉토리

**Step 1: 미사용 export 정리**

`apps/ui/src/features/live-stream/graphql.ts`:
- `MAX_LOG_LINES`가 더 이상 컴포넌트에서 직접 import되지 않는지 확인 (useLogBuffer 기본값으로 이동됨). 만약 아직 import하는 곳이 있으면 유지.
- `MAX_TABS` 제거 확인 (LiveStreamPage 로컬로 이동됨)

**Step 2: 전체 빌드 확인**

Run: `cd apps/ui && npx tsc --noEmit`
Expected: 에러 없음

Run: `pnpm run lint`
Expected: 에러 없음

Run: `npx nx build ui`
Expected: 빌드 성공

**Step 3: 최종 디렉토리 구조 확인**

```bash
find apps/ui/src -type f | sort
```

Expected:
```
apps/ui/src/App.tsx
apps/ui/src/main.tsx
apps/ui/src/vite-env.d.ts
apps/ui/src/components/AnsiText.tsx
apps/ui/src/components/Navigation.tsx
apps/ui/src/components/NotFoundPage.tsx
apps/ui/src/components/ui/...
apps/ui/src/features/auth/AuthContext.tsx
apps/ui/src/features/auth/AuthGuard.tsx
apps/ui/src/features/auth/LoginPage.tsx
apps/ui/src/features/auth/graphql.ts
apps/ui/src/features/auth/token.ts
apps/ui/src/features/history/HistoryPage.tsx
apps/ui/src/features/history/graphql.ts
apps/ui/src/features/history/components/HistoryTabBar.tsx
apps/ui/src/features/history/components/SearchPanel.tsx
apps/ui/src/features/live-stream/LiveStreamPage.tsx
apps/ui/src/features/live-stream/graphql.ts
apps/ui/src/features/live-stream/components/ContainerList.tsx
apps/ui/src/features/live-stream/components/LogRow.tsx
apps/ui/src/features/live-stream/components/LogViewer.tsx
apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx
apps/ui/src/features/live-stream/components/TabBar.tsx
apps/ui/src/hooks/useAutoScroll.ts
apps/ui/src/hooks/useDebouncedValue.ts
apps/ui/src/hooks/useLogBuffer.ts
apps/ui/src/hooks/useLogFilter.ts
apps/ui/src/hooks/useTabs.ts
apps/ui/src/lib/apollo.ts
apps/ui/src/lib/utils.ts
```

**Step 4: 커밋**

```bash
git add -A apps/ui/src/
git commit -m "refactor(ui): final cleanup after structure refactoring

Remove unused exports and verify build passes."
```
