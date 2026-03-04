# UI Pages & Components 구조 리팩토링 디자인

## 목적

UI 앱의 디렉토리 구조를 feature-based로 재편하고, 컴포넌트 간 중복 로직을 공유 훅으로 추출하여 코드 재사용성과 유지보수성을 향상시킨다.

## 현재 구조

```
src/
├── auth/              # 인증 (Context, Guard, token, graphql)
├── components/        # Navigation, AnsiText, ui/
├── hooks/             # useDebouncedValue
├── lib/               # apollo, utils
└── pages/
    ├── LoginPage.tsx
    ├── NotFoundPage.tsx
    ├── live-stream/   # LiveStreamPage + 6개 하위 컴포넌트
    └── history/       # HistoryPage + 3개 하위 컴포넌트
```

### 현재 문제점

1. **디렉토리 구조**: `auth/`는 feature인데 `pages/` 밖에 있고, LoginPage는 `pages/`에 있어 인증 관련 코드가 분산됨
2. **컴포넌트 크기**: LiveStreamPage에 탭 관리, 반응형 레이아웃, 컨테이너 선택 로직이 모두 혼합
3. **코드 중복**: LogViewer와 ServiceLogViewer가 가상화, 오토스크롤, 로그 버퍼 관리, 그립 필터링 로직을 각각 독립적으로 구현
4. **탭 관리 중복**: LiveStreamPage와 HistoryPage가 유사한 탭 관리 로직을 별도로 구현

## 목표 구조

```
src/
├── App.tsx
├── main.tsx
│
├── features/
│   ├── auth/                    # 인증 기능 통합
│   │   ├── AuthContext.tsx
│   │   ├── AuthGuard.tsx
│   │   ├── token.ts
│   │   ├── graphql.ts
│   │   └── LoginPage.tsx
│   │
│   ├── live-stream/             # 실시간 로그 스트리밍
│   │   ├── LiveStreamPage.tsx
│   │   ├── graphql.ts
│   │   ├── components/
│   │   │   ├── ContainerList.tsx
│   │   │   ├── LogViewer.tsx
│   │   │   ├── ServiceLogViewer.tsx
│   │   │   ├── LogRow.tsx
│   │   │   └── TabBar.tsx
│   │   └── hooks/
│   │       └── useContainers.ts
│   │
│   └── history/                 # 로그 검색
│       ├── HistoryPage.tsx
│       ├── graphql.ts
│       ├── components/
│       │   ├── SearchPanel.tsx
│       │   └── HistoryTabBar.tsx
│       └── hooks/
│
├── components/                  # 공유 UI 컴포넌트
│   ├── Navigation.tsx
│   ├── AnsiText.tsx
│   ├── NotFoundPage.tsx
│   └── ui/                      # shadcn/ui (변경 없음)
│
├── hooks/                       # 공유 훅
│   ├── useTabs.ts              # NEW
│   ├── useLogBuffer.ts         # NEW
│   ├── useAutoScroll.ts        # NEW
│   ├── useLogFilter.ts         # NEW
│   └── useDebouncedValue.ts
│
└── lib/                         # 유틸리티 (변경 없음)
    ├── apollo.ts
    └── utils.ts
```

## 공유 훅 설계

### useTabs

LiveStreamPage와 HistoryPage의 탭 관리 로직 통합.

```typescript
interface UseTabsOptions<T> {
  maxTabs: number;
  storageKey?: string;
  onMaxReached?: (tabs: Tab<T>[]) => string;
}

interface Tab<T> {
  id: string;
  label: string;
  data: T;
}

function useTabs<T>(options: UseTabsOptions<T>): {
  tabs: Tab<T>[];
  activeTabId: string | null;
  openTab: (tab: Tab<T>) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabLabel: (id: string, label: string) => void;
};
```

### useLogBuffer

LogViewer/ServiceLogViewer 공통 로그 버퍼. rAF 배칭, 최대 라인 트리밍.

```typescript
function useLogBuffer(maxLines?: number): {
  logs: LogLine[];
  addLog: (log: LogLine) => void;
  addLogs: (logs: LogLine[]) => void;
  clearLogs: () => void;
  lineCount: number;
};
```

### useAutoScroll

가상화된 로그 뷰어의 오토스크롤 관리.

```typescript
function useAutoScroll(virtualizer: Virtualizer, logCount: number): {
  isFollowing: boolean;
  toggleFollow: () => void;
  scrollToBottom: () => void;
};
```

### useLogFilter

그립 필터링 (디바운스 적용).

```typescript
function useLogFilter(logs: LogLine[], delay?: number): {
  grepQuery: string;
  setGrepQuery: (query: string) => void;
  filteredLogs: LogLine[];
};
```

## 컴포넌트 책임 변경

### LiveStreamPage

- **제거**: 탭 sessionStorage 직접 관리, 탭 초과 자동 정리 로직
- **위임**: `useTabs` 훅
- **유지**: 레이아웃 렌더링 (ResizablePanelGroup/Sheet), 컨테이너/서비스 선택 → openTab 호출

### LogViewer / ServiceLogViewer

- **제거**: 로그 배열 직접 관리, 스크롤 로직, 필터 로직
- **위임**: `useLogBuffer`, `useAutoScroll`, `useLogFilter`
- **유지**: 구독 연결, UI 렌더링 (별도 컴포넌트로 유지 — 레플리카 컬러링 등 UI 차이)

### HistoryPage

- **제거**: 탭 상태 직접 관리
- **위임**: `useTabs` 훅
- **유지**: 앱 목록 로드, SearchPanel 렌더링

## 마이그레이션 전략

점진적 리팩토링. 각 단계는 독립 커밋, 매 단계 후 앱 정상 동작.

| 단계 | 작업 | 영향 범위 |
|------|------|-----------|
| 1 | `features/` 디렉토리 생성 + 파일 이동 (import 경로만 수정) | 전체 |
| 2 | `useTabs` 훅 추출 + LiveStreamPage/HistoryPage 적용 | 3파일 |
| 3 | `useLogBuffer` 훅 추출 + LogViewer/ServiceLogViewer 적용 | 3파일 |
| 4 | `useAutoScroll` 훅 추출 + 적용 | 3파일 |
| 5 | `useLogFilter` 훅 추출 + 적용 | 3파일 |
| 6 | 정리: 빈 디렉토리 삭제, import 정리, 빌드/린트 확인 | 전체 |

## 범위 외 (의도적으로 하지 않는 것)

- shadcn/ui 컴포넌트 구조 변경
- AnsiText, Navigation 등 이미 적절한 크기의 컴포넌트 재분리
- Apollo Client 설정이나 auth 로직 리팩토링
- 새로운 기능 추가
