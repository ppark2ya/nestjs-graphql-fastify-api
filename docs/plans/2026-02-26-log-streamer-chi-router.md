# Log Streamer chi 라우터 도입 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** log-streamer Go 서비스에 chi 라우터를 도입하고, 핸들러 컨벤션 통일 및 WebSocket 핸들러 구조 분리를 수행한다.

**Architecture:** `http.ServeMux`를 `chi.Mux`로 교체하고, 라우트 정의를 `router/router.go`로 분리한다. 상태 없는 HTTP 핸들러는 클로저 팩토리로, WebSocket 핸들러는 `handler/ws/` 서브패키지로 분리한다. 미들웨어는 이미 chi 호환 시그니처이므로 변경 없이 재사용한다.

**Tech Stack:** Go, chi/v5, gorilla/websocket, Docker SDK

**Design doc:** `docs/plans/2026-02-26-log-streamer-chi-router-design.md`

---

### Task 1: chi 의존성 추가

**Files:**
- Modify: `apps/log-streamer/go.mod`

**Step 1: chi 모듈 추가**

Run:
```bash
cd apps/log-streamer && go get github.com/go-chi/chi/v5
```

**Step 2: go.mod 확인**

Run:
```bash
cd apps/log-streamer && grep chi go.mod
```

Expected: `github.com/go-chi/chi/v5 v5.x.x`

**Step 3: Commit**

```bash
git add apps/log-streamer/go.mod apps/log-streamer/go.sum
git commit -m "chore(log-streamer): add chi/v5 dependency"
```

---

### Task 2: router 패키지 생성

**Files:**
- Create: `apps/log-streamer/internal/router/router.go`

**Step 1: router.go 작성**

이 단계에서는 기존 핸들러를 그대로 사용하여 라우터만 먼저 구성한다. 기존 `http.Handler` 인터페이스 핸들러들은 `.ServeHTTP`를 직접 참조한다.

```go
package router

import (
	"github.com/go-chi/chi/v5"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/handler"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/logreader"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/middleware"
)

func New(dockerClient *docker.Client, logReader *logreader.Reader) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.CORS)
	r.Use(middleware.Correlation)
	r.Use(middleware.Logging)

	// Health check
	healthHandler := handler.NewHealthHandler(dockerClient)
	r.Get("/health", healthHandler.ServeHTTP)

	// REST API
	r.Route("/api", func(r chi.Router) {
		containersHandler := handler.NewContainersHandler(dockerClient)
		r.Get("/containers", containersHandler.ServeHTTP)

		r.Route("/logs", func(r chi.Router) {
			h := handler.NewLogFilesHandler(logReader, dockerClient)
			h.RegisterChiRoutes(r)
		})
	})

	// WebSocket
	logsHandler := handler.NewLogsHandler(dockerClient)
	r.Route("/ws", func(r chi.Router) {
		r.Get("/logs", logsHandler.ServeHTTP)
	})

	return r
}
```

> Note: 이 단계에서는 기존 핸들러 코드를 전혀 변경하지 않는다. `LogFilesHandler`에 `RegisterChiRoutes(chi.Router)` 임시 메서드를 추가한다.

**Step 2: LogFilesHandler에 RegisterChiRoutes 임시 메서드 추가**

`apps/log-streamer/internal/handler/logfiles.go`에 추가:

```go
func (h *LogFilesHandler) RegisterChiRoutes(r interface{ Get(string, http.HandlerFunc) }) {
	r.Get("/apps", h.handleApps)
	r.Get("/files", h.handleFiles)
	r.Get("/search", h.handleSearch)
	r.Get("/stats", h.handleStats)
}
```

**Step 3: server.go를 router 패키지 사용으로 변경**

`apps/log-streamer/internal/server/server.go`를 수정:

```go
package server

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/config"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/logreader"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/router"
)

type Server struct {
	httpServer   *http.Server
	dockerClient *docker.Client
	config       *config.Config
}

func New(cfg *config.Config) (*Server, error) {
	dockerClient, err := docker.NewClient()
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}

	return &Server{
		dockerClient: dockerClient,
		config:       cfg,
	}, nil
}

func (s *Server) Start() error {
	logReader := logreader.NewReader(s.config.LogDir)
	r := router.New(s.dockerClient, logReader)

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.config.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Starting log-streamer server on port %d", s.config.Port)
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	log.Println("Shutting down server...")

	if err := s.dockerClient.Close(); err != nil {
		log.Printf("Error closing docker client: %v", err)
	}

	return s.httpServer.Shutdown(ctx)
}
```

