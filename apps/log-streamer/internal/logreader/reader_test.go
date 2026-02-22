package logreader

import (
	"os"
	"path/filepath"
	"testing"
)

func setupTestDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	appDir := filepath.Join(dir, "order-service")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		t.Fatal(err)
	}

	log1 := `2024-01-15 10:00:00.000 INFO  c.e.App - Server started
2024-01-15 10:00:01.000 ERROR c.e.OrderService - Order failed: timeout
2024-01-15 10:00:02.000 WARN  c.e.DB - Slow query detected
2024-01-15 10:00:03.000 INFO  c.e.App - Request completed
2024-01-15 10:00:04.000 ERROR c.e.PaymentService - Payment declined
`
	if err := os.WriteFile(filepath.Join(appDir, "app.2024-01-15.log"), []byte(log1), 0644); err != nil {
		t.Fatal(err)
	}

	nextDir := filepath.Join(dir, "web-app")
	if err := os.MkdirAll(nextDir, 0755); err != nil {
		t.Fatal(err)
	}

	log2 := `{"timestamp":"2024-01-15T10:00:00","level":"info","msg":"server started"}
{"timestamp":"2024-01-15T10:00:01","level":"error","msg":"unhandled error"}
`
	if err := os.WriteFile(filepath.Join(nextDir, "app.2024-01-15.log"), []byte(log2), 0644); err != nil {
		t.Fatal(err)
	}

	return dir
}

func TestListApps(t *testing.T) {
	dir := setupTestDir(t)
	r := NewReader(dir)

	apps, err := r.ListApps()
	if err != nil {
		t.Fatal(err)
	}
	if len(apps) != 2 {
		t.Errorf("got %d apps, want 2", len(apps))
	}
}

func TestListFiles(t *testing.T) {
	dir := setupTestDir(t)
	r := NewReader(dir)

	files, err := r.ListFiles("order-service", "2024-01-01", "2024-12-31")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 {
		t.Errorf("got %d files, want 1", len(files))
	}
	if files[0].Date != "2024-01-15" {
		t.Errorf("date = %q, want %q", files[0].Date, "2024-01-15")
	}
}

func TestListFilesDateFilter(t *testing.T) {
	dir := setupTestDir(t)
	r := NewReader(dir)

	files, err := r.ListFiles("order-service", "2024-02-01", "2024-12-31")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 0 {
		t.Errorf("got %d files, want 0 (date out of range)", len(files))
	}
}

func TestSearchWithLevelFilter(t *testing.T) {
	dir := setupTestDir(t)
	r := NewReader(dir)

	result, err := r.Search(SearchParams{
		App:   "order-service",
		From:  "2024-01-01",
		To:    "2024-12-31",
		Level: "ERROR",
		Limit: 100,
	}, "test-node")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Lines) != 2 {
		t.Errorf("got %d error lines, want 2", len(result.Lines))
	}
	if result.Node != "test-node" {
		t.Errorf("node = %q, want %q", result.Node, "test-node")
	}
}

func TestSearchWithKeyword(t *testing.T) {
	dir := setupTestDir(t)
	r := NewReader(dir)

	result, err := r.Search(SearchParams{
		App:     "order-service",
		From:    "2024-01-01",
		To:      "2024-12-31",
		Keyword: "timeout",
		Limit:   100,
	}, "test-node")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Lines) != 1 {
		t.Errorf("got %d lines matching 'timeout', want 1", len(result.Lines))
	}
}

func TestSearchPagination(t *testing.T) {
	dir := setupTestDir(t)
	r := NewReader(dir)

	result, err := r.Search(SearchParams{
		App:   "order-service",
		From:  "2024-01-01",
		To:    "2024-12-31",
		Limit: 2,
	}, "test-node")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Lines) != 2 {
		t.Errorf("got %d lines, want 2 (limit)", len(result.Lines))
	}
	if !result.HasMore {
		t.Error("hasMore should be true")
	}
}

func TestSearchJSONLogs(t *testing.T) {
	dir := setupTestDir(t)
	r := NewReader(dir)

	result, err := r.Search(SearchParams{
		App:   "web-app",
		From:  "2024-01-01",
		To:    "2024-12-31",
		Level: "ERROR",
		Limit: 100,
	}, "test-node")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Lines) != 1 {
		t.Errorf("got %d error lines, want 1", len(result.Lines))
	}
}

func TestStats(t *testing.T) {
	dir := setupTestDir(t)
	r := NewReader(dir)

	stats, err := r.Stats("order-service", "2024-01-01", "2024-12-31", "test-node")
	if err != nil {
		t.Fatal(err)
	}
	if stats.TotalLines != 5 {
		t.Errorf("totalLines = %d, want 5", stats.TotalLines)
	}
	if stats.ErrorCount != 2 {
		t.Errorf("errorCount = %d, want 2", stats.ErrorCount)
	}
	if stats.WarnCount != 1 {
		t.Errorf("warnCount = %d, want 1", stats.WarnCount)
	}
	if stats.FileCount != 1 {
		t.Errorf("fileCount = %d, want 1", stats.FileCount)
	}
}
