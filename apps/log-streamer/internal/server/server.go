package server

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/config"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/handler"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/middleware"
)

type Server struct {
	httpServer   *http.Server
	dockerClient *docker.Client
	config       *config.Config
}

func New(cfg *config.Config) (*Server, error) {
	dockerClient, err := docker.NewClient()
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}

	return &Server{
		dockerClient: dockerClient,
		config:       cfg,
	}, nil
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Register handlers
	healthHandler := handler.NewHealthHandler(s.dockerClient)
	containersHandler := handler.NewContainersHandler(s.dockerClient)
	logsHandler := handler.NewLogsHandler(s.dockerClient)

	mux.Handle("/health", healthHandler)
	mux.Handle("/api/containers", containersHandler)
	mux.Handle("/ws/logs", logsHandler)

	// Apply middleware chain
	var h http.Handler = mux
	h = middleware.Logging(h)
	h = middleware.Correlation(h)
	h = middleware.CORS(h)

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.config.Port),
		Handler:      h,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Starting log-streamer server on port %d", s.config.Port)
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	log.Println("Shutting down server...")

	if err := s.dockerClient.Close(); err != nil {
		log.Printf("Error closing docker client: %v", err)
	}

	return s.httpServer.Shutdown(ctx)
}
