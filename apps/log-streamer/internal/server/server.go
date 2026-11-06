package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/config"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/logreader"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/loki"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/router"
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

	slog.Info("docker client connected")

	return &Server{
		dockerClient: dockerClient,
		config:       cfg,
	}, nil
}

func (s *Server) Start() error {
	logReader := logreader.NewReader(s.config.LogDir)
	var lokiClient *loki.Client
	if s.config.LokiGatewayURL != "" {
		var err error
		lokiClient, err = loki.NewClient(s.config.LokiGatewayURL, s.config.LokiTimeout)
		if err != nil {
			return fmt.Errorf("invalid Loki gateway configuration: %w", err)
		}
		log := slog.Default()
		log.Info("Loki history client enabled")
	} else {
		slog.Warn("Loki history client disabled: LOKI_GATEWAY_URL is not configured")
	}
	r := router.New(s.dockerClient, logReader, lokiClient)

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.config.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	slog.Info("server listening", "addr", s.httpServer.Addr)
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	slog.Info("shutting down server")

	if err := s.dockerClient.Close(); err != nil {
		slog.Error("docker client close failed", "error", err)
	}

	return s.httpServer.Shutdown(ctx)
}
