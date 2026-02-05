package handler

import (
	"encoding/json"
	"net/http"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

type HealthHandler struct {
	dockerClient *docker.Client
}

func NewHealthHandler(dockerClient *docker.Client) *HealthHandler {
	return &HealthHandler{dockerClient: dockerClient}
}

type HealthResponse struct {
	Status string `json:"status"`
	Docker string `json:"docker"`
}

func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	response := HealthResponse{
		Status: "ok",
		Docker: "connected",
	}

	_, err := h.dockerClient.Ping(r.Context())
	if err != nil {
		response.Docker = "disconnected"
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	json.NewEncoder(w).Encode(response)
}
