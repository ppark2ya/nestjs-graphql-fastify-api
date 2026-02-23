package handler

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
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

	isTTY := h.dockerClient.IsContainerTTY(ctx, containerID)

	reader, err := h.dockerClient.GetContainerLogs(ctx, containerID)
	if err != nil {
		h.writeJSON(conn, writeMu, WSMessage{Type: "error", Message: "failed to get logs: " + err.Error()})
		return
	}
	defer reader.Close()

	if isTTY {
		h.streamTTYLogs(conn, writeMu, containerID, reader, cancel)
	} else {
		h.streamMuxLogs(conn, writeMu, containerID, reader, cancel)
	}
}

// streamMuxLogs reads Docker multiplexed stream (non-TTY containers).
// Frame format: [stream_type:1][padding:3][size:4 BE][payload:size bytes]
func (h *LogsHandler) streamMuxLogs(conn *websocket.Conn, writeMu *sync.Mutex, containerID string, reader io.ReadCloser, cancel chan struct{}) {
	header := make([]byte, 8)

	for {
		select {
		case <-cancel:
			return
		default:
		}

		// Read 8-byte frame header
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

		// Payload may contain multiple lines (e.g., stack traces)
		content := strings.TrimRight(string(payload), "\n")
		lines := strings.Split(content, "\n")

		for _, line := range lines {
			if line == "" {
				continue
			}
			h.sendLogLine(conn, writeMu, containerID, streamType, line)
		}
	}
}

// streamTTYLogs reads raw stream from TTY containers (no multiplexed header).
func (h *LogsHandler) streamTTYLogs(conn *websocket.Conn, writeMu *sync.Mutex, containerID string, reader io.ReadCloser, cancel chan struct{}) {
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
		h.sendLogLine(conn, writeMu, containerID, "stdout", line)
	}
}

// sendLogLine parses a single log line (with optional Docker timestamp) and sends it via WebSocket.
func (h *LogsHandler) sendLogLine(conn *websocket.Conn, writeMu *sync.Mutex, containerID, streamType, line string) {
	timestamp := time.Now().UTC().Format(time.RFC3339Nano)
	message := line

	// Parse Docker timestamp if present (format: 2006-01-02T15:04:05.000000000Z message)
	if len(line) > 30 && line[4] == '-' && line[10] == 'T' {
		if spaceIdx := strings.IndexByte(line, ' '); spaceIdx > 0 {
			timestamp = line[:spaceIdx]
			message = line[spaceIdx+1:]
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
	}
}

func (h *LogsHandler) writeJSON(conn *websocket.Conn, mu *sync.Mutex, msg WSMessage) error {
	mu.Lock()
	defer mu.Unlock()
	return conn.WriteJSON(msg)
}
