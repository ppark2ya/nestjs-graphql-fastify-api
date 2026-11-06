package handler

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/loki"
)

const (
	defaultHistoryRange = time.Hour
	maxHistoryRange     = 24 * time.Hour
	lokiRetention       = 14 * 24 * time.Hour
	maxHistoryPageSize  = 200
	maxCursorEntries    = 1000
)

type LokiHistoryHandler struct {
	client *loki.Client
}

type lokiFilters struct {
	Environment   string
	Cluster       string
	Services      []string
	Levels        []string
	URI           string
	CorrelationID string
	Keyword       string
}

type lokiCursor struct {
	TimestampNS string   `json:"t"`
	Seen        []string `json:"s"`
	QueryHash   string   `json:"q"`
}

type lokiPageInfo struct {
	HasNextPage bool   `json:"hasNextPage"`
	EndCursor   string `json:"endCursor,omitempty"`
}

type lokiSearchResponse struct {
	Entries  []loki.StreamEntry `json:"entries"`
	PageInfo lokiPageInfo       `json:"pageInfo"`
}

func NewLokiHistoryHandler(client *loki.Client) *LokiHistoryHandler {
	return &LokiHistoryHandler{client: client}
}

// FilterOptions returns the supported, low-cardinality Loki labels. URI and
// correlation IDs remain free-text fields because they must not become labels.
func (h *LokiHistoryHandler) FilterOptions(w http.ResponseWriter, r *http.Request) {
	if !h.available(w) {
		return
	}
	start, end, err := parseHistoryRange(r.URL.Query())
	if err != nil {
		writeHistoryError(w, http.StatusBadRequest, err.Error())
		return
	}
	filters, err := parseFilters(r.URL.Query())
	if err != nil {
		writeHistoryError(w, http.StatusBadRequest, err.Error())
		return
	}

	base := buildSelector(lokiFilters{})
	environments, err := h.client.LabelValues(r.Context(), "environment", base, start, end)
	if err != nil {
		h.writeUpstreamError(w, err)
		return
	}
	clusters, err := h.client.LabelValues(r.Context(), "cluster", buildSelector(lokiFilters{Environment: filters.Environment}), start, end)
	if err != nil {
		h.writeUpstreamError(w, err)
		return
	}
	services, err := h.client.LabelValues(r.Context(), "service", buildSelector(lokiFilters{Environment: filters.Environment, Cluster: filters.Cluster}), start, end)
	if err != nil {
		h.writeUpstreamError(w, err)
		return
	}
	levels, err := h.client.LabelValues(r.Context(), "level", buildSelector(lokiFilters{Environment: filters.Environment, Cluster: filters.Cluster, Services: filters.Services}), start, end)
	if err != nil {
		h.writeUpstreamError(w, err)
		return
	}

	writeHistoryJSON(w, http.StatusOK, map[string]any{
		"environments": environments,
		"clusters":     clusters,
		"services":     services,
		"levels":       levels,
	})
}

