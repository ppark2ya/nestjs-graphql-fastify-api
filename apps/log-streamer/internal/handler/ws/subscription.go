package ws

import (
	"context"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

// subscriptionManager manages per-connection container log subscriptions.
type subscriptionManager struct {
	dockerClient *docker.Client
	conn         *websocket.Conn
	writeMu      sync.Mutex
	subs         map[string]chan struct{}
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

	for id, cancel := range m.subs {
		close(cancel)
		delete(m.subs, id)
	}
}

// writeJSON sends a JSON message to the WebSocket connection (thread-safe).
func (m *subscriptionManager) writeJSON(msg Message) error {
	m.writeMu.Lock()
	defer m.writeMu.Unlock()
	return m.conn.WriteJSON(msg)
}
