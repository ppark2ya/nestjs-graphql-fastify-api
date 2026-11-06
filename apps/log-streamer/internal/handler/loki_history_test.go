package handler

import (
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/loki"
)

func TestBuildQueryEscapesUntrustedInput(t *testing.T) {
	query := buildQuery(lokiFilters{
		Services: []string{"orders.*"},
		Keyword:  `" | json | __error__=""`,
		URI:      `/orders/{id}`,
	})
	if !strings.Contains(query, `service=~"(?:orders\\.\\*)"`) {
		t.Fatalf("service selector is not regex escaped: %s", query)
	}
	if !strings.Contains(query, "|= "+strconv.Quote(`" | json | __error__=""`)) {
		t.Fatalf("keyword is not quoted: %s", query)
	}
	if !strings.Contains(query, `| json | label_format __uri=`) {
		t.Fatalf("URI filter does not use parsed JSON: %s", query)
	}
}

func TestHistoryRangeAllowsMultipleDaysWithinRetention(t *testing.T) {
	end := time.Now().UTC().Truncate(time.Second)
	start := end.Add(-7 * 24 * time.Hour)
	_, _, err := parseHistoryRange(url.Values{
		"start": {start.Format(time.RFC3339)},
		"end":   {end.Format(time.RFC3339)},
	})
	if err != nil {
		t.Fatalf("expected range within retention to be allowed, got %v", err)
	}
}

func TestHistoryRangeRejectsExpiredLokiData(t *testing.T) {
	start := time.Now().UTC().Add(-15 * 24 * time.Hour).Format(time.RFC3339)
	end := time.Now().UTC().Add(-15*24*time.Hour + time.Hour).Format(time.RFC3339)
	_, _, err := parseHistoryRange(url.Values{"start": {start}, "end": {end}})
	if err == nil || !strings.Contains(err.Error(), "14-day") {
		t.Fatalf("expected retention validation error, got %v", err)
	}
}

func TestCursorExcludesOnlyBoundaryDuplicates(t *testing.T) {
	entries := []loki.StreamEntry{
		{TimestampNS: "2", Line: "same", Labels: map[string]string{"service": "a"}},
		{TimestampNS: "1", Line: "older", Labels: map[string]string{"service": "a"}},
	}
	cursor := &lokiCursor{TimestampNS: "2", Seen: []string{entryFingerprint(entries[0])}}
	filtered := excludeCursorEntries(entries, cursor)
	if len(filtered) != 1 || filtered[0].TimestampNS != "1" {
		t.Fatalf("cursor should keep only older entries: %#v", filtered)
	}
	if got := encodeCursor(entries, nil, "query"); got == "" {
		t.Fatal("expected opaque cursor")
	}
}
