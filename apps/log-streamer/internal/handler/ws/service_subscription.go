package ws

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

// serviceSubscription manages log streaming for all containers belonging to a Swarm service.
// It watches Docker events to automatically start/stop streaming when containers are created/destroyed.
type serviceSubscription struct {
	serviceName  string
	dockerClient *docker.Client
	mgr          *subscriptionManager

	mu         sync.Mutex
	containers map[string]context.CancelFunc // containerID → cancel function for its stream goroutine

	ctx    context.Context
	cancel context.CancelFunc
}

func newServiceSubscription(ctx context.Context, serviceName string, dockerClient *docker.Client, mgr *subscriptionManager) *serviceSubscription {
	subCtx, cancel := context.WithCancel(ctx)
	return &serviceSubscription{
		serviceName:  serviceName,
		dockerClient: dockerClient,
		mgr:          mgr,
		containers:   make(map[string]context.CancelFunc),
		ctx:          subCtx,
		cancel:       cancel,
	}
}

// Start discovers existing containers and begins watching for lifecycle events.
func (s *serviceSubscription) Start() {
	// Discover currently running containers for this service
	containers, err := s.dockerClient.ListContainersByService(s.ctx, s.serviceName)
	if err != nil {
		slog.Error("failed to list containers for service", "serviceName", s.serviceName, "error", err)
		s.mgr.writeJSON(Message{
			Type:        "error",
			ServiceName: s.serviceName,
			Message:     "failed to list containers: " + err.Error(),
		})
	}

	if len(containers) == 0 {
		slog.Info("no running containers found for service, waiting for events", "serviceName", s.serviceName)
		s.mgr.writeJSON(Message{
			Type:        "service_event",
			ServiceName: s.serviceName,
			Event:       "no_containers",
			Message:     "No running containers found for service " + s.serviceName + ", waiting for new containers...",
			Stream:      "event",
			Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	for _, c := range containers {
		s.startContainerStream(c.ID)
	}

	// Start watching Docker events for this service
	go s.watchEvents()
}

// Stop cancels all container streams and the event watcher.
func (s *serviceSubscription) Stop() {
	s.cancel()

	s.mu.Lock()
	defer s.mu.Unlock()
	for id, cancelFn := range s.containers {
		cancelFn()
		delete(s.containers, id)
	}
}

func (s *serviceSubscription) startContainerStream(containerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.containers[containerID]; exists {
		return // already streaming
	}

	streamCtx, streamCancel := context.WithCancel(s.ctx)
	s.containers[containerID] = streamCancel

	slog.Info("starting service container stream", "serviceName", s.serviceName, "containerId", containerID)

	go s.streamServiceLogs(containerID, streamCtx)
}

func (s *serviceSubscription) stopContainerStream(containerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if cancelFn, exists := s.containers[containerID]; exists {
		cancelFn()
		delete(s.containers, containerID)
		slog.Info("stopped service container stream", "serviceName", s.serviceName, "containerId", containerID)
	}
}

func (s *serviceSubscription) watchEvents() {
	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		eventCh, errCh := s.dockerClient.WatchServiceEvents(s.ctx)

		for {
			select {
			case <-s.ctx.Done():
				return
			case err, ok := <-errCh:
				if !ok {
					// Error channel closed, reconnect
					goto reconnect
				}
				slog.Warn("docker events stream error", "serviceName", s.serviceName, "error", err)
				goto reconnect
			case evt, ok := <-eventCh:
				if !ok {
					goto reconnect
				}
				// Only handle events for our service
				if evt.ServiceName != s.serviceName {
					continue
				}

				switch evt.Action {
				case "start":
					slog.Info("service container started", "serviceName", s.serviceName, "containerId", evt.ContainerID)
					s.mgr.writeJSON(Message{
						Type:        "service_event",
						ServiceName: s.serviceName,
						ContainerID: evt.ContainerID,
						Event:       "container_started",
						Message:     "Container " + evt.ContainerID + " started",
						Stream:      "event",
						Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
					})
					s.startContainerStream(evt.ContainerID)

				case "die":
					slog.Info("service container stopped", "serviceName", s.serviceName, "containerId", evt.ContainerID)
					s.stopContainerStream(evt.ContainerID)
					s.mgr.writeJSON(Message{
						Type:        "service_event",
						ServiceName: s.serviceName,
						ContainerID: evt.ContainerID,
						Event:       "container_stopped",
						Message:     "Container " + evt.ContainerID + " stopped",
						Stream:      "event",
						Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
					})
				}
			}
		}

	reconnect:
		select {
		case <-s.ctx.Done():
			return
		case <-time.After(2 * time.Second):
			slog.Info("reconnecting docker events stream", "serviceName", s.serviceName)
		}
	}
}

// streamServiceLogs streams logs from a single container within a service subscription.
func (s *serviceSubscription) streamServiceLogs(containerID string, ctx context.Context) {
	isTTY := s.dockerClient.IsContainerTTY(ctx, containerID)

	reader, err := s.dockerClient.GetContainerLogs(ctx, containerID)
	if err != nil {
		if ctx.Err() == nil {
			slog.Warn("failed to get service container logs", "serviceName", s.serviceName, "containerId", containerID, "error", err)
		}
		return
	}
	defer reader.Close()

	// Create a cancel channel from context for compatibility with existing stream functions
	cancel := make(chan struct{})
	go func() {
		<-ctx.Done()
		close(cancel)
	}()

	if isTTY {
		s.streamTTYLogs(containerID, reader, cancel)
	} else {
		s.streamMuxLogs(containerID, reader, cancel)
	}
}

// sendServiceLogLine parses a log line and sends it with serviceName included.
func (s *serviceSubscription) sendServiceLogLine(containerID, streamType, line string) {
	timestamp := time.Now().UTC().Format(time.RFC3339Nano)
	message := line

	if len(line) > 30 && line[4] == '-' && line[10] == 'T' {
		if spaceIdx := indexOf(line, ' '); spaceIdx > 0 {
			timestamp = line[:spaceIdx]
			message = line[spaceIdx+1:]
		}
	}

	if err := s.mgr.writeJSON(Message{
		Type:        "log",
		ContainerID: containerID,
		ServiceName: s.serviceName,
		Timestamp:   timestamp,
		Message:     message,
		Stream:      streamType,
	}); err != nil {
		slog.Warn("websocket write error (service)", "serviceName", s.serviceName, "containerId", containerID, "error", err)
	}
}

func indexOf(s string, c byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}
