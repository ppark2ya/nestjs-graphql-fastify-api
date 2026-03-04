# UI Transitions & Effects Design

## Overview

UI 앱에 code splitting, 페이지/탭 전환 애니메이션, 로그 행 트랜지션, 검색 로딩 UI를 추가한다.

## Decisions

- **애니메이션 라이브러리**: Framer Motion (페이지/탭 전환)
- **로그 행 애니메이션**: CSS @keyframes (성능)
- **페이지 마운트**: 현재 keep-mounted 구조 유지
- **전환 스타일**: crossfade (opacity + scale)

## 1. Code Splitting

`React.lazy()` + `Suspense`로 3개 페이지 분리:

- `LoginPage` — 인증 전에만 필요
- `LiveStreamPage` — 인증 후 live-stream 경로
- `HistoryPage` — 인증 후 history 경로

한번 로드되면 keep-mounted 구조로 계속 마운트 유지.

## 2. Page Transition (Keep-mounted Crossfade)

`display: none/flex` 토글 → Framer Motion `motion.div`로 교체:

```
활성: opacity 1, scale 1
비활성: opacity 0, scale 0.98, pointerEvents 'none'
duration: 150ms
```

`animate` prop으로 pathname에 따라 전환. `AnimatePresence` 불필요 (unmount 안 함).

## 3. Tab Content Transition (Crossfade)

LiveStreamPage, HistoryPage 탭 컨텐츠에 동일한 crossfade:

```
활성 탭: opacity 1, scale 1
비활성 탭: opacity 0, scale 0.98, pointerEvents 'none'
duration: 150ms
```

## 4. Log Row Animation (CSS @keyframes)

Framer Motion 대신 CSS로 구현 (virtual scrolling 성능):

```css
@keyframes log-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- `useLogBuffer`에서 새로 추가된 행에 `isNew` 플래그
- auto-scroll ON일 때만 애니메이션 클래스 적용
- `animation-duration: 150ms`, `animation-fill-mode: forwards`

## 5. History Search Loading UI

- **Progress Bar**: 검색 패널 상단 indeterminate animated bar
- **Table Skeleton**: 검색 중 pulse 애니메이션 skeleton 행 8~10개
- shadcn/ui `Skeleton` 컴포넌트 활용
- Apollo `loading` 상태 기반

## 6. ContainerList Loading

"Loading containers..." 텍스트 → skeleton 카드로 교체
