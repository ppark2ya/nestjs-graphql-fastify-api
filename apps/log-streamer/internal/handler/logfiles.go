package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"

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
		log.Printf("Resolved node name: %s", h.nodeName)
	})
	return h.nodeName
}

// RegisterRoutes - mux에 라우트 등록
func (h *LogFilesHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/logs/apps", h.handleApps)
	mux.HandleFunc("/api/logs/files", h.handleFiles)
	mux.HandleFunc("/api/logs/search", h.handleSearch)
	mux.HandleFunc("/api/logs/stats", h.handleStats)
}

// RegisterChiRoutes registers routes on a chi router
func (h *LogFilesHandler) RegisterChiRoutes(r interface{ Get(string, http.HandlerFunc) }) {
	r.Get("/apps", h.handleApps)
	r.Get("/files", h.handleFiles)
	r.Get("/search", h.handleSearch)
	r.Get("/stats", h.handleStats)
}

// GET /api/logs/apps
func (h *LogFilesHandler) handleApps(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	apps, err := h.reader.ListApps()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(map[string]any{
		"apps": apps,
		"node": h.resolveNodeName(),
	})
}

// GET /api/logs/files?app=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
func (h *LogFilesHandler) handleFiles(w http.ResponseWriter, r *http.Request) {
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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(map[string]any{
		"files": files,
		"node":  h.nodeName,
	})
}

// GET /api/logs/search?app=xxx&from=...&to=...&level=...&keyword=...&after=...&limit=...
func (h *LogFilesHandler) handleSearch(w http.ResponseWriter, r *http.Request) {
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

	result, err := h.reader.Search(params, h.resolveNodeName())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(result)
}

// GET /api/logs/stats?app=xxx&from=...&to=...
func (h *LogFilesHandler) handleStats(w http.ResponseWriter, r *http.Request) {
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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(stats)
}
