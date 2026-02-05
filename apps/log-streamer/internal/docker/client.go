package docker

import (
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
)

type Client struct {
	cli *client.Client
	mu  sync.RWMutex
}

type ContainerInfo struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Image   string   `json:"image"`
	Status  string   `json:"status"`
	State   string   `json:"state"`
	Created int64    `json:"created"`
	Ports   []string `json:"ports"`
}

func NewClient() (*Client, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}

	return &Client{cli: cli}, nil
}

func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.cli.Close()
}

func (c *Client) ListContainers(ctx context.Context) ([]ContainerInfo, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	containers, err := c.cli.ContainerList(ctx, types.ContainerListOptions{All: true})
	if err != nil {
		return nil, err
	}

	result := make([]ContainerInfo, 0, len(containers))
	for _, ctr := range containers {
		name := ""
		if len(ctr.Names) > 0 {
			name = ctr.Names[0]
			if len(name) > 0 && name[0] == '/' {
				name = name[1:]
			}
		}

		ports := make([]string, 0, len(ctr.Ports))
		for _, p := range ctr.Ports {
			if p.PublicPort > 0 {
				ports = append(ports, fmt.Sprintf("%s:%d->%d", p.IP, p.PublicPort, p.PrivatePort))
			}
		}

		result = append(result, ContainerInfo{
			ID:      ctr.ID[:12],
			Name:    name,
			Image:   ctr.Image,
			Status:  ctr.Status,
			State:   ctr.State,
			Created: ctr.Created,
			Ports:   ports,
		})
	}

	return result, nil
}

func (c *Client) GetContainerLogs(ctx context.Context, containerID string) (io.ReadCloser, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return c.cli.ContainerLogs(ctx, containerID, types.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Tail:       "100",
		Timestamps: true,
	})
}

func (c *Client) ContainerExists(ctx context.Context, containerID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	_, err := c.cli.ContainerInspect(ctx, containerID)
	return err == nil
}

func (c *Client) Ping(ctx context.Context) (types.Ping, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return c.cli.Ping(ctx)
}
