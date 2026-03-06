package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

func ContainerStats(dockerClient *docker.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		idsParam := r.URL.Query().Get("ids")
		if idsParam == "" {
			json.NewEncoder(w).Encode([]docker.ContainerStats{})
			return
		}

		ids := strings.Split(idsParam, ",")
		stats, err := dockerClient.GetContainerStats(r.Context(), ids)
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