**Step 4: 빌드 확인**

Run:
```bash
cd apps/log-streamer && go build ./...
```

Expected: 빌드 성공

**Step 5: Commit**

```bash
git add apps/log-streamer/internal/router/router.go apps/log-streamer/internal/server/server.go apps/log-streamer/internal/handler/logfiles.go
git commit -m "refactor(log-streamer): introduce chi router and router package"
```

---

### Task 3: HTTP 핸들러를 클로저 팩토리로 변환

**Files:**
- Modify: `apps/log-streamer/internal/handler/health.go`
- Modify: `apps/log-streamer/internal/handler/containers.go`
- Modify: `apps/log-streamer/internal/router/router.go`

**Step 1: health.go를 클로저 팩토리로 변환**

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

type healthResponse struct {
	Status string `json:"status"`
	Docker string `json:"docker"`
}

func Health(dockerClient *docker.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		response := healthResponse{
			Status: "ok",
			Docker: "connected",
		}

		_, err := dockerClient.Ping(r.Context())
		if err != nil {
			response.Docker = "disconnected"
			w.WriteHeader(http.StatusServiceUnavailable)
		}

		json.NewEncoder(w).Encode(response)
	}
}
```

**Step 2: containers.go를 클로저 팩토리로 변환**

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

func Containers(dockerClient *docker.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		containers, err := dockerClient.ListContainers(r.Context())
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "failed to list containers: " + err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(containers)
	}
}
```

**Step 3: router.go 업데이트 — 클로저 팩토리 사용**

health, containers 라우트를 변경:

```go
	// Health check
	r.Get("/health", handler.Health(dockerClient))

	// REST API
	r.Route("/api", func(r chi.Router) {
		r.Get("/containers", handler.Containers(dockerClient))
		// ... logs 그룹은 동일
	})
```

**Step 4: 빌드 확인**

Run:
```bash
cd apps/log-streamer && go build ./...
```

Expected: 빌드 성공

**Step 5: Commit**

```bash
git add apps/log-streamer/internal/handler/health.go apps/log-streamer/internal/handler/containers.go apps/log-streamer/internal/router/router.go
git commit -m "refactor(log-streamer): convert health and containers handlers to closure factories"
```

---

### Task 4: LogFilesHandler 메서드 공개 + RegisterRoutes 정리

**Files:**
- Modify: `apps/log-streamer/internal/handler/logfiles.go`
- Modify: `apps/log-streamer/internal/router/router.go`

**Step 1: LogFilesHandler 메서드명 변경 및 RegisterRoutes 제거**

`logfiles.go`에서:
- `handleApps` → `Apps` (public)
- `handleFiles` → `Files` (public)
- `handleSearch` → `Search` (public)
- `handleStats` → `Stats` (public)
- `RegisterRoutes(*http.ServeMux)` 삭제
- `RegisterChiRoutes` 삭제

**Step 2: router.go에서 직접 메서드 등록**

```go
		r.Route("/logs", func(r chi.Router) {
			h := handler.NewLogFilesHandler(logReader, dockerClient)
			r.Get("/apps", h.Apps)
			r.Get("/files", h.Files)
			r.Get("/search", h.Search)
			r.Get("/stats", h.Stats)
		})
```

**Step 3: 빌드 확인**

Run:
```bash
cd apps/log-streamer && go build ./...
```

Expected: 빌드 성공

**Step 4: Commit**

```bash
git add apps/log-streamer/internal/handler/logfiles.go apps/log-streamer/internal/router/router.go
git commit -m "refactor(log-streamer): expose LogFilesHandler methods and remove RegisterRoutes"
```

---

### Task 5: WebSocket 핸들러를 ws 패키지로 분리

**Files:**
- Create: `apps/log-streamer/internal/handler/ws/handler.go`
- Create: `apps/log-streamer/internal/handler/ws/subscription.go`
- Create: `apps/log-streamer/internal/handler/ws/stream.go`
- Delete: `apps/log-streamer/internal/handler/logs.go`
- Modify: `apps/log-streamer/internal/router/router.go`

**Step 1: ws/handler.go 작성 — 진입점 + 메시지 디스패치**