// Search queries central Loki. It intentionally does not use per-node log
// readers: every log-streamer task sees the same central history.
func (h *LokiHistoryHandler) Search(w http.ResponseWriter, r *http.Request) {
	if !h.available(w) {
		return
	}
	queryParams := r.URL.Query()
	start, end, err := parseHistoryRange(queryParams)
	if err != nil {
		writeHistoryError(w, http.StatusBadRequest, err.Error())
		return
	}
	filters, err := parseFilters(queryParams)
	if err != nil {
		writeHistoryError(w, http.StatusBadRequest, err.Error())
		return
	}
	direction := queryParams.Get("direction")
	if direction == "" {
		direction = "backward"
	}
	if direction != "backward" && direction != "forward" {
		writeHistoryError(w, http.StatusBadRequest, "direction must be forward or backward")
		return
	}
	pageSize, err := parsePageSize(queryParams.Get("limit"))
	if err != nil {
		writeHistoryError(w, http.StatusBadRequest, err.Error())
		return
	}
	query := buildQuery(filters)
	queryHash := hashQuery(query, start, end, direction)
	cursor, err := decodeCursor(queryParams.Get("cursor"), queryHash)
	if err != nil {
		writeHistoryError(w, http.StatusBadRequest, err.Error())
		return
	}

	requestStart, requestEnd := start, end
	if cursor != nil {
		boundaryNS, parseErr := strconv.ParseInt(cursor.TimestampNS, 10, 64)
		if parseErr != nil {
			writeHistoryError(w, http.StatusBadRequest, "invalid cursor timestamp")
			return
		}
		boundary := time.Unix(0, boundaryNS).UTC()
		if direction == "backward" && boundary.Before(requestEnd) {
			requestEnd = boundary.Add(time.Nanosecond)
		}
		if direction == "forward" && boundary.After(requestStart) {
			requestStart = boundary.Add(-time.Nanosecond)
		}
	}

	// Ask for one extra entry after filtering cursor-boundary duplicates. The
	// client-visible page stays capped at 200 regardless of this fetch size.
	fetchLimit := pageSize + 1
	if cursor != nil {
		fetchLimit += len(cursor.Seen)
	}
	if fetchLimit > maxCursorEntries {
		fetchLimit = maxCursorEntries
	}
	entries, err := h.client.QueryRange(r.Context(), query, requestStart, requestEnd, direction, fetchLimit)
	if err != nil {
		h.writeUpstreamError(w, err)
		return
	}
	entries = excludeCursorEntries(entries, cursor)

	hasNextPage := len(entries) > pageSize
	if hasNextPage {
		entries = entries[:pageSize]
	}
	pageInfo := lokiPageInfo{HasNextPage: hasNextPage}
	if hasNextPage && len(entries) > 0 {
		pageInfo.EndCursor = encodeCursor(entries, cursor, queryHash)
	}
	writeHistoryJSON(w, http.StatusOK, lokiSearchResponse{Entries: entries, PageInfo: pageInfo})
}

func (h *LokiHistoryHandler) available(w http.ResponseWriter) bool {
	if h.client != nil {
		return true
	}
	writeHistoryError(w, http.StatusServiceUnavailable, "Loki history is not configured")
	return false
}

func (h *LokiHistoryHandler) writeUpstreamError(w http.ResponseWriter, err error) {
	if errors.Is(err, context.DeadlineExceeded) {
		writeHistoryError(w, http.StatusGatewayTimeout, "Loki history request timed out")
		return
	}
	writeHistoryError(w, http.StatusBadGateway, "Loki history is temporarily unavailable")
}

func parseHistoryRange(query url.Values) (time.Time, time.Time, error) {
	now := time.Now().UTC()
	end := now
	if value := query.Get("end"); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			return time.Time{}, time.Time{}, errors.New("end must be an RFC3339 timestamp")
		}
		end = parsed.UTC()
	}
	start := end.Add(-defaultHistoryRange)
	if value := query.Get("start"); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			return time.Time{}, time.Time{}, errors.New("start must be an RFC3339 timestamp")
		}
		start = parsed.UTC()
	}
	if !end.After(start) {
		return time.Time{}, time.Time{}, errors.New("end must be after start")
	}
	if end.Sub(start) > maxHistoryRange {
		return time.Time{}, time.Time{}, errors.New("time range cannot exceed 24 hours")
	}
	if start.Before(now.Add(-lokiRetention)) {
		return time.Time{}, time.Time{}, errors.New("time range is outside the 14-day Loki retention period")
	}
	return start, end, nil
}

func parseFilters(query url.Values) (lokiFilters, error) {
	filters := lokiFilters{
		Environment:   strings.TrimSpace(query.Get("environment")),
		Cluster:       strings.TrimSpace(query.Get("cluster")),
		Services:      trimValues(query["service"]),
		Levels:        trimValues(query["level"]),
		URI:           strings.TrimSpace(query.Get("uri")),
		CorrelationID: strings.TrimSpace(query.Get("correlationId")),
		Keyword:       strings.TrimSpace(query.Get("keyword")),
	}
	for _, value := range append(append(filters.Services, filters.Levels...), filters.Environment, filters.Cluster, filters.URI, filters.CorrelationID, filters.Keyword) {
		if len(value) > 512 {
			return lokiFilters{}, errors.New("filter value cannot exceed 512 characters")
		}
	}
	if len(filters.Services) > 50 || len(filters.Levels) > 20 {
		return lokiFilters{}, errors.New("too many filter values")
	}
	return filters, nil
}

