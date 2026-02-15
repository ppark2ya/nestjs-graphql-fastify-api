# Docker Log Viewer - Design Document

## Purpose

Gateway와 Log Streamer 간 WebSocket 통신을 검증하기 위한 테스트용 프론트엔드 UI.
Docker 컨테이너 로그를 GraphQL Subscription으로 실시간 수신하여 화면에 표시한다.

## Tech Stack

- **Vite + React + TypeScript**
- **Apollo Client**: GraphQL Query + Subscription
- **graphql-ws**: Apollo Client의 WebSocket transport
- **Tailwind CSS**: 스타일링
- **Nx**: `apps/log-viewer/`에 프로젝트 등록

## Architecture

```
Browser (React App)
  ├── useQuery(CONTAINERS) ──→ Gateway :4000/graphql (HTTP)
  └── useSubscription(LOG) ──→ Gateway :4000/graphql (WebSocket, graphql-ws)
```

- API Key: `test-api-key` 하드코딩 (테스트 목적)
- Gateway URL: `http://localhost:4000/graphql` 기본값

## Components

### App
- 전체 레이아웃 (2-panel: 좌측 컨테이너 목록, 우측 로그 뷰어)
- Apollo Client 인스턴스 관리 (HTTP link + WS link split)
- 선택된 컨테이너 상태 관리

### ContainerList
- `useQuery`로 컨테이너 목록 조회
- 컨테이너 선택/해제 UI
- 상태(state) 표시 (running, stopped 등)

### LogViewer
- `useSubscription`으로 선택된 컨테이너 로그 실시간 수신
- 자동 스크롤 (하단 고정, 수동 스크롤 시 일시정지)
- stdout/stderr 구분 표시 (색상)
- Clear 버튼

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  Docker Log Viewer                              │
├──────────────┬──────────────────────────────────┤
│ Containers   │  Logs - container_name           │
│              │                                  │
│ ● nginx      │  10:00:01 [stdout] GET /health   │
│ ○ redis      │  10:00:02 [stderr] Error: ...    │
│ ○ gateway    │  10:00:03 [stdout] Connected     │
│              │                                  │
│              │                          [Clear] │
└──────────────┴──────────────────────────────────┘
```

## Nx Integration

- `apps/log-viewer/project.json`에 dev, build 타겟 정의
- monorepo 내 다른 앱과 의존성 없음 (독립 실행)
- `pnpm run start:log-viewer:dev`로 실행
