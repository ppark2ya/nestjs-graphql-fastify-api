package handler

import (
	"encoding/json"
	"net/http"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
)

type ContainersHandler struct {
	dockerClient *docker.Client
}

func NewContainersHandler(dockerClient *docker.Client) *ContainersHandler {
	return &ContainersHandler{dockerClient: dockerClient}
}

func (h *ContainersHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	containers, err := h.dockerClient.ListContainers(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "failed to list containers: " + err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(containers)
}