```go
package ws

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Message represents a WebSocket message exchanged between client and server.
type Message struct {
	Type        string `json:"type"`
	ContainerID string `json:"containerId,omitempty"`
	Timestamp   string `json:"timestamp,omitempty"`
	Message     string `json:"message,omitempty"`
	Stream      string `json:"stream,omitempty"`
}

// Handle returns an http.HandlerFunc that upgrades to WebSocket and dispatches messages.
func Handle(dockerClient *docker.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()

		mgr := newSubscriptionManager(dockerClient, conn)
		defer mgr.CloseAll()

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WebSocket error: %v", err)
				}
				break
			}

			var msg Message
			if err := json.Unmarshal(message, &msg); err != nil {
				mgr.writeJSON(Message{Type: "error", Message: "invalid message format"})
				continue
			}

			switch msg.Type {
			case "subscribe":
				if msg.ContainerID == "" {
					mgr.writeJSON(Message{Type: "error", Message: "containerId is required"})
					continue
				}
				mgr.Subscribe(r.Context(), msg.ContainerID)
			case "unsubscribe":
				if msg.ContainerID != "" {
					mgr.Unsubscribe(msg.ContainerID)
				}
			}
		}
	}
}
```

**Step 2: ws/subscription.go 작성 — 구독 관리**

```go
package ws

import (
	"context"
	"log"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

// subscriptionManager manages per-connection container log subscriptions.
type subscriptionManager struct {
	dockerClient *docker.Client
	conn         *websocket.Conn
	writeMu      sync.Mutex
	subs         map[string]chan struct{} // containerID → cancel channel
	subsMu       sync.Mutex
}

func newSubscriptionManager(dockerClient *docker.Client, conn *websocket.Conn) *subscriptionManager {
	return &subscriptionManager{
		dockerClient: dockerClient,
		conn:         conn,
		subs:         make(map[string]chan struct{}),
	}
}

// Subscribe starts streaming logs for the given container.
func (m *subscriptionManager) Subscribe(ctx context.Context, containerID string) {
	m.subsMu.Lock()
	if _, exists := m.subs[containerID]; exists {
		m.subsMu.Unlock()
		return
	}

	if !m.dockerClient.ContainerExists(ctx, containerID) {
		m.subsMu.Unlock()
		m.writeJSON(Message{Type: "error", Message: "container not found: " + containerID})
		return
	}

	cancel := make(chan struct{})
	m.subs[containerID] = cancel
	m.subsMu.Unlock()

	go m.streamLogs(containerID, cancel)
}

// Unsubscribe stops streaming logs for the given container.
func (m *subscriptionManager) Unsubscribe(containerID string) {
	m.subsMu.Lock()
	defer m.subsMu.Unlock()

	if cancel, exists := m.subs[containerID]; exists {
		close(cancel)
		delete(m.subs, containerID)
	}
}

// CloseAll cancels all active subscriptions.
func (m *subscriptionManager) CloseAll() {
	m.subsMu.Lock()
	defer m.subsMu.Unlock()

	for _, cancel := range m.subs {
		close(cancel)
	}
}

// writeJSON sends a JSON message to the WebSocket connection (thread-safe).
func (m *subscriptionManager) writeJSON(msg Message) error {
	m.writeMu.Lock()
	defer m.writeMu.Unlock()
	return m.conn.WriteJSON(msg)
}

func (m *subscriptionManager) writeJSONLog(msg Message) {
	if err := m.writeJSON(msg); err != nil {
		log.Printf("WebSocket write error: %v", err)
	}
}
```

**Step 3: ws/stream.go 작성 — Docker 로그 스트리밍**

