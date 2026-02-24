package logreader

import (
	"bytes"
	"compress/gzip"
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

// createGzFile - gzip 압축 파일 생성 헬퍼
func createGzFile(t *testing.T, path string, content string) {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, buf.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}
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

// --- 새로운 테스트 케이스 ---

func TestSearchMultiChunkSameDay(t *testing.T) {
	dir := t.TempDir()
	appDir := filepath.Join(dir, "my-app")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		t.Fatal(err)
	}

	// 활성 로그
	active := `2024-01-15 10:00:00.000 INFO  c.e.App - Active log line
2024-01-15 10:00:01.000 ERROR c.e.App - Active error
`
	if err := os.WriteFile(filepath.Join(appDir, "app-2024-01-15.log"), []byte(active), 0644); err != nil {
		t.Fatal(err)
	}

	// 사이즈 로테이션 청크 (winston 스타일 .log.1)
	chunk1 := `2024-01-15 09:00:00.000 INFO  c.e.App - Rotated chunk line
2024-01-15 09:00:01.000 WARN  c.e.App - Rotated warning
`
	if err := os.WriteFile(filepath.Join(appDir, "app-2024-01-15.log.1"), []byte(chunk1), 0644); err != nil {
		t.Fatal(err)
	}

	r := NewReader(dir)
	result, err := r.Search(SearchParams{
		App:   "my-app",
		From:  "2024-01-01",
		To:    "2024-12-31",
		Limit: 100,
	}, "test-node")
	if err != nil {
		t.Fatal(err)
	}

	// 두 파일에서 총 4줄
	if len(result.Lines) != 4 {
		t.Errorf("got %d lines, want 4 (from both chunks)", len(result.Lines))
	}

	// File 필드로 출처 파일 구분 가능 확인
	fileSet := map[string]bool{}
	for _, l := range result.Lines {
		fileSet[l.File] = true
	}
	if len(fileSet) != 2 {
		t.Errorf("got %d distinct files, want 2", len(fileSet))
	}
}

func TestSearchArchiveDirectory(t *testing.T) {
	dir := t.TempDir()
	appDir := filepath.Join(dir, "my-app")
	archiveDir := filepath.Join(appDir, "archive")
	if err := os.MkdirAll(archiveDir, 0755); err != nil {
		t.Fatal(err)
	}

	// 앱 루트 활성 로그
	active := `2024-01-15 10:00:00.000 INFO  c.e.App - Active line
`
	if err := os.WriteFile(filepath.Join(appDir, "app-2024-01-15.log"), []byte(active), 0644); err != nil {
		t.Fatal(err)
	}

	// archive 디렉토리 로그
	archived := `2024-01-15 08:00:00.000 ERROR c.e.App - Archived error
2024-01-15 08:00:01.000 INFO  c.e.App - Archived info
`
	if err := os.WriteFile(filepath.Join(archiveDir, "app-2024-01-15.log.1"), []byte(archived), 0644); err != nil {
		t.Fatal(err)
	}

	r := NewReader(dir)
	result, err := r.Search(SearchParams{
		App:   "my-app",
		From:  "2024-01-01",
		To:    "2024-12-31",
		Limit: 100,
	}, "test-node")
	if err != nil {
		t.Fatal(err)
	}

	// 활성(1줄) + archive(2줄) = 3줄
	if len(result.Lines) != 3 {
		t.Errorf("got %d lines, want 3", len(result.Lines))
	}

	// archive 파일의 File 필드에 "archive/" 접두사 확인
	hasArchive := false
	for _, l := range result.Lines {
		if l.File == "archive/app-2024-01-15.log.1" {
			hasArchive = true
		}
	}
	if !hasArchive {
		t.Error("expected a line with File = 'archive/app-2024-01-15.log.1'")
	}
}

func TestSearchCompressedFile(t *testing.T) {
	dir := t.TempDir()
	appDir := filepath.Join(dir, "my-app")
	archiveDir := filepath.Join(appDir, "archive")
	if err := os.MkdirAll(archiveDir, 0755); err != nil {
		t.Fatal(err)
	}

	// 활성 로그
	active := `2024-01-15 10:00:00.000 INFO  c.e.App - Active line
`
	if err := os.WriteFile(filepath.Join(appDir, "app-2024-01-15.log"), []byte(active), 0644); err != nil {
		t.Fatal(err)
	}

	// gz 압축 파일 (archive 내)
	gzContent := `2024-01-15 08:00:00.000 ERROR c.e.App - Compressed error
2024-01-15 08:00:01.000 WARN  c.e.App - Compressed warning
`
	createGzFile(t, filepath.Join(archiveDir, "app-2024-01-15.log.gz"), gzContent)

	r := NewReader(dir)

	// 검색 테스트
	result, err := r.Search(SearchParams{
		App:   "my-app",
		From:  "2024-01-01",
		To:    "2024-12-31",
		Limit: 100,
	}, "test-node")
	if err != nil {
		t.Fatal(err)
	}

	// 활성(1줄) + gz(2줄) = 3줄
	if len(result.Lines) != 3 {
		t.Errorf("got %d lines, want 3", len(result.Lines))
	}

	// gz에서 읽은 ERROR 라인 확인
	errorCount := 0
	for _, l := range result.Lines {
		if l.Level == "ERROR" {
			errorCount++
		}
	}
	if errorCount != 1 {
		t.Errorf("got %d error lines, want 1", errorCount)
	}

	// 통계 테스트 (gz 파일도 포함)
	stats, err := r.Stats("my-app", "2024-01-01", "2024-12-31", "test-node")
	if err != nil {
		t.Fatal(err)
	}
	if stats.TotalLines != 3 {
		t.Errorf("stats totalLines = %d, want 3", stats.TotalLines)
	}
	if stats.FileCount != 2 {
		t.Errorf("stats fileCount = %d, want 2", stats.FileCount)
	}
}

