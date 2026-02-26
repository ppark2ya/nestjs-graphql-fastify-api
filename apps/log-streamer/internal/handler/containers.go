package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

func Containers(dockerClient *docker.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		containers, err := dockerClient.ListContainers(r.Context())
		if err != nil {
			slog.Error("list containers failed", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "failed to list containers: " + err.Error(),
			})
			return
		}

		slog.Debug("list containers", "count", len(containers))
		json.NewEncoder(w).Encode(containers)
	}
}
