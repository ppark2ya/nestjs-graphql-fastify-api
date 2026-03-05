package ws

import (
	"context"
	"log/slog"
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
	serviceSubs  map[string]*serviceSubscription
	serviceSubMu sync.Mutex
}

func newSubscriptionManager(dockerClient *docker.Client, conn *websocket.Conn) *subscriptionManager {
	return &subscriptionManager{
		dockerClient: dockerClient,
		conn:         conn,
		subs:         make(map[string]chan struct{}),
		serviceSubs:  make(map[string]*serviceSubscription),
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

// SubscribeService starts streaming logs for all containers in a Swarm service.
func (m *subscriptionManager) SubscribeService(ctx context.Context, serviceName string) {
	m.serviceSubMu.Lock()
	if _, exists := m.serviceSubs[serviceName]; exists {
		m.serviceSubMu.Unlock()
		return
	}

	sub := newServiceSubscription(ctx, serviceName, m.dockerClient, m)
	m.serviceSubs[serviceName] = sub
	m.serviceSubMu.Unlock()

	sub.Start()
}

// UnsubscribeService stops streaming logs for a service.
func (m *subscriptionManager) UnsubscribeService(serviceName string) {
	m.serviceSubMu.Lock()
	defer m.serviceSubMu.Unlock()

	if sub, exists := m.serviceSubs[serviceName]; exists {
		sub.Stop()
		delete(m.serviceSubs, serviceName)
	}
}

// CloseAll cancels all active subscriptions (both container and service).
func (m *subscriptionManager) CloseAll() {
	m.subsMu.Lock()
	count := len(m.subs)
	for id, cancel := range m.subs {
		close(cancel)
		delete(m.subs, id)
	}
	m.subsMu.Unlock()

	m.serviceSubMu.Lock()
	svcCount := len(m.serviceSubs)
	for name, sub := range m.serviceSubs {
		sub.Stop()
		delete(m.serviceSubs, name)
	}
	m.serviceSubMu.Unlock()

	if count > 0 || svcCount > 0 {
		slog.Debug("websocket close all subscriptions", "containers", count, "services", svcCount)
	}
}

// writeJSON sends a JSON message to the WebSocket connection (thread-safe).
func (m *subscriptionManager) writeJSON(msg Message) error {
	m.writeMu.Lock()
	defer m.writeMu.Unlock()
	return m.conn.WriteJSON(msg)
}