func trimValues(values []string) []string {
	set := make(map[string]struct{})
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			set[value] = struct{}{}
		}
	}
	result := make([]string, 0, len(set))
	for value := range set {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func parsePageSize(raw string) (int, error) {
	if raw == "" {
		return maxHistoryPageSize, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > maxHistoryPageSize {
		return 0, errors.New("limit must be between 1 and 200")
	}
	return value, nil
}

func buildSelector(filters lokiFilters) string {
	parts := []string{`log_source="file"`}
	if filters.Environment != "" {
		parts = append(parts, "environment="+strconv.Quote(filters.Environment))
	}
	if filters.Cluster != "" {
		parts = append(parts, "cluster="+strconv.Quote(filters.Cluster))
	}
	if len(filters.Services) > 0 {
		parts = append(parts, "service=~"+strconv.Quote(regexValues(filters.Services)))
	}
	if len(filters.Levels) > 0 {
		parts = append(parts, "level=~"+strconv.Quote(regexValues(filters.Levels)))
	}
	return "{" + strings.Join(parts, ",") + "}"
}

func buildQuery(filters lokiFilters) string {
	query := buildSelector(filters)
	if filters.Keyword != "" {
		query += " |= " + strconv.Quote(filters.Keyword)
	}
	if filters.URI == "" && filters.CorrelationID == "" {
		return query
	}
	query += " | json"
	if filters.URI != "" {
		query += " | label_format __uri=`{{if .labels_route}}{{.labels_route}}{{else}}{{.labels_uri}}{{end}}` | __uri=" + strconv.Quote(filters.URI)
	}
	if filters.CorrelationID != "" {
		query += " | label_format __cid=`{{or .labels_CorrelationId .labels_correlationId .labels_cid .CorrelationId .correlationId .correlation_id .cid .trace_id \"\"}}` | __cid=" + strconv.Quote(filters.CorrelationID)
	}
	return query
}

func regexValues(values []string) string {
	escaped := make([]string, 0, len(values))
	for _, value := range values {
		escaped = append(escaped, regexp.QuoteMeta(value))
	}
	return "(?:" + strings.Join(escaped, "|") + ")"
}

func hashQuery(query string, start, end time.Time, direction string) string {
	value := query + "\x00" + start.Format(time.RFC3339Nano) + "\x00" + end.Format(time.RFC3339Nano) + "\x00" + direction
	hash := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(hash[:])
}

func decodeCursor(raw, expectedHash string) (*lokiCursor, error) {
	if raw == "" {
		return nil, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return nil, errors.New("invalid cursor")
	}
	var cursor lokiCursor
	if json.Unmarshal(decoded, &cursor) != nil || cursor.TimestampNS == "" || cursor.QueryHash != expectedHash || len(cursor.Seen) > maxCursorEntries {
		return nil, errors.New("invalid cursor")
	}
	return &cursor, nil
}

func excludeCursorEntries(entries []loki.StreamEntry, cursor *lokiCursor) []loki.StreamEntry {
	if cursor == nil {
		return entries
	}
	seen := make(map[string]struct{}, len(cursor.Seen))
	for _, fingerprint := range cursor.Seen {
		seen[fingerprint] = struct{}{}
	}
	result := make([]loki.StreamEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.TimestampNS == cursor.TimestampNS {
			if _, exists := seen[entryFingerprint(entry)]; exists {
				continue
			}
		}
		result = append(result, entry)
	}
	return result
}

func encodeCursor(entries []loki.StreamEntry, previous *lokiCursor, queryHash string) string {
	boundary := entries[len(entries)-1].TimestampNS
	seen := make(map[string]struct{})
	if previous != nil && previous.TimestampNS == boundary {
		for _, fingerprint := range previous.Seen {
			seen[fingerprint] = struct{}{}
		}
	}
	for _, entry := range entries {
		if entry.TimestampNS == boundary {
			seen[entryFingerprint(entry)] = struct{}{}
		}
	}
	values := make([]string, 0, len(seen))
	for fingerprint := range seen {
		values = append(values, fingerprint)
	}
	sort.Strings(values)
	encoded, _ := json.Marshal(lokiCursor{TimestampNS: boundary, Seen: values, QueryHash: queryHash})
	return base64.RawURLEncoding.EncodeToString(encoded)
}

func entryFingerprint(entry loki.StreamEntry) string {
	labels, _ := json.Marshal(entry.Labels)
	return entry.TimestampNS + "\x00" + string(labels) + "\x00" + entry.Line
}

func writeHistoryJSON(w http.ResponseWriter, status int, response any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(response)
}

func writeHistoryError(w http.ResponseWriter, status int, message string) {
	writeHistoryJSON(w, status, map[string]string{"error": message})
}
