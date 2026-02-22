package docker

import (
	"context"
	"fmt"
	"io"
	"os"
	"sync"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
)

type Client struct {
	cli *client.Client
	mu  sync.RWMutex
}

type ContainerInfo struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Image       string   `json:"image"`
	Status      string   `json:"status"`
	State       string   `json:"state"`
	Created     int64    `json:"created"`
	Ports       []string `json:"ports"`
	ServiceName string   `json:"serviceName,omitempty"`
	TaskSlot    string   `json:"taskSlot,omitempty"`
	NodeName    string   `json:"nodeName,omitempty"`
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

	containers, err := c.cli.ContainerList(ctx, types.ContainerListOptions{All: false})
	if err != nil {
		return nil, err
	}

	// Build Swarm node ID → hostname map (best-effort, non-Swarm envs just skip)
	nodeNames := make(map[string]string)
	if nodes, err := c.cli.NodeList(ctx, types.NodeListOptions{}); err == nil {
		for _, n := range nodes {
			nodeNames[n.ID] = n.Description.Hostname
		}
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

		info := ContainerInfo{
			ID:      ctr.ID[:12],
			Name:    name,
			Image:   ctr.Image,
			Status:  ctr.Status,
			State:   ctr.State,
			Created: ctr.Created,
			Ports:   ports,
		}

		if svc, ok := ctr.Labels["com.docker.swarm.service.name"]; ok {
			info.ServiceName = svc
		}
		if slot, ok := ctr.Labels["com.docker.swarm.task.id"]; ok {
			info.TaskSlot = slot[:12]
		}
		if nodeID, ok := ctr.Labels["com.docker.swarm.node.id"]; ok {
			if hostname, found := nodeNames[nodeID]; found {
				info.NodeName = hostname
			} else {
				info.NodeName = nodeID[:12]
			}
		}

		result = append(result, info)
	}

	return result, nil
}

// GetSwarmNodeName - 현재 컨테이너가 실행 중인 Swarm 노드의 호스트명 반환
func (c *Client) GetSwarmNodeName(ctx context.Context) string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Swarm 노드 목록에서 자신의 호스트명 조회
	nodes, err := c.cli.NodeList(ctx, types.NodeListOptions{})
	if err != nil {
		return ""
	}

	// 현재 컨테이너의 hostname (= container ID)
	hostname, _ := os.Hostname()

	// Info에서 현재 노드의 ID를 가져온다
	info, err := c.cli.Info(ctx)
	if err != nil {
		// fallback: 노드가 1개면 그 호스트명 사용
		if len(nodes) == 1 {
			return nodes[0].Description.Hostname
		}
		return hostname
	}

	// 현재 Swarm 노드 ID로 호스트명 매핑
	for _, n := range nodes {
		if n.ID == info.Swarm.NodeID {
			return n.Description.Hostname
		}
	}

	return hostname
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
