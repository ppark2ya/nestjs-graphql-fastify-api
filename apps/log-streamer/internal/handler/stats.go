package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

func ContainerStats(dockerClient *docker.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		stats, err := dockerClient.GetAllContainerStats(r.Context())
		if err != nil {
			slog.Error("get container stats failed", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "failed to get container stats: " + err.Error(),
			})
			return
		}

		if stats == nil {
			stats = []docker.ContainerStats{}
		}

		slog.Debug("container stats", "count", len(stats))
		json.NewEncoder(w).Encode(stats)
	}
}
