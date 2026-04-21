# LiveStream Find 모드 설계

## 개요

기존 grep 입력창에 모드 토글을 추가하여 **Filter 모드**(기존 동작)와 **Find 모드**(vi-like 하이라이팅 + 네비게이션)를 전환한다.

## 요구사항

- Filter 모드: 기존과 동일 (매칭 줄만 표시)
- Find 모드: 전체 줄 표시 + 키워드 하이라이팅 + n/Shift+N으로 매치 간 이동
- 모드 전환: 입력창 옆 아이콘 토글 버튼 (깔때기 ↔ 돋보기)
- 현재 매치: 주황색 배경, 나머지 매치: 노란색 배경
- find 모드 진입 시 auto-scroll 중지

## 모드 비교

| | Filter 모드 (기존) | Find 모드 (신규) |
|---|---|---|
| 아이콘 | ListFilter (깔때기) | Search (돋보기) |
| 동작 | 매칭 줄만 표시 | 전체 줄 표시 + 키워드 하이라이팅 |
| 네비게이션 | 없음 | n(다음) / Shift+N(이전) |
| 현재 매치 표시 | - | 주황색 배경 (나머지: 노란색) |
| Auto-scroll | 비활성 | 비활성 (해제 시 복귀) |
| 카운터 | `10/100 lines` | `3/15 matches` (현재위치/전체매치수) |

## 컴포넌트 설계

### useLogSearch 훅 (신규)

기존 `useLogFilter`를 확장하여 find 모드를 지원하는 통합 훅.

```typescript
interface UseLogSearchReturn<T> {
  // 공통
  query: string;
  setQuery: (q: string) => void;
  mode: 'filter' | 'find';
  setMode: (m: 'filter' | 'find') => void;
  isSearching: boolean;

  // filter 모드
  filteredLogs: T[];

  // find 모드
  matches: Array<{ logIndex: number; positions: Array<[number, number]> }>;
  currentMatchIndex: number;
  totalMatches: number;
  next: () => void;
  prev: () => void;
  currentMatchLogIndex: number | null; // 현재 매치가 있는 로그 줄 인덱스
}
```

### HighlightedAnsiText 컴포넌트 (신규)

`AnsiText`를 확장하여 find 모드에서 키워드를 하이라이팅.

```typescript
interface HighlightedAnsiTextProps {
  text: string;
  className?: string;
  query?: string;
  isCurrentMatchLine?: boolean;
  currentMatchPositionInLine?: number; // 이 줄에서 몇 번째 매치가 현재인지
}
```

하이라이팅 전략:
1. `ansi-to-html`로 ANSI → HTML 변환
2. HTML 텍스트 노드만 대상으로 키워드를 `<mark>` 태그로 래핑
3. 현재 매치: `<mark class="current-match">` (주황색), 나머지: `<mark class="match">` (노란색)

### 키바인딩

- `n` — 다음 매치로 스크롤 (find 모드 + 입력창 비포커스)
- `Shift+N` — 이전 매치로 스크롤
- 다른 input 요소에 포커스 시 비활성

### 스크롤 동작

`virtualizer.scrollToIndex(logIndex)`로 현재 매치가 위치한 줄로 이동.

## 영향 범위

### 수정 파일
- `apps/ui/src/hooks/useLogFilter.ts` → `useLogSearch.ts`로 확장 (기존 API 호환 유지)
- `apps/ui/src/components/AnsiText.tsx` → `HighlightedAnsiText.tsx` 추가
- `apps/ui/src/features/live-stream/components/LogViewer.tsx` — 모드 토글 UI + find 모드 통합
- `apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx` — 동일
- `apps/ui/src/features/live-stream/components/LogRow.tsx` — HighlightedAnsiText 사용

### 신규 파일
- `apps/ui/src/hooks/useLogSearch.ts`
- `apps/ui/src/components/HighlightedAnsiText.tsx`
- `apps/ui/src/utils/highlight-html.ts` (HTML 텍스트 노드 내 키워드 하이라이팅 유틸)

## 성능 고려사항

- 매치 인덱스 계산은 debounced query 변경 시에만 수행 (`useMemo`)
- 5000줄 버퍼에서 전체 매치 위치 계산은 충분히 빠름 (단순 string search)
- HighlightedAnsiText는 query가 있을 때만 하이라이팅 로직 실행
- virtualizer overscan(20줄)으로 보이는 영역 + 여유분만 렌더링
