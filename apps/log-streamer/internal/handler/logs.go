package handler

import (
	"bufio"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for now
	},
}

type LogsHandler struct {
	dockerClient *docker.Client
}

func NewLogsHandler(dockerClient *docker.Client) *LogsHandler {
	return &LogsHandler{dockerClient: dockerClient}
}

// WebSocket message types
type WSMessage struct {
	Type        string `json:"type"`
	ContainerID string `json:"containerId,omitempty"`
	Timestamp   string `json:"timestamp,omitempty"`
	Message     string `json:"message,omitempty"`
	Stream      string `json:"stream,omitempty"`
}

type logSubscription struct {
	cancel chan struct{}
}

func (h *LogsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	subscriptions := make(map[string]*logSubscription)
	var subMu sync.Mutex
	var writeMu sync.Mutex

	// Cleanup on disconnect
	defer func() {
		subMu.Lock()
		for _, sub := range subscriptions {
			close(sub.cancel)
		}
		subMu.Unlock()
	}()

	// Handle incoming messages
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			h.writeJSON(conn, &writeMu, WSMessage{Type: "error", Message: "invalid message format"})
			continue
		}

		switch msg.Type {
		case "subscribe":
			if msg.ContainerID == "" {
				h.writeJSON(conn, &writeMu, WSMessage{Type: "error", Message: "containerId is required"})
				continue
			}

			subMu.Lock()
			if _, exists := subscriptions[msg.ContainerID]; exists {
				subMu.Unlock()
				continue // Already subscribed
			}

			// Verify container exists
			if !h.dockerClient.ContainerExists(r.Context(), msg.ContainerID) {
				subMu.Unlock()
				h.writeJSON(conn, &writeMu, WSMessage{Type: "error", Message: "container not found: " + msg.ContainerID})
				continue
			}

			sub := &logSubscription{cancel: make(chan struct{})}
			subscriptions[msg.ContainerID] = sub
			subMu.Unlock()

			go h.streamLogs(conn, &writeMu, msg.ContainerID, sub.cancel)

		case "unsubscribe":
			if msg.ContainerID == "" {
				continue
			}

			subMu.Lock()
			if sub, exists := subscriptions[msg.ContainerID]; exists {
				close(sub.cancel)
				delete(subscriptions, msg.ContainerID)
			}
			subMu.Unlock()
		}
	}
}

func (h *LogsHandler) streamLogs(conn *websocket.Conn, writeMu *sync.Mutex, containerID string, cancel chan struct{}) {
	ctx, ctxCancel := context.WithCancel(context.Background())
	go func() {
		<-cancel
		ctxCancel()
	}()

	reader, err := h.dockerClient.GetContainerLogs(ctx, containerID)
	if err != nil {
		h.writeJSON(conn, writeMu, WSMessage{Type: "error", Message: "failed to get logs: " + err.Error()})
		return
	}
	defer reader.Close()

	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		select {
		case <-cancel:
			return
		default:
		}

		line := scanner.Bytes()
		if len(line) < 8 {
			continue
		}

		// Docker log format: first 8 bytes are header
		// Byte 0: stream type (1=stdout, 2=stderr)
		streamType := "stdout"
		if line[0] == 2 {
			streamType = "stderr"
		}

		// Skip the 8-byte header
		logContent := string(line[8:])

		// Parse timestamp if present (format: 2006-01-02T15:04:05.000000000Z message)
		timestamp := time.Now().UTC().Format(time.RFC3339Nano)
		message := logContent

		if len(logContent) > 30 && logContent[4] == '-' && logContent[10] == 'T' {
			// Has timestamp prefix
			spaceIdx := -1
			for i, c := range logContent {
				if c == ' ' {
					spaceIdx = i
					break
				}
			}
			if spaceIdx > 0 {
				timestamp = logContent[:spaceIdx]
				message = logContent[spaceIdx+1:]
			}
		}

		msg := WSMessage{
			Type:        "log",
			ContainerID: containerID,
			Timestamp:   timestamp,
			Message:     message,
			Stream:      streamType,
		}

		if err := h.writeJSON(conn, writeMu, msg); err != nil {
			log.Printf("WebSocket write error: %v", err)
			return
		}
	}
}

func (h *LogsHandler) writeJSON(conn *websocket.Conn, mu *sync.Mutex, msg WSMessage) error {
	mu.Lock()
	defer mu.Unlock()
	return conn.WriteJSON(msg)
}
