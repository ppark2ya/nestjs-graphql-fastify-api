# Log Streamer: chi 라우터 도입 및 프로젝트 구조 개선

## 목표

- chi 라우터 도입으로 라우트 그룹핑 및 확장성 확보
- HTTP / WebSocket 핸들러 등록 패턴 통일
- WebSocket 핸들러 내부 로직 분리 (251줄 → 3파일)

## 접근 방식

**A안 (최소 변경)** 채택: chi 라우터 교체 + 핸들러 컨벤션 통일 + WebSocket 내부 구조 분리

## 디렉토리 구조 (변경 후)

```
internal/
├── config/config.go                    # 변경 없음
├── docker/client.go                    # 변경 없음
├── handler/
│   ├── health.go                       # 클로저 팩토리 (struct 제거)
│   ├── containers.go                   # 클로저 팩토리 (struct 제거)
│   ├── logfiles.go                     # struct 유지, RegisterRoutes 제거, 메서드 공개
│   └── ws/
│       ├── handler.go                  # WebSocket 업그레이드 + 메시지 디스패치
│       ├── subscription.go             # subscriptionManager (구독 관리)
│       └── stream.go                   # Docker 로그 스트리밍 (mux/tty)
├── middleware/
│   ├── cors.go                         # 변경 없음 (chi 호환 시그니처)
│   ├── logging.go                      # 변경 없음
│   └── correlation.go                  # 변경 없음
├── logreader/                          # 변경 없음
├── router/
│   └── router.go                       # NEW: chi 라우터 정의
└── server/server.go                    # 간소화 (router.New() 호출만)
```

## 라우터 설계 (router/router.go)

```go
func New(dockerClient *docker.Client, logReader *logreader.Reader, cfg *config.Config) *chi.Mux {
    r := chi.NewRouter()

    // 글로벌 미들웨어
    r.Use(middleware.CORS)
    r.Use(middleware.Correlation)
    r.Use(middleware.Logging)

    r.Get("/health", handler.Health(dockerClient))

    // REST API 그룹
    r.Route("/api", func(r chi.Router) {
        r.Get("/containers", handler.Containers(dockerClient))

        r.Route("/logs", func(r chi.Router) {
            h := handler.NewLogFilesHandler(logReader, dockerClient)
            r.Get("/apps", h.Apps)
            r.Get("/files", h.Files)
            r.Get("/search", h.Search)
            r.Get("/stats", h.Stats)
        })
    })

    // WebSocket 그룹
    r.Route("/ws", func(r chi.Router) {
        r.Get("/logs", ws.Handle(dockerClient))
    })

    return r
}
```

## 핸들러 컨벤션

### 상태 없는 핸들러 → 클로저 팩토리

```go
// handler/health.go
func Health(dockerClient *docker.Client) http.HandlerFunc { ... }

// handler/containers.go
func Containers(dockerClient *docker.Client) http.HandlerFunc { ... }
```

### 상태 있는 핸들러 → struct 유지

```go
// handler/logfiles.go
type LogFilesHandler struct { reader, dockerClient, nodeName, nodeOnce }
func (h *LogFilesHandler) Apps(w, r)   { ... }
func (h *LogFilesHandler) Files(w, r)  { ... }
func (h *LogFilesHandler) Search(w, r) { ... }
func (h *LogFilesHandler) Stats(w, r)  { ... }
```

## WebSocket 핸들러 분리

### ws/handler.go — 진입점

- `Handle(dockerClient) http.HandlerFunc` 팩토리
- WebSocket 업그레이드, 메시지 읽기 루프, subscribe/unsubscribe 디스패치
- 공유 타입 `Message`, `upgrader` 정의

### ws/subscription.go — 구독 관리

- `subscriptionManager` struct: conn, writeMu, subs map, subsMu 캡슐화
- `Subscribe(ctx, containerID)`: 중복 체크, 컨테이너 검증, 스트리밍 고루틴 시작
- `Unsubscribe(containerID)`: cancel 채널 close, 맵 정리
- `CloseAll()`: 전체 정리
- `writeJSON(msg)`: thread-safe WebSocket 쓰기

### ws/stream.go — 로그 스트리밍

- `streamLogs()`: TTY/Mux 분기
- `streamMuxLogs()`: Docker multiplexed stream 파싱
- `streamTTYLogs()`: TTY raw stream 파싱
- `sendLogLine()`: 타임스탬프 파싱 + WebSocket 전송

## 변경 요약

| 항목 | 내용 |
|------|------|
| 의존성 추가 | `github.com/go-chi/chi/v5` |
| 새 파일 | `router/router.go`, `handler/ws/handler.go`, `ws/subscription.go`, `ws/stream.go` |
| 수정 파일 | `server.go`, `health.go`, `containers.go`, `logfiles.go` |
| 삭제 파일 | `handler/logs.go` (ws/ 패키지로 대체) |
| 변경 없음 | `middleware/*`, `logreader/*`, `docker/*`, `config/*`, `cmd/server/main.go` |
