package docker

import (
	"context"
	"log/slog"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/events"
	"github.com/docker/docker/api/types/filters"
)

// ServiceEvent represents a container lifecycle event for a Swarm service.
type ServiceEvent struct {
	Action      string // "start" or "die"
	ContainerID string // 12-char container ID
	ServiceName string // com.docker.swarm.service.name label value
}

// WatchServiceEvents returns a channel of ServiceEvent for container start/die events
// filtered to Swarm service containers only. The error channel signals stream failures.
func (c *Client) WatchServiceEvents(ctx context.Context) (<-chan ServiceEvent, <-chan error) {
	out := make(chan ServiceEvent)
	errCh := make(chan error, 1)

	go func() {
		defer close(out)
		defer close(errCh)

		f := filters.NewArgs()
		f.Add("type", "container")
		f.Add("event", "start")
		f.Add("event", "die")

		c.mu.RLock()
		msgCh, errStream := c.cli.Events(ctx, types.EventsOptions{Filters: f})
		c.mu.RUnlock()

		for {
			select {
			case <-ctx.Done():
				return
			case err, ok := <-errStream:
				if !ok {
					return
				}
				errCh <- err
				return
			case msg, ok := <-msgCh:
				if !ok {
					return
				}
				svcName := extractServiceName(msg)
				if svcName == "" {
					continue
				}
				containerID := msg.Actor.ID
				if len(containerID) > 12 {
					containerID = containerID[:12]
				}
				select {
				case out <- ServiceEvent{
					Action:      msg.Action,
					ContainerID: containerID,
					ServiceName: svcName,
				}:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	return out, errCh
}

func extractServiceName(msg events.Message) string {
	if msg.Actor.Attributes == nil {
		return ""
	}
	return msg.Actor.Attributes["com.docker.swarm.service.name"]
}

// ListContainersByService returns running containers that belong to the given Swarm service.
func (c *Client) ListContainersByService(ctx context.Context, serviceName string) ([]ContainerInfo, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	f := filters.NewArgs()
	f.Add("label", "com.docker.swarm.service.name="+serviceName)
	f.Add("status", "running")

	containers, err := c.cli.ContainerList(ctx, types.ContainerListOptions{
		All:     false,
		Filters: f,
	})
	if err != nil {
		return nil, err
	}

	result := make([]ContainerInfo, 0, len(containers))
	for _, ctr := range containers {
		id := ctr.ID
		if len(id) > 12 {
			id = id[:12]
		}
		name := ""
		if len(ctr.Names) > 0 {
			name = ctr.Names[0]
			if len(name) > 0 && name[0] == '/' {
				name = name[1:]
			}
		}
		info := ContainerInfo{
			ID:    id,
			Name:  name,
			Image: ctr.Image,
			State: ctr.State,
		}
		if svc, ok := ctr.Labels["com.docker.swarm.service.name"]; ok {
			info.ServiceName = svc
		}

		slog.Debug("discovered service container", "serviceName", serviceName, "containerId", id)
		result = append(result, info)
	}

	return result, nil
}