```go
package ws

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"log"
	"strings"
	"time"
)

// streamLogs starts streaming Docker logs for a container, branching by TTY mode.
func (m *subscriptionManager) streamLogs(containerID string, cancel chan struct{}) {
	ctx, ctxCancel := context.WithCancel(context.Background())
	go func() {
		<-cancel
		ctxCancel()
	}()

	isTTY := m.dockerClient.IsContainerTTY(ctx, containerID)

	reader, err := m.dockerClient.GetContainerLogs(ctx, containerID)
	if err != nil {
		m.writeJSON(Message{Type: "error", Message: "failed to get logs: " + err.Error()})
		return
	}
	defer reader.Close()

	if isTTY {
		m.streamTTYLogs(containerID, reader, cancel)
	} else {
		m.streamMuxLogs(containerID, reader, cancel)
	}
}

// streamMuxLogs reads Docker multiplexed stream (non-TTY containers).
// Frame format: [stream_type:1][padding:3][size:4 BE][payload:size bytes]
func (m *subscriptionManager) streamMuxLogs(containerID string, reader io.ReadCloser, cancel chan struct{}) {
	header := make([]byte, 8)

	for {
		select {
		case <-cancel:
			return
		default:
		}

		if _, err := io.ReadFull(reader, header); err != nil {
			if err != io.EOF && !errors.Is(err, context.Canceled) {
				log.Printf("Docker log header read error for %s: %v", containerID, err)
			}
			return
		}

		streamType := "stdout"
		if header[0] == 2 {
			streamType = "stderr"
		}

		payloadSize := binary.BigEndian.Uint32(header[4:8])
		if payloadSize == 0 {
			continue
		}

		payload := make([]byte, payloadSize)
		if _, err := io.ReadFull(reader, payload); err != nil {
			if err != io.EOF && !errors.Is(err, context.Canceled) {
				log.Printf("Docker log payload read error for %s: %v", containerID, err)
			}
			return
		}

		content := strings.TrimRight(string(payload), "\n")
		lines := strings.Split(content, "\n")

		for _, line := range lines {
			if line == "" {
				continue
			}
			m.sendLogLine(containerID, streamType, line)
		}
	}
}

// streamTTYLogs reads raw stream from TTY containers (no multiplexed header).
func (m *subscriptionManager) streamTTYLogs(containerID string, reader io.ReadCloser, cancel chan struct{}) {
	scanner := bufio.NewScanner(reader)

	for scanner.Scan() {
		select {
		case <-cancel:
			return
		default:
		}

		line := scanner.Text()
		if line == "" {
			continue
		}
		m.sendLogLine(containerID, "stdout", line)
	}
}

// sendLogLine parses a single log line (with optional Docker timestamp) and sends it via WebSocket.
func (m *subscriptionManager) sendLogLine(containerID, streamType, line string) {
	timestamp := time.Now().UTC().Format(time.RFC3339Nano)
	message := line

	// Parse Docker timestamp if present (format: 2006-01-02T15:04:05.000000000Z message)
	if len(line) > 30 && line[4] == '-' && line[10] == 'T' {
		if spaceIdx := strings.IndexByte(line, ' '); spaceIdx > 0 {
			timestamp = line[:spaceIdx]
			message = line[spaceIdx+1:]
		}
	}

	m.writeJSONLog(Message{
		Type:        "log",
		ContainerID: containerID,
		Timestamp:   timestamp,
		Message:     message,
		Stream:      streamType,
	})
}
```

**Step 4: router.go 업데이트 — ws 패키지 사용**

```go
import (
	// ...
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/handler/ws"
)

// WebSocket 그룹 변경:
	r.Route("/ws", func(r chi.Router) {
		r.Get("/logs", ws.Handle(dockerClient))
	})
```

**Step 5: handler/logs.go 삭제**

Run:
```bash
rm apps/log-streamer/internal/handler/logs.go
```

**Step 6: 빌드 확인**

Run:
```bash
cd apps/log-streamer && go build ./...
```

Expected: 빌드 성공

**Step 7: Commit**

```bash
git add apps/log-streamer/internal/handler/ws/ apps/log-streamer/internal/router/router.go
git rm apps/log-streamer/internal/handler/logs.go
git commit -m "refactor(log-streamer): split WebSocket handler into ws package"
```

---

### Task 6: 최종 정리 및 빌드 검증

**Files:**
- Modify: `apps/log-streamer/internal/router/router.go` (최종 정리)

**Step 1: router.go에서 불필요한 import 정리**

handler 패키지에서 `NewHealthHandler`, `NewContainersHandler`, `NewLogsHandler`가 삭제되었으므로, router.go의 import가 깔끔한지 확인.

**Step 2: go vet 실행**

Run:
```bash
cd apps/log-streamer && go vet ./...
```

Expected: 경고/에러 없음

**Step 3: 기존 테스트 실행**

Run:
```bash
cd apps/log-streamer && go test ./...
```

Expected: logreader 테스트 통과

**Step 4: Commit (필요시)**

```bash
git add -A apps/log-streamer/
git commit -m "refactor(log-streamer): final cleanup after chi router migration"
```
