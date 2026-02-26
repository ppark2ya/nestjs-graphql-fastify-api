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
