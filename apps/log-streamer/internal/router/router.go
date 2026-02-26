package router

import (
	"github.com/go-chi/chi/v5"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/handler"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/logreader"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/middleware"
)

func New(dockerClient *docker.Client, logReader *logreader.Reader) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.CORS)
	r.Use(middleware.Correlation)
	r.Use(middleware.Logging)

	// Health check
	healthHandler := handler.NewHealthHandler(dockerClient)
	r.Get("/health", healthHandler.ServeHTTP)

	// REST API
	r.Route("/api", func(r chi.Router) {
		containersHandler := handler.NewContainersHandler(dockerClient)
		r.Get("/containers", containersHandler.ServeHTTP)

		r.Route("/logs", func(r chi.Router) {
			h := handler.NewLogFilesHandler(logReader, dockerClient)
			h.RegisterChiRoutes(r)
		})
	})

	// WebSocket
	logsHandler := handler.NewLogsHandler(dockerClient)
	r.Route("/ws", func(r chi.Router) {
		r.Get("/logs", logsHandler.ServeHTTP)
	})

	return r
}
