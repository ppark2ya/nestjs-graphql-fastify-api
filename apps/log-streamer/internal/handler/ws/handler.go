package ws

import (
	"encoding/json"
	"log/slog"
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
	ServiceName string `json:"serviceName,omitempty"`
	Timestamp   string `json:"timestamp,omitempty"`
	Message     string `json:"message,omitempty"`
	Stream      string `json:"stream,omitempty"`
	Event       string `json:"event,omitempty"` // "container_started" | "container_stopped"
}

// Handle returns an http.HandlerFunc that upgrades to WebSocket and dispatches messages.
func Handle(dockerClient *docker.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Error("websocket upgrade failed", "error", err, "remoteAddr", r.RemoteAddr)
			return
		}
		defer conn.Close()

		slog.Info("websocket connected", "remoteAddr", r.RemoteAddr)

		mgr := newSubscriptionManager(dockerClient, conn)
		defer mgr.CloseAll()

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					slog.Warn("websocket unexpected close", "error", err, "remoteAddr", r.RemoteAddr)
				} else {
					slog.Info("websocket disconnected", "remoteAddr", r.RemoteAddr)
				}
				break
			}

			var msg Message
			if err := json.Unmarshal(message, &msg); err != nil {
				slog.Warn("websocket invalid message", "error", err, "remoteAddr", r.RemoteAddr)
				mgr.writeJSON(Message{Type: "error", Message: "invalid message format"})
				continue
			}

			switch msg.Type {
			case "subscribe":
				if msg.ContainerID == "" {
					mgr.writeJSON(Message{Type: "error", Message: "containerId is required"})
					continue
				}
				slog.Info("websocket subscribe", "containerId", msg.ContainerID, "remoteAddr", r.RemoteAddr)
				mgr.Subscribe(r.Context(), msg.ContainerID)
			case "unsubscribe":
				if msg.ContainerID != "" {
					slog.Info("websocket unsubscribe", "containerId", msg.ContainerID, "remoteAddr", r.RemoteAddr)
					mgr.Unsubscribe(msg.ContainerID)
				}
			case "subscribe_service":
				if msg.ServiceName == "" {
					mgr.writeJSON(Message{Type: "error", Message: "serviceName is required"})
					continue
				}
				slog.Info("websocket subscribe_service", "serviceName", msg.ServiceName, "remoteAddr", r.RemoteAddr)
				mgr.SubscribeService(r.Context(), msg.ServiceName)
			case "unsubscribe_service":
				if msg.ServiceName != "" {
					slog.Info("websocket unsubscribe_service", "serviceName", msg.ServiceName, "remoteAddr", r.RemoteAddr)
					mgr.UnsubscribeService(msg.ServiceName)
				}
			}
		}
	}
}