func TestListFilesMultiChunkSort(t *testing.T) {
	dir := t.TempDir()
	appDir := filepath.Join(dir, "my-app")
	archiveDir := filepath.Join(appDir, "archive")
	if err := os.MkdirAll(archiveDir, 0755); err != nil {
		t.Fatal(err)
	}

	// 같은 날짜, 다양한 로테이션 파일 생성
	logContent := "2024-01-15 10:00:00.000 INFO c.e.App - test\n"

	// 활성 로그 (로테이션 0)
	os.WriteFile(filepath.Join(appDir, "app-2024-01-15.log"), []byte(logContent), 0644)
	// winston 스타일 로테이션
	os.WriteFile(filepath.Join(appDir, "app-2024-01-15.log.1"), []byte(logContent), 0644)
	os.WriteFile(filepath.Join(appDir, "app-2024-01-15.log.2"), []byte(logContent), 0644)
	// archive 내 gz
	createGzFile(t, filepath.Join(archiveDir, "app-2024-01-15.log.3.gz"), logContent)

	// 다른 날짜 파일
	os.WriteFile(filepath.Join(appDir, "app-2024-01-14.log"), []byte(logContent), 0644)

	r := NewReader(dir)
	files, err := r.ListFiles("my-app", "2024-01-01", "2024-12-31")
	if err != nil {
		t.Fatal(err)
	}

	// 총 5개 파일
	if len(files) != 5 {
		t.Fatalf("got %d files, want 5", len(files))
	}

	// 날짜 순 정렬 확인: 01-14가 먼저
	if files[0].Date != "2024-01-14" {
		t.Errorf("files[0].Date = %q, want 2024-01-14", files[0].Date)
	}

	// 같은 날짜(01-15) 내 로테이션 번호 순 정렬 확인
	expectedOrder := []string{
		"app-2024-01-14.log",
		"app-2024-01-15.log",
		"app-2024-01-15.log.1",
		"app-2024-01-15.log.2",
		"archive/app-2024-01-15.log.3.gz",
	}
	for i, want := range expectedOrder {
		if files[i].Name != want {
			t.Errorf("files[%d].Name = %q, want %q", i, files[i].Name, want)
		}
	}

	// Compressed 필드 확인
	if files[4].Compressed != true {
		t.Error("archive gz file should have Compressed = true")
	}
	if files[0].Compressed != false {
		t.Error("plain log file should have Compressed = false")
	}
}

func TestStatsIncludesArchive(t *testing.T) {
	dir := t.TempDir()
	appDir := filepath.Join(dir, "my-app")
	archiveDir := filepath.Join(appDir, "archive")
	if err := os.MkdirAll(archiveDir, 0755); err != nil {
		t.Fatal(err)
	}

	// 활성 로그: 2 lines (1 ERROR, 1 INFO)
	active := `2024-01-15 10:00:00.000 INFO  c.e.App - Active info
2024-01-15 10:00:01.000 ERROR c.e.App - Active error
`
	if err := os.WriteFile(filepath.Join(appDir, "app-2024-01-15.log"), []byte(active), 0644); err != nil {
		t.Fatal(err)
	}

	// archive 비압축: 2 lines (1 WARN, 1 ERROR)
	archived := `2024-01-15 09:00:00.000 WARN  c.e.App - Archived warn
2024-01-15 09:00:01.000 ERROR c.e.App - Archived error
`
	if err := os.WriteFile(filepath.Join(archiveDir, "app-2024-01-15.log.1"), []byte(archived), 0644); err != nil {
		t.Fatal(err)
	}

	// archive gz 압축: 1 line (1 DEBUG)
	gzContent := `2024-01-15 08:00:00.000 DEBUG c.e.App - Compressed debug
`
	createGzFile(t, filepath.Join(archiveDir, "app-2024-01-15.log.2.gz"), gzContent)

	r := NewReader(dir)
	stats, err := r.Stats("my-app", "2024-01-01", "2024-12-31", "test-node")
	if err != nil {
		t.Fatal(err)
	}

	// 3개 파일
	if stats.FileCount != 3 {
		t.Errorf("fileCount = %d, want 3", stats.FileCount)
	}
	// 총 5줄
	if stats.TotalLines != 5 {
		t.Errorf("totalLines = %d, want 5", stats.TotalLines)
	}
	// ERROR: 2 (active 1 + archive 1)
	if stats.ErrorCount != 2 {
		t.Errorf("errorCount = %d, want 2", stats.ErrorCount)
	}
	// WARN: 1
	if stats.WarnCount != 1 {
		t.Errorf("warnCount = %d, want 1", stats.WarnCount)
	}
	// INFO: 1
	if stats.InfoCount != 1 {
		t.Errorf("infoCount = %d, want 1", stats.InfoCount)
	}
	// DEBUG: 1
	if stats.DebugCount != 1 {
		t.Errorf("debugCount = %d, want 1", stats.DebugCount)
	}
}
