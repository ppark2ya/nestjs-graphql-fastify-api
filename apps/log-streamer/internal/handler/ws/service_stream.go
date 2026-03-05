package ws

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"log/slog"
	"strings"
)

// streamMuxLogs reads Docker multiplexed stream for a service container (non-TTY).
func (s *serviceSubscription) streamMuxLogs(containerID string, reader io.ReadCloser, cancel chan struct{}) {
	header := make([]byte, 8)

	for {
		select {
		case <-cancel:
			return
		default:
		}

		if _, err := io.ReadFull(reader, header); err != nil {
			if err != io.EOF && !errors.Is(err, context.Canceled) {
				slog.Warn("docker log header read error (service)", "serviceName", s.serviceName, "containerId", containerID, "error", err)
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
				slog.Warn("docker log payload read error (service)", "serviceName", s.serviceName, "containerId", containerID, "error", err)
			}
			return
		}

		content := strings.TrimRight(string(payload), "\n")
		lines := strings.Split(content, "\n")

		for _, line := range lines {
			if line == "" {
				continue
			}
			s.sendServiceLogLine(containerID, streamType, line)
		}
	}
}

// streamTTYLogs reads raw stream for a service container (TTY mode).
func (s *serviceSubscription) streamTTYLogs(containerID string, reader io.ReadCloser, cancel chan struct{}) {
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
		s.sendServiceLogLine(containerID, "stdout", line)
	}
}
