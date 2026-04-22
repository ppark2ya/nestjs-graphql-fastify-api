# LiveStream 로그 Copy & Pause 기능 설계

## 배경

LiveStream에서 실시간 로그를 분석할 때 두 가지 문제가 있음:
1. 로그 Copy 시 timestamp, containerId, stream 등 메타데이터가 함께 복사됨
2. 스크롤을 올려서 로그를 보고 있을 때 새 로그가 들어오면 맨 아래로 밀려남

## 기능 1: Copy 시 메시지만 복사

### 접근: CSS `user-select: none`

메시지 외 컬럼(timestamp, containerId, stream, nodeName)에 `select-none` 클래스를 적용하여 드래그 시 메시지 부분만 선택되도록 함.

### 변경 파일

- `apps/ui/src/features/live-stream/components/LogRow.tsx`

### 변경 내용

`LogRow`, `ServiceLogRow`, `ServiceEventRow` 컴포넌트에서:
- timestamp `<span>`에 `select-none` 추가
- stream `<span>`에 `select-none` 추가
- containerId/nodeName `<span>`에 `select-none` 추가

## 기능 2: Pause 버튼으로 스크롤 고정

### 접근: 명시적 `isPaused` 상태로 auto-scroll 차단

로그 수신은 계속하되, Pause 상태에서는 `scrollToIndex` 호출을 완전히 차단.

### 변경 파일

- `apps/ui/src/hooks/useAutoScroll.ts`
- `apps/ui/src/features/live-stream/components/LogViewer.tsx`
- `apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx`

### useAutoScroll 변경

- `isPaused` 상태 추가
- `isPaused === true`일 때 `scrollToIndex` 호출 차단
- `togglePause` 함수 노출
- `scrollToBottom` 호출 시 `isPaused = false` 자동 해제

### UI 변경

헤더 영역에 Pause/Resume 토글 버튼 추가:
- `isPaused=false` → Pause 버튼 (Pause 아이콘)
- `isPaused=true` → Resume 버튼 (Play 아이콘, 활성 스타일)
- Follow 클릭 시 pause 해제 + 맨 아래 이동

### 상태 흐름

```
초기: isPaused=false, isFollowing=true → 자동 스크롤
Pause 클릭: isPaused=true → 스크롤 고정, 로그 계속 수신
스크롤 업: isFollowing=false
Follow 클릭: isPaused=false, isFollowing=true → 맨 아래로
```
