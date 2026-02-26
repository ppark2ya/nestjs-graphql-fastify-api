package handler

import (
	"encoding/json"
	"net/http"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

type healthResponse struct {
	Status string `json:"status"`
	Docker string `json:"docker"`
}

func Health(dockerClient *docker.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		response := healthResponse{
			Status: "ok",
			Docker: "connected",
		}

		_, err := dockerClient.Ping(r.Context())
		if err != nil {
			response.Docker = "disconnected"
			w.WriteHeader(http.StatusServiceUnavailable)
		}

		json.NewEncoder(w).Encode(response)
	}
}
