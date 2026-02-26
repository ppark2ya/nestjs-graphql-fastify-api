# Login Page Redesign Design

## Goal

IMQA 스타일의 2분할 레이아웃으로 로그인 페이지를 세련되게 리디자인. 모바일 반응형 지원.

## Design Decisions

- **애니메이션**: CSS-only (@keyframes). 외부 라이브러리 없음.
- **테마**: 기존 다크 테마 유지
- **모바일**: 좌측 브랜딩 영역 숨기고 폼만 전체 화면 표시

## Layout

### Desktop (>=1024px)
- 좌측 50%: 딥 블루~퍼플 그라데이션 + 부유하는 글래스모피즘 도형 애니메이션
- 우측 50%: 기존 다크 테마 로그인 폼 (수직 중앙, max-w-sm)

### Tablet (768px~1023px)
- 좌측 40% / 우측 60%

### Mobile (<768px)
- 좌측 영역 숨김 (hidden)
- 폼 전체 화면, 은은한 그라데이션 배경

## CSS Animation Details

### 배경
- `linear-gradient(135deg, #1e3a5f, #4c1d95, #1e3a5f)`

### 부유하는 도형 (5~7개)
- 반투명 원, 사각형, 다이아몬드 등 기하학적 도형
- `border: 1px solid rgba(255,255,255,0.1)` + `backdrop-filter: blur(8px)` (글래스모피즘)
- 각 도형에 서로 다른 `@keyframes float` (8~20초 주기, ease-in-out infinite)
- 미묘한 회전 + 상하 이동 조합

### 글로우 효과
- 큰 원형 `radial-gradient` 2개가 느리게 이동하며 은은한 빛 효과

## Form Changes

- Card 래퍼 제거 -> 우측 절반 전체 사용
- 비즈니스 로직(credentials -> OTP 전환) 그대로 유지
- shadcn/ui 컴포넌트(Input, Button, InputOTP) 그대로 사용

## File Changes

- `apps/ui/src/pages/LoginPage.tsx` — 레이아웃 구조 + CSS 클래스 변경
- `apps/ui/src/index.css` — @keyframes 애니메이션 + 도형 스타일 추가
- 새 파일 없음, 새 의존성 없음
