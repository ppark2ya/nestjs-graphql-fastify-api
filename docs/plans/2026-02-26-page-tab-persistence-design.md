# Page Tab Persistence Design

## Problem

Live Stream과 History 페이지를 오갈 때 React Router가 컴포넌트를 unmount/remount하여 모든 상태(탭, WebSocket 구독, 스크롤 위치, 검색 결과)가 소실된다.

## Solution

CSS `display` 토글로 두 페이지를 항상 마운트 상태로 유지. 이미 각 페이지 내부에서 동일한 패턴을 사용 중이므로 일관성 있는 접근.

## URL 변경

- `/` → `/live-stream` 으로 변경
- `/` 접근 시 `/live-stream`으로 리다이렉트

## 변경 파일

### `App.tsx`

- `<Routes>`는 `/login` 렌더링 + 리다이렉트 용도로만 사용
- 인증 상태에서 `/live-stream`, `/history` 경로일 때 두 페이지를 동시에 렌더링하되 `display` CSS로 활성 페이지만 표시
- `useLocation().pathname`으로 활성 페이지 결정

### `Navigation.tsx`

- NavLink href: `/` → `/live-stream`

### 영향 없는 파일

- `LiveStreamPage.tsx` — 변경 없음
- `HistoryPage.tsx` — 변경 없음
