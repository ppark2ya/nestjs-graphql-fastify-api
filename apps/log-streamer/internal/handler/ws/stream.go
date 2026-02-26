package ws

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"log"
	"strings"
	"time"
)

// streamLogs starts streaming Docker logs for a container, branching by TTY mode.
func (m *subscriptionManager) streamLogs(containerID string, cancel chan struct{}) {
	ctx, ctxCancel := context.WithCancel(context.Background())
	go func() {
		<-cancel
		ctxCancel()
	}()

	isTTY := m.dockerClient.IsContainerTTY(ctx, containerID)

	reader, err := m.dockerClient.GetContainerLogs(ctx, containerID)
	if err != nil {
		m.writeJSON(Message{Type: "error", Message: "failed to get logs: " + err.Error()})
		return
	}
	defer reader.Close()

	if isTTY {
		m.streamTTYLogs(containerID, reader, cancel)
	} else {
		m.streamMuxLogs(containerID, reader, cancel)
	}
}

// streamMuxLogs reads Docker multiplexed stream (non-TTY containers).
// Frame format: [stream_type:1][padding:3][size:4 BE][payload:size bytes]
func (m *subscriptionManager) streamMuxLogs(containerID string, reader io.ReadCloser, cancel chan struct{}) {
	header := make([]byte, 8)

	for {
		select {
		case <-cancel:
			return
		default:
		}

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

		content := strings.TrimRight(string(payload), "\n")
		lines := strings.Split(content, "\n")

		for _, line := range lines {
			if line == "" {
				continue
			}
			m.sendLogLine(containerID, streamType, line)
		}
	}
}

// streamTTYLogs reads raw stream from TTY containers (no multiplexed header).
func (m *subscriptionManager) streamTTYLogs(containerID string, reader io.ReadCloser, cancel chan struct{}) {
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
		m.sendLogLine(containerID, "stdout", line)
	}
}

// sendLogLine parses a single log line (with optional Docker timestamp) and sends it via WebSocket.
func (m *subscriptionManager) sendLogLine(containerID, streamType, line string) {
	timestamp := time.Now().UTC().Format(time.RFC3339Nano)
	message := line

	if len(line) > 30 && line[4] == '-' && line[10] == 'T' {
		if spaceIdx := strings.IndexByte(line, ' '); spaceIdx > 0 {
			timestamp = line[:spaceIdx]
			message = line[spaceIdx+1:]
		}
	}

	if err := m.writeJSON(Message{
		Type:        "log",
		ContainerID: containerID,
		Timestamp:   timestamp,
		Message:     message,
		Stream:      streamType,
	}); err != nil {
		log.Printf("WebSocket write error: %v", err)
	}
}
