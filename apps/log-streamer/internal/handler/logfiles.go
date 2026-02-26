package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/logreader"
)

// LogFilesHandler - 로그 파일 관련 REST 핸들러
type LogFilesHandler struct {
	reader       *logreader.Reader
	dockerClient *docker.Client
	nodeName     string
	nodeOnce     sync.Once
}

// NewLogFilesHandler - 생성자
func NewLogFilesHandler(reader *logreader.Reader, dockerClient *docker.Client) *LogFilesHandler {
	return &LogFilesHandler{
		reader:       reader,
		dockerClient: dockerClient,
	}
}

// resolveNodeName - Swarm 노드 호스트명 조회 (1회만 실행)
func (h *LogFilesHandler) resolveNodeName() string {
	h.nodeOnce.Do(func() {
		h.nodeName = h.dockerClient.GetSwarmNodeName(context.Background())
		if h.nodeName == "" {
			h.nodeName, _ = os.Hostname()
		}
		slog.Info("resolved node name", "nodeName", h.nodeName)
	})
	return h.nodeName
}

// GET /api/logs/apps
func (h *LogFilesHandler) Apps(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	apps, err := h.reader.ListApps()
	if err != nil {
		slog.Error("list apps failed", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	slog.Debug("list apps", "count", len(apps))
	json.NewEncoder(w).Encode(map[string]any{
		"apps": apps,
		"node": h.resolveNodeName(),
	})
}

// GET /api/logs/files?app=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
func (h *LogFilesHandler) Files(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	q := r.URL.Query()

	app := q.Get("app")
	if app == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "app parameter required"})
		return
	}

	files, err := h.reader.ListFiles(app, q.Get("from"), q.Get("to"))
	if err != nil {
		slog.Error("list files failed", "app", app, "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	slog.Debug("list files", "app", app, "from", q.Get("from"), "to", q.Get("to"), "count", len(files))
	json.NewEncoder(w).Encode(map[string]any{
		"files": files,
		"node":  h.nodeName,
	})
}

// GET /api/logs/search?app=xxx&from=...&to=...&level=...&keyword=...&after=...&limit=...
func (h *LogFilesHandler) Search(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	w.Header().Set("Content-Type", "application/json")
	q := r.URL.Query()

	app := q.Get("app")
	if app == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "app parameter required"})
		return
	}

	limit := 100
	if l := q.Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > 500 {
		limit = 500
	}

	params := logreader.SearchParams{
		App:     app,
		From:    q.Get("from"),
		To:      q.Get("to"),
		Level:   q.Get("level"),
		Keyword: q.Get("keyword"),
		After:   q.Get("after"),
		Limit:   limit,
	}

	slog.Info("search request",
		"app", params.App,
		"from", params.From,
		"to", params.To,
		"level", params.Level,
		"keyword", params.Keyword,
		"limit", params.Limit,
		"after", params.After,
	)

	result, err := h.reader.Search(params, h.resolveNodeName())
	if err != nil {
		slog.Error("search failed", "app", params.App, "error", err, "duration", time.Since(start))
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	slog.Info("search completed",
		"app", params.App,
		"resultCount", len(result.Lines),
		"hasMore", result.HasMore,
		"duration", time.Since(start),
	)

	json.NewEncoder(w).Encode(result)
}

// GET /api/logs/stats?app=xxx&from=...&to=...
func (h *LogFilesHandler) Stats(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	w.Header().Set("Content-Type", "application/json")
	q := r.URL.Query()

	app := q.Get("app")
	if app == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "app parameter required"})
		return
	}

	stats, err := h.reader.Stats(app, q.Get("from"), q.Get("to"), h.resolveNodeName())
	if err != nil {
		slog.Error("stats failed", "app", app, "error", err, "duration", time.Since(start))
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	slog.Info("stats completed",
		"app", app,
		"totalLines", stats.TotalLines,
		"fileCount", stats.FileCount,
		"errorCount", stats.ErrorCount,
		"warnCount", stats.WarnCount,
		"duration", time.Since(start),
	)

	json.NewEncoder(w).Encode(stats)
}
