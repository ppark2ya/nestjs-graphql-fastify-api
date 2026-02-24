# Log History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 파일 기반 로그(Log4j2 PatternLayout, Next.js JSON)를 UI에서 검색/조회할 수 있는 히스토리 서비스 구축

**Architecture:** Log-Streamer(Go)에 파일 읽기 REST API를 추가하고, Gateway(NestJS)에서 모든 Swarm 노드의 log-streamer를 병렬 조회하여 결과를 병합한다. UI는 react-router-dom으로 /history 페이지를 추가하고 shadcn/ui 컴포넌트로 필터+테이블을 구성한다.

**Tech Stack:** Go 1.18 (bufio, regexp, os), NestJS (GraphQL Code-First, Axios, dns), React 19, Apollo Client, react-router-dom, shadcn/ui, Tailwind v4

---

## Task 1: Go - Log Reader Package (Types + File Scanner)

**Files:**
- Create: `apps/log-streamer/internal/logreader/types.go`
- Create: `apps/log-streamer/internal/logreader/reader.go`
- Modify: `apps/log-streamer/internal/config/config.go`

**Step 1: Config에 LogDir 추가**

`apps/log-streamer/internal/config/config.go` — Config 구조체에 `LogDir` 필드 추가:

```go
type Config struct {
	Port     int
	LogLevel string
	LogDir   string // 추가
}
```

`Load()` 함수에 LogDir 로드 추가:

```go
logDir := os.Getenv("LOG_DIR")
if logDir == "" {
	logDir = "/opt/logs"
}

return &Config{
	Port:     port,
	LogLevel: logLevel,
	LogDir:   logDir, // 추가
}
```

**Step 2: 타입 정의**

`apps/log-streamer/internal/logreader/types.go`:

```go
package logreader

// LogApp - 앱 디렉토리 정보
type LogApp struct {
	Name string `json:"name"`
}

// LogFile - 로그 파일 메타데이터
type LogFile struct {
	Name string `json:"name"`
	Date string `json:"date"` // YYYY-MM-DD (파일명에서 추출)
	Size int64  `json:"size"`
}

// LogLine - 파싱된 로그 라인
type LogLine struct {
	Timestamp string `json:"timestamp,omitempty"`
	Level     string `json:"level,omitempty"`
	Source    string `json:"source,omitempty"`
	Message   string `json:"message"`
	File      string `json:"file"`
	LineNo    int    `json:"lineNo"`
}

// SearchParams - 검색 파라미터
type SearchParams struct {
	App     string
	From    string // YYYY-MM-DD
	To      string // YYYY-MM-DD
	Level   string // ERROR, WARN, INFO, DEBUG (빈 문자열이면 전체)
	Keyword string
	After   string // 타임스탬프 커서 (이전 페이지의 마지막 타임스탬프)
	Limit   int    // 기본 100
}

// SearchResult - 검색 결과
type SearchResult struct {
	Lines   []LogLine `json:"lines"`
	Node    string    `json:"node"`
	HasMore bool      `json:"hasMore"`
}

// LogStats - 요약 통계
type LogStats struct {
	Node       string `json:"node"`
	TotalLines int    `json:"totalLines"`
	ErrorCount int    `json:"errorCount"`
	WarnCount  int    `json:"warnCount"`
	InfoCount  int    `json:"infoCount"`
	DebugCount int    `json:"debugCount"`
	FileCount  int    `json:"fileCount"`
}
```

**Step 3: File Scanner (디렉토리 스캔 + 파일 목록)**

`apps/log-streamer/internal/logreader/reader.go`:

```go
package logreader

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// 파일명에서 날짜 추출 정규식: app.2024-01-15.log 또는 2024-01-15.log
var dateInFilename = regexp.MustCompile(`(\d{4}-\d{2}-\d{2})`)

// Reader - 로그 파일 리더
type Reader struct {
	baseDir string
}

// NewReader - Reader 생성자
func NewReader(baseDir string) *Reader {
	return &Reader{baseDir: baseDir}
}

// ListApps - /opt/logs/ 하위 디렉토리 목록 (앱 목록)
func (r *Reader) ListApps() ([]LogApp, error) {
	entries, err := os.ReadDir(r.baseDir)
	if err != nil {
		return nil, err
	}

	var apps []LogApp
	for _, e := range entries {
		if e.IsDir() {
			apps = append(apps, LogApp{Name: e.Name()})
		}
	}
	return apps, nil
}

// ListFiles - 특정 앱의 로그 파일 목록 (날짜 범위 필터)
func (r *Reader) ListFiles(app, from, to string) ([]LogFile, error) {
	dir := filepath.Join(r.baseDir, app)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var files []LogFile
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".log") {
			continue
		}

		date := extractDate(e.Name())
		if date == "" {
			continue
		}

		// 날짜 범위 필터
		if from != "" && date < from {
			continue
		}
		if to != "" && date > to {
			continue
		}

		info, err := e.Info()
		if err != nil {
			continue
		}

		files = append(files, LogFile{
			Name: e.Name(),
			Date: date,
			Size: info.Size(),
		})
	}

	// 날짜 순 정렬
	sort.Slice(files, func(i, j int) bool {
		return files[i].Date < files[j].Date
	})

	return files, nil
}

// extractDate - 파일명에서 날짜 추출
func extractDate(filename string) string {
	matches := dateInFilename.FindStringSubmatch(filename)
	if len(matches) < 2 {
		return ""
	}
	return matches[1]
}
```

**Step 4: 빌드 확인**

Run: `cd apps/log-streamer && go build ./...`
Expected: 에러 없이 빌드 성공

**Step 5: Commit**

```bash
git add apps/log-streamer/internal/config/config.go \
       apps/log-streamer/internal/logreader/types.go \
       apps/log-streamer/internal/logreader/reader.go
git commit -m "feat(log-streamer): 로그 파일 리더 패키지 (타입 + 디렉토리 스캐너)"
```

---

## Task 2: Go - Log Parsers (Log4j2 + JSON + Auto-detect)

**Files:**
- Create: `apps/log-streamer/internal/logreader/parser.go`
- Create: `apps/log-streamer/internal/logreader/parser_test.go`

**Step 1: 파서 구현**

`apps/log-streamer/internal/logreader/parser.go`:

```go
package logreader

import (
	"encoding/json"
	"regexp"
	"strings"
)

// Log4j2 패턴: 2024-01-15 10:30:45.123 INFO  c.e.MyClass - User logged in
var log4j2Pattern = regexp.MustCompile(
	`^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}[.,]\d{3})\s+(\w+)\s+(\S+)\s+-\s+(.*)$`,
)

// Parser 인터페이스
type Parser interface {
	Parse(line string) LogLine
}

// Log4j2Parser - Spring Log4j2 PatternLayout 파서
type Log4j2Parser struct{}

// JSONParser - Next.js JSON 로그 파서
type JSONParser struct{}

// RawParser - 파싱 불가 시 원본 그대로
type RawParser struct{}

// DetectParser - 첫 줄로 파서 자동 감지
func DetectParser(firstLine string) Parser {
	trimmed := strings.TrimSpace(firstLine)
	if strings.HasPrefix(trimmed, "{") {
		return &JSONParser{}
	}
	if log4j2Pattern.MatchString(trimmed) {
		return &Log4j2Parser{}
	}
	return &RawParser{}
}

func (p *Log4j2Parser) Parse(line string) LogLine {
	matches := log4j2Pattern.FindStringSubmatch(line)
	if matches == nil {
		return LogLine{Message: line}
	}
	return LogLine{
		Timestamp: matches[1],
		Level:     strings.ToUpper(strings.TrimSpace(matches[2])),
		Source:    matches[3],
		Message:   matches[4],
	}
}

func (p *JSONParser) Parse(line string) LogLine {
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(line), &data); err != nil {
		return LogLine{Message: line}
	}

	return LogLine{
		Timestamp: firstStr(data, "timestamp", "@timestamp", "time"),
		Level:     strings.ToUpper(firstStr(data, "level", "severity")),
		Source:    firstStr(data, "logger", "source", "name", "module"),
		Message:   firstStr(data, "msg", "message"),
	}
}

func (p *RawParser) Parse(line string) LogLine {
	return LogLine{Message: line}
}

// firstStr - 여러 키 중 첫 번째로 존재하는 값 반환
func firstStr(data map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if v, ok := data[k]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
	}
	return ""
}
```

**Step 2: 파서 테스트**

`apps/log-streamer/internal/logreader/parser_test.go`:

```go
package logreader

import "testing"

func TestLog4j2Parser(t *testing.T) {
	p := &Log4j2Parser{}
	line := "2024-01-15 10:30:45.123 INFO  c.e.MyClass - User logged in"
	result := p.Parse(line)

	if result.Timestamp != "2024-01-15 10:30:45.123" {
		t.Errorf("timestamp = %q, want %q", result.Timestamp, "2024-01-15 10:30:45.123")
	}
	if result.Level != "INFO" {
		t.Errorf("level = %q, want %q", result.Level, "INFO")
	}
	if result.Source != "c.e.MyClass" {
		t.Errorf("source = %q, want %q", result.Source, "c.e.MyClass")
	}
	if result.Message != "User logged in" {
		t.Errorf("message = %q, want %q", result.Message, "User logged in")
	}
}

func TestLog4j2ParserError(t *testing.T) {
	p := &Log4j2Parser{}
	line := "2024-01-15 10:30:45.123 ERROR c.e.OrderService - Order failed: timeout"
	result := p.Parse(line)

	if result.Level != "ERROR" {
		t.Errorf("level = %q, want %q", result.Level, "ERROR")
	}
}

func TestJSONParser(t *testing.T) {
	p := &JSONParser{}
	line := `{"timestamp":"2024-01-15T10:30:45","level":"info","msg":"request completed"}`
	result := p.Parse(line)

	if result.Timestamp != "2024-01-15T10:30:45" {
		t.Errorf("timestamp = %q, want %q", result.Timestamp, "2024-01-15T10:30:45")
	}
	if result.Level != "INFO" {
		t.Errorf("level = %q, want %q", result.Level, "INFO")
	}
	if result.Message != "request completed" {
		t.Errorf("message = %q, want %q", result.Message, "request completed")
	}
}

func TestJSONParserAlternativeKeys(t *testing.T) {
	p := &JSONParser{}
	line := `{"@timestamp":"2024-01-15T10:30:45","severity":"warn","message":"slow query"}`
	result := p.Parse(line)

	if result.Timestamp != "2024-01-15T10:30:45" {
		t.Errorf("timestamp = %q", result.Timestamp)
	}
	if result.Level != "WARN" {
		t.Errorf("level = %q, want %q", result.Level, "WARN")
	}
}

func TestRawParser(t *testing.T) {
	p := &RawParser{}
	line := "some random log line"
	result := p.Parse(line)

	if result.Message != "some random log line" {
		t.Errorf("message = %q", result.Message)
	}
	if result.Level != "" {
		t.Errorf("level should be empty, got %q", result.Level)
	}
}

func TestDetectParser(t *testing.T) {
	tests := []struct {
		line string
		want string
	}{
		{`{"level":"info","msg":"test"}`, "JSONParser"},
		{"2024-01-15 10:30:45.123 INFO c.e.Test - msg", "Log4j2Parser"},
		{"random text", "RawParser"},
	}

	for _, tt := range tests {
		p := DetectParser(tt.line)
		got := ""
		switch p.(type) {
		case *JSONParser:
			got = "JSONParser"
		case *Log4j2Parser:
			got = "Log4j2Parser"
		case *RawParser:
			got = "RawParser"
		}
		if got != tt.want {
			t.Errorf("DetectParser(%q) = %s, want %s", tt.line, got, tt.want)
		}
	}
}
```

**Step 3: 테스트 실행**

Run: `cd apps/log-streamer && go test ./internal/logreader/ -v`
Expected: 모든 테스트 PASS

**Step 4: Commit**

```bash
git add apps/log-streamer/internal/logreader/parser.go \
       apps/log-streamer/internal/logreader/parser_test.go
git commit -m "feat(log-streamer): Log4j2 + JSON 로그 파서 (auto-detect)"
```

---

## Task 3: Go - Search + Stats 로직

**Files:**
- Modify: `apps/log-streamer/internal/logreader/reader.go`
- Create: `apps/log-streamer/internal/logreader/reader_test.go`

**Step 1: Search + Stats 메서드 추가**

`apps/log-streamer/internal/logreader/reader.go`에 다음 메서드 추가:

```go
import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Search - 로그 파일 검색 (서버사이드 필터링 + 페이지네이션)
func (r *Reader) Search(params SearchParams, nodeName string) (*SearchResult, error) {
	if params.Limit <= 0 {
		params.Limit = 100
	}

	files, err := r.ListFiles(params.App, params.From, params.To)
	if err != nil {
		return nil, err
	}

	result := &SearchResult{
		Lines: make([]LogLine, 0),
		Node:  nodeName,
	}

	for _, f := range files {
		if len(result.Lines) >= params.Limit {
			result.HasMore = true
			break
		}

		remaining := params.Limit - len(result.Lines)
		lines, hasMore, err := r.searchFile(params, f, remaining)
		if err != nil {
			continue
		}

		result.Lines = append(result.Lines, lines...)
		if hasMore {
			result.HasMore = true
		}
	}

	return result, nil
}

// searchFile - 단일 파일 검색
func (r *Reader) searchFile(params SearchParams, f LogFile, limit int) ([]LogLine, bool, error) {
	path := filepath.Join(r.baseDir, params.App, f.Name)
	file, err := os.Open(path)
	if err != nil {
		return nil, false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	// 큰 라인 처리를 위해 버퍼 크기 확대
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var lines []LogLine
	var parser Parser
	lineNo := 0

	for scanner.Scan() {
		lineNo++
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}

		// 첫 줄로 파서 감지
		if parser == nil {
			parser = DetectParser(line)
		}

		parsed := parser.Parse(line)
		parsed.File = f.Name
		parsed.LineNo = lineNo

		// 필터 적용
		if !matchFilters(parsed, params) {
			continue
		}

		lines = append(lines, parsed)
		if len(lines) >= limit {
			return lines, scanner.Scan(), nil // hasMore = 다음 줄이 있으면 true
		}
	}

	return lines, false, scanner.Err()
}

// Stats - 로그 통계 (파일별 레벨 카운트)
func (r *Reader) Stats(app, from, to, nodeName string) (*LogStats, error) {
	files, err := r.ListFiles(app, from, to)
	if err != nil {
		return nil, err
	}

	stats := &LogStats{
		Node:      nodeName,
		FileCount: len(files),
	}

	for _, f := range files {
		if err := r.countFile(filepath.Join(r.baseDir, app, f.Name), stats); err != nil {
			continue
		}
	}

	return stats, nil
}

// countFile - 단일 파일 라인/레벨 카운트
func (r *Reader) countFile(path string, stats *LogStats) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var parser Parser
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		if parser == nil {
			parser = DetectParser(line)
		}

		parsed := parser.Parse(line)
		stats.TotalLines++

		switch strings.ToUpper(parsed.Level) {
		case "ERROR":
			stats.ErrorCount++
		case "WARN", "WARNING":
			stats.WarnCount++
		case "INFO":
			stats.InfoCount++
		case "DEBUG":
			stats.DebugCount++
		}
	}

	return scanner.Err()
}

// matchFilters - 레벨/키워드/타임스탬프 커서 필터
func matchFilters(line LogLine, params SearchParams) bool {
	// 레벨 필터
	if params.Level != "" && !strings.EqualFold(line.Level, params.Level) {
		return false
	}

	// 키워드 필터 (대소문자 무시)
	if params.Keyword != "" {
		kw := strings.ToLower(params.Keyword)
		if !strings.Contains(strings.ToLower(line.Message), kw) &&
			!strings.Contains(strings.ToLower(line.Source), kw) {
			return false
		}
	}

	// 타임스탬프 커서 (이전 페이지의 마지막 타임스탬프 이후만)
	if params.After != "" && line.Timestamp != "" && line.Timestamp <= params.After {
		return false
	}

	return true
}
```

**Step 2: 테스트 (파일 시스템 기반)**

`apps/log-streamer/internal/logreader/reader_test.go`:

```go
package logreader

import (
	"os"
	"path/filepath"
	"testing"
)

func setupTestDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	// 앱 디렉토리 생성
	appDir := filepath.Join(dir, "order-service")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		t.Fatal(err)
	}

	// 테스트 로그 파일 생성
	log1 := `2024-01-15 10:00:00.000 INFO  c.e.App - Server started
2024-01-15 10:00:01.000 ERROR c.e.OrderService - Order failed: timeout
2024-01-15 10:00:02.000 WARN  c.e.DB - Slow query detected
2024-01-15 10:00:03.000 INFO  c.e.App - Request completed
2024-01-15 10:00:04.000 ERROR c.e.PaymentService - Payment declined
`
	if err := os.WriteFile(filepath.Join(appDir, "app.2024-01-15.log"), []byte(log1), 0644); err != nil {
		t.Fatal(err)
	}

	// Next.js JSON 앱 디렉토리
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
```

**Step 3: 테스트 실행**

Run: `cd apps/log-streamer && go test ./internal/logreader/ -v`
Expected: 모든 테스트 PASS

**Step 4: Commit**

```bash
git add apps/log-streamer/internal/logreader/reader.go \
       apps/log-streamer/internal/logreader/reader_test.go
git commit -m "feat(log-streamer): 로그 검색 + 통계 (서버사이드 필터링, 페이지네이션)"
```

---

## Task 4: Go - REST Handlers + Server Integration

**Files:**
- Create: `apps/log-streamer/internal/handler/logfiles.go`
- Modify: `apps/log-streamer/internal/server/server.go`

**Step 1: REST 핸들러 구현**

`apps/log-streamer/internal/handler/logfiles.go`:

```go
package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"

	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/docker"
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/logreader"
)

// LogFilesHandler - 로그 파일 관련 REST 핸들러
type LogFilesHandler struct {
	reader       *logreader.Reader
	dockerClient *docker.Client
	nodeName     string // 캐시된 노드명
}

// NewLogFilesHandler - 생성자
func NewLogFilesHandler(reader *logreader.Reader, dockerClient *docker.Client) *LogFilesHandler {
	hostname, _ := os.Hostname()
	return &LogFilesHandler{
		reader:       reader,
		dockerClient: dockerClient,
		nodeName:     hostname,
	}
}

// RegisterRoutes - mux에 라우트 등록
func (h *LogFilesHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/logs/apps", h.handleApps)
	mux.HandleFunc("/api/logs/files", h.handleFiles)
	mux.HandleFunc("/api/logs/search", h.handleSearch)
	mux.HandleFunc("/api/logs/stats", h.handleStats)
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

	json.NewEncoder(w).Encode(map[string]interface{}{
		"apps": apps,
		"node": h.getNodeName(r),
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

	json.NewEncoder(w).Encode(map[string]interface{}{
		"files": files,
		"node":  h.getNodeName(r),
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

	result, err := h.reader.Search(params, h.getNodeName(r))
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

	stats, err := h.reader.Stats(app, q.Get("from"), q.Get("to"), h.getNodeName(r))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(stats)
}

// getNodeName - Swarm 노드 호스트명 (캐시)
func (h *LogFilesHandler) getNodeName(r *http.Request) string {
	if h.nodeName != "" {
		return h.nodeName
	}
	hostname, _ := os.Hostname()
	h.nodeName = hostname
	return h.nodeName
}
```

**Step 2: Server에 라우트 등록**

`apps/log-streamer/internal/server/server.go`의 `Start()` 메서드에 추가:

```go
import (
	// 기존 import에 추가
	"github.com/your-org/nestjs-graphql-fastify-api/apps/log-streamer/internal/logreader"
)
```

`Start()` 함수 내 핸들러 등록 부분에 추가:

```go
// 기존 핸들러 이후에 추가
logReader := logreader.NewReader(s.config.LogDir)
logFilesHandler := handler.NewLogFilesHandler(logReader, s.dockerClient)
logFilesHandler.RegisterRoutes(mux)
```

**Step 3: 빌드 확인**

Run: `cd apps/log-streamer && go build ./...`
Expected: 에러 없이 빌드 성공

**Step 4: Commit**

```bash
git add apps/log-streamer/internal/handler/logfiles.go \
       apps/log-streamer/internal/server/server.go
git commit -m "feat(log-streamer): 로그 파일 REST API (apps, files, search, stats)"
```

---

## Task 5: Gateway - GraphQL Models + Input Types

**Files:**
- Create: `apps/gateway/src/log-history/models/log-line.model.ts`
- Create: `apps/gateway/src/log-history/models/log-summary.model.ts`
- Create: `apps/gateway/src/log-history/models/log-search-result.model.ts`
- Create: `apps/gateway/src/log-history/models/log-app.model.ts`
- Create: `apps/gateway/src/log-history/dto/log-search.input.ts`

**Step 1: LogLine 모델**

`apps/gateway/src/log-history/models/log-line.model.ts`:

```typescript
import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType({ description: '파싱된 로그 라인' })
export class LogLine {
  @Field(() => String, { nullable: true, description: '타임스탬프 (파싱 불가 시 null)' })
  timestamp?: string;

  @Field(() => String, { nullable: true, description: '로그 레벨 (ERROR, WARN, INFO, DEBUG)' })
  level?: string;

  @Field(() => String, { nullable: true, description: '소스 (클래스명, 모듈명)' })
  source?: string;

  @Field(() => String, { description: '로그 메시지 (파싱 실패 시 원본 라인 전체)' })
  message: string;

  @Field(() => String, { description: 'Swarm 노드명' })
  node: string;

  @Field(() => String, { description: '로그 파일명' })
  file: string;

  @Field(() => Int, { description: '파일 내 라인 번호' })
  lineNo: number;
}
```

**Step 2: LogSummary 모델**

`apps/gateway/src/log-history/models/log-summary.model.ts`:

```typescript
import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType({ description: '로그 요약 통계' })
export class LogSummary {
  @Field(() => Int)
  totalLines: number;

  @Field(() => Int)
  errorCount: number;

  @Field(() => Int)
  warnCount: number;

  @Field(() => Int)
  infoCount: number;

  @Field(() => Int)
  fileCount: number;
}
```

**Step 3: LogSearchResult 모델**

`apps/gateway/src/log-history/models/log-search-result.model.ts`:

```typescript
import { ObjectType, Field, Int } from '@nestjs/graphql';
import { LogLine } from './log-line.model';
import { LogSummary } from './log-summary.model';

@ObjectType({ description: '로그 검색 결과' })
export class LogSearchResult {
  @Field(() => [LogLine])
  lines: LogLine[];

  @Field(() => Boolean)
  hasMore: boolean;

  @Field(() => LogSummary)
  summary: LogSummary;
}
```

**Step 4: LogApp 모델**

`apps/gateway/src/log-history/models/log-app.model.ts`:

```typescript
import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType({ description: '로그 앱 정보' })
export class LogApp {
  @Field(() => String, { description: '앱 이름 (디렉토리명)' })
  name: string;

  @Field(() => String, { description: '노드명' })
  node: string;
}
```

**Step 5: LogSearchInput DTO**

`apps/gateway/src/log-history/dto/log-search.input.ts`:

```typescript
import { InputType, Field, Int } from '@nestjs/graphql';

@InputType({ description: '로그 검색 입력' })
export class LogSearchInput {
  @Field(() => String, { description: '앱 이름' })
  app: string;

  @Field(() => String, { description: '시작 날짜 (YYYY-MM-DD)' })
  from: string;

  @Field(() => String, { description: '종료 날짜 (YYYY-MM-DD)' })
  to: string;

  @Field(() => String, { nullable: true, description: '로그 레벨 필터' })
  level?: string;

  @Field(() => String, { nullable: true, description: '키워드 검색' })
  keyword?: string;

  @Field(() => String, { nullable: true, description: '노드 필터' })
  node?: string;

  @Field(() => String, { nullable: true, description: '타임스탬프 커서 (페이지네이션)' })
  after?: string;

  @Field(() => Int, { nullable: true, defaultValue: 100, description: '결과 수 제한' })
  limit?: number;
}
```

**Step 6: 빌드 확인**

Run: `pnpm run build:gateway`
Expected: 빌드 성공

**Step 7: Commit**

```bash
git add apps/gateway/src/log-history/
git commit -m "feat(gateway): LogHistory GraphQL 모델 + InputType"
```

---

## Task 6: Gateway - LogHistoryService (Multi-node Aggregation)

**Files:**
- Create: `apps/gateway/src/log-history/log-history.service.ts`

**Step 1: Service 구현**

`apps/gateway/src/log-history/log-history.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { promises as dns } from 'dns';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { LogSearchInput } from './dto/log-search.input';
import { LogSearchResult } from './models/log-search-result.model';
import { LogApp } from './models/log-app.model';
import { LogLine } from './models/log-line.model';
import { LogSummary } from './models/log-summary.model';

@Injectable()
export class LogHistoryService {
  private readonly logger = new Logger(LogHistoryService.name);
  private readonly logStreamerPort: number;
  private readonly logStreamerBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {
    this.logStreamerPort = parseInt(
      process.env.LOG_STREAMER_PORT ?? '4003',
      10,
    );
    this.logStreamerBaseUrl =
      process.env.LOG_STREAMER_URL ?? 'http://localhost:4003';
  }

  /**
   * 모든 log-streamer 인스턴스에서 앱 목록 조회
   */
  async listApps(): Promise<LogApp[]> {
    const hosts = await this.discoverLogStreamers();
    const results = await Promise.allSettled(
      hosts.map((host) =>
        this.circuitBreaker.fire('log-history', async () => {
          const res = await firstValueFrom(
            this.httpService.get(`${host}/api/logs/apps`),
          );
          return res.data;
        }),
      ),
    );

    const appMap = new Map<string, LogApp>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { apps, node } = result.value as {
        apps: { name: string }[];
        node: string;
      };
      for (const app of apps ?? []) {
        const key = `${app.name}@${node}`;
        if (!appMap.has(key)) {
          appMap.set(key, { name: app.name, node });
        }
      }
    }

    return Array.from(appMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /**
   * 모든 log-streamer에서 로그 검색 + 결과 병합
   */
  async search(input: LogSearchInput): Promise<LogSearchResult> {
    const hosts = await this.discoverLogStreamers();

    // 노드 필터가 있으면 해당 노드만 조회 (나머지도 일단 요청하고 결과에서 필터)
    const searchPromises = hosts.map((host) =>
      this.circuitBreaker.fire('log-history', async () => {
        const res = await firstValueFrom(
          this.httpService.get(`${host}/api/logs/search`, {
            params: {
              app: input.app,
              from: input.from,
              to: input.to,
              level: input.level,
              keyword: input.keyword,
              after: input.after,
              limit: input.limit ?? 100,
            },
            timeout: 30000,
          }),
        );
        return res.data;
      }),
    );

    const statsPromises = hosts.map((host) =>
      this.circuitBreaker.fire('log-history', async () => {
        const res = await firstValueFrom(
          this.httpService.get(`${host}/api/logs/stats`, {
            params: {
              app: input.app,
              from: input.from,
              to: input.to,
            },
            timeout: 30000,
          }),
        );
        return res.data;
      }),
    );

    const [searchResults, statsResults] = await Promise.all([
      Promise.allSettled(searchPromises),
      Promise.allSettled(statsPromises),
    ]);

    // 검색 결과 병합
    let allLines: LogLine[] = [];
    let hasMore = false;

    for (const result of searchResults) {
      if (result.status !== 'fulfilled') continue;
      const data = result.value as {
        lines: LogLine[];
        node: string;
        hasMore: boolean;
      };

      // 노드 필터 적용
      if (input.node && data.node !== input.node) continue;

      const linesWithNode = (data.lines ?? []).map((line) => ({
        ...line,
        node: data.node,
      }));
      allLines = allLines.concat(linesWithNode);
      if (data.hasMore) hasMore = true;
    }

    // 타임스탬프 정렬
    allLines.sort((a, b) => {
      const ta = a.timestamp ?? '';
      const tb = b.timestamp ?? '';
      return ta.localeCompare(tb);
    });

    // 제한 적용
    const limit = input.limit ?? 100;
    if (allLines.length > limit) {
      allLines = allLines.slice(0, limit);
      hasMore = true;
    }

    // 통계 병합
    const summary = this.mergeStats(statsResults, input.node);

    return { lines: allLines, hasMore, summary };
  }

  /**
   * Swarm DNS로 모든 log-streamer 인스턴스 발견
   */
  private async discoverLogStreamers(): Promise<string[]> {
    try {
      const addresses = await dns.resolve4('tasks.log-streamer');
      this.logger.debug(
        `Discovered ${addresses.length} log-streamer instances`,
      );
      return addresses.map(
        (ip) => `http://${ip}:${this.logStreamerPort}`,
      );
    } catch {
      // Dev 모드: DNS 실패 시 단일 URL 사용
      return [this.logStreamerBaseUrl];
    }
  }

  /**
   * 여러 노드의 통계 병합
   */
  private mergeStats(
    results: PromiseSettledResult<unknown>[],
    nodeFilter?: string,
  ): LogSummary {
    const summary: LogSummary = {
      totalLines: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      fileCount: 0,
    };

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const data = result.value as {
        node: string;
        totalLines: number;
        errorCount: number;
        warnCount: number;
        infoCount: number;
        fileCount: number;
      };

      if (nodeFilter && data.node !== nodeFilter) continue;

      summary.totalLines += data.totalLines;
      summary.errorCount += data.errorCount;
      summary.warnCount += data.warnCount;
      summary.infoCount += data.infoCount;
      summary.fileCount += data.fileCount;
    }

    return summary;
  }
}
```

**Step 2: 빌드 확인**

Run: `pnpm run build:gateway`
Expected: 빌드 성공

**Step 3: Commit**

```bash
git add apps/gateway/src/log-history/log-history.service.ts
git commit -m "feat(gateway): LogHistoryService (DNS 탐색 + 다노드 병합)"
```

---

## Task 7: Gateway - Resolver + Module + App Integration

**Files:**
- Create: `apps/gateway/src/log-history/log-history.resolver.ts`
- Create: `apps/gateway/src/log-history/log-history.module.ts`
- Modify: `apps/gateway/src/app.module.ts`

**Step 1: Resolver**

`apps/gateway/src/log-history/log-history.resolver.ts`:

```typescript
import { Resolver, Query, Args } from '@nestjs/graphql';
import { LogHistoryService } from './log-history.service';
import { LogApp } from './models/log-app.model';
import { LogSearchResult } from './models/log-search-result.model';
import { LogSearchInput } from './dto/log-search.input';

@Resolver()
export class LogHistoryResolver {
  constructor(private readonly service: LogHistoryService) {}

  @Query(() => [LogApp], { description: '로그 앱 목록 조회' })
  async logApps(): Promise<LogApp[]> {
    return this.service.listApps();
  }

  @Query(() => LogSearchResult, { description: '로그 검색' })
  async logSearch(
    @Args('input') input: LogSearchInput,
  ): Promise<LogSearchResult> {
    return this.service.search(input);
  }
}
```

**Step 2: Module**

`apps/gateway/src/log-history/log-history.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LogHistoryService } from './log-history.service';
import { LogHistoryResolver } from './log-history.resolver';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
  ],
  providers: [LogHistoryService, LogHistoryResolver],
})
export class LogHistoryModule {}
```

**Step 3: AppModule에 LogHistoryModule 등록**

`apps/gateway/src/app.module.ts`의 imports 배열에 추가:

```typescript
import { LogHistoryModule } from './log-history/log-history.module';

// @Module imports 배열에 추가:
LogHistoryModule,
```

**Step 4: 빌드 확인**

Run: `pnpm run build:gateway`
Expected: 빌드 성공. schema.gql에 logApps, logSearch 쿼리가 자동 생성됨

**Step 5: Commit**

```bash
git add apps/gateway/src/log-history/log-history.resolver.ts \
       apps/gateway/src/log-history/log-history.module.ts \
       apps/gateway/src/app.module.ts \
       apps/gateway/src/schema.gql
git commit -m "feat(gateway): LogHistory Resolver + Module 통합"
```

---

## Task 8: UI - Dependencies + Router + Navigation

**Files:**
- Modify: `package.json` (root)
- Create: `apps/log-viewer/src/lib/utils.ts`
- Modify: `apps/log-viewer/src/App.tsx`
- Create: `apps/log-viewer/src/pages/LiveStreamPage.tsx`
- Create: `apps/log-viewer/src/components/Navigation.tsx`

**Step 1: 의존성 설치**

```bash
cd /Users/jtpark/workspace/nestjs-graphql-fastify-api
pnpm add react-router-dom
pnpm add -D @types/react-router-dom
pnpm add clsx tailwind-merge class-variance-authority
```

**Step 2: cn() 유틸리티**

`apps/log-viewer/src/lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 3: Navigation 컴포넌트**

`apps/log-viewer/src/components/Navigation.tsx`:

```typescript
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function Navigation() {
  return (
    <header className="flex items-center px-4 py-3 border-b border-gray-700 bg-gray-900">
      <h1 className="text-base font-semibold mr-8">Docker Log Viewer</h1>
      <nav className="flex gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'px-3 py-1.5 rounded text-sm transition-colors',
              isActive
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
            )
          }
        >
          Live Stream
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            cn(
              'px-3 py-1.5 rounded text-sm transition-colors',
              isActive
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
            )
          }
        >
          History
        </NavLink>
      </nav>
    </header>
  );
}
```

**Step 4: LiveStreamPage 분리 (기존 App.tsx 로직 이동)**

`apps/log-viewer/src/pages/LiveStreamPage.tsx`:

```typescript
import { useState } from 'react';
import ContainerList from '../ContainerList';
import LogViewer from '../LogViewer';
import ServiceLogViewer from '../ServiceLogViewer';
import { Container, ServiceGroup } from '../graphql';

type Selection =
  | { type: 'container'; container: Container }
  | { type: 'service'; service: ServiceGroup }
  | null;

export default function LiveStreamPage() {
  const [selection, setSelection] = useState<Selection>(null);

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="w-64 border-r border-gray-700 flex flex-col overflow-hidden shrink-0">
        <div className="px-4 py-2 border-b border-gray-700">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Containers
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ContainerList
            selectedId={
              selection?.type === 'container' ? selection.container.id : null
            }
            selectedServiceName={
              selection?.type === 'service'
                ? selection.service.serviceName
                : null
            }
            onSelectContainer={(c) =>
              setSelection({ type: 'container', container: c })
            }
            onSelectService={(s) =>
              setSelection({ type: 'service', service: s })
            }
          />
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {selection?.type === 'service' ? (
          <ServiceLogViewer service={selection.service} />
        ) : selection?.type === 'container' ? (
          <LogViewer
            containerId={selection.container.id}
            containerName={selection.container.name}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <p>Select a container or service to view logs</p>
          </div>
        )}
      </main>
    </div>
  );
}
```

**Step 5: App.tsx를 라우터로 리팩토링**

`apps/log-viewer/src/App.tsx`:

```typescript
import { ApolloProvider } from '@apollo/client/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { client } from './apollo';
import Navigation from './components/Navigation';
import LiveStreamPage from './pages/LiveStreamPage';
import HistoryPage from './pages/HistoryPage';

export default function App() {
  return (
    <ApolloProvider client={client}>
      <BrowserRouter>
        <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
          <Navigation />
          <Routes>
            <Route path="/" element={<LiveStreamPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ApolloProvider>
  );
}
```

> **참고**: HistoryPage는 다음 Task에서 구현. 이 단계에서는 플레이스홀더로 시작.

`apps/log-viewer/src/pages/HistoryPage.tsx` (플레이스홀더):

```typescript
export default function HistoryPage() {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-600">
      <p>History page - coming soon</p>
    </div>
  );
}
```

**Step 6: 빌드 확인**

Run: `cd apps/log-viewer && npx vite build`
Expected: 빌드 성공

**Step 7: Commit**

```bash
git add apps/log-viewer/src/ package.json pnpm-lock.yaml
git commit -m "feat(log-viewer): react-router-dom + Navigation + LiveStreamPage 분리"
```

---

## Task 9: UI - HistoryPage (FilterBar + LogTable + SummaryBar)

**Files:**
- Create: `apps/log-viewer/src/history-graphql.ts`
- Modify: `apps/log-viewer/src/pages/HistoryPage.tsx`

**Step 1: GraphQL 쿼리 정의**

`apps/log-viewer/src/history-graphql.ts`:

```typescript
import { gql } from '@apollo/client';

export const LOG_APPS_QUERY = gql`
  query LogApps {
    logApps {
      name
      node
    }
  }
`;

export const LOG_SEARCH_QUERY = gql`
  query LogSearch($input: LogSearchInput!) {
    logSearch(input: $input) {
      lines {
        timestamp
        level
        source
        message
        node
        file
        lineNo
      }
      hasMore
      summary {
        totalLines
        errorCount
        warnCount
        infoCount
        fileCount
      }
    }
  }
`;

export interface LogApp {
  name: string;
  node: string;
}

export interface HistoryLogLine {
  timestamp: string | null;
  level: string | null;
  source: string | null;
  message: string;
  node: string;
  file: string;
  lineNo: number;
}

export interface LogSummary {
  totalLines: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  fileCount: number;
}

export interface LogSearchResult {
  lines: HistoryLogLine[];
  hasMore: boolean;
  summary: LogSummary;
}
```

**Step 2: HistoryPage 전체 구현**

`apps/log-viewer/src/pages/HistoryPage.tsx`:

```typescript
import { useState } from 'react';
import { useQuery, useLazyQuery } from '@apollo/client';
import { cn } from '../lib/utils';
import {
  LOG_APPS_QUERY,
  LOG_SEARCH_QUERY,
  LogApp,
  HistoryLogLine,
  LogSearchResult,
} from '../history-graphql';

const LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'bg-red-900/50 text-red-300 border-red-700',
  WARN: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  INFO: 'bg-green-900/50 text-green-300 border-green-700',
  DEBUG: 'bg-gray-800 text-gray-400 border-gray-600',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HistoryPage() {
  // 필터 상태
  const [app, setApp] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [level, setLevel] = useState('');
  const [keyword, setKeyword] = useState('');
  const [node, setNode] = useState('');

  // 페이지네이션
  const [afterCursor, setAfterCursor] = useState<string | null>(null);

  // 앱 목록 조회
  const { data: appsData } = useQuery<{ logApps: LogApp[] }>(LOG_APPS_QUERY);

  // 로그 검색 (수동 실행)
  const [executeSearch, { data: searchData, loading }] = useLazyQuery<{
    logSearch: LogSearchResult;
  }>(LOG_SEARCH_QUERY, { fetchPolicy: 'network-only' });

  const result = searchData?.logSearch;

  // 노드 목록 (앱 목록에서 추출)
  const nodes = Array.from(
    new Set((appsData?.logApps ?? []).map((a) => a.node)),
  );

  // 앱 목록 (중복 제거)
  const apps = Array.from(
    new Set((appsData?.logApps ?? []).map((a) => a.name)),
  ).sort();

  const handleSearch = (cursor?: string) => {
    if (!app) return;
    executeSearch({
      variables: {
        input: {
          app,
          from,
          to,
          level: level || undefined,
          keyword: keyword || undefined,
          node: node || undefined,
          after: cursor || undefined,
          limit: 100,
        },
      },
    });
    setAfterCursor(cursor ?? null);
  };

  const handleNextPage = () => {
    if (!result?.lines.length) return;
    const lastLine = result.lines[result.lines.length - 1];
    if (lastLine.timestamp) {
      handleSearch(lastLine.timestamp);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filter Bar */}
      <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-end gap-3">
        {/* App Select */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">App</label>
          <select
            value={app}
            onChange={(e) => setApp(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 min-w-[160px]"
          >
            <option value="">Select app...</option>
            {apps.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
          />
        </div>

        {/* Level Filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Level</label>
          <div className="flex gap-1">
            <button
              onClick={() => setLevel('')}
              className={cn(
                'px-2 py-1.5 rounded text-xs border transition-colors',
                !level
                  ? 'bg-gray-600 text-white border-gray-500'
                  : 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700',
              )}
            >
              ALL
            </button>
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(level === l ? '' : l)}
                className={cn(
                  'px-2 py-1.5 rounded text-xs border transition-colors',
                  level === l
                    ? LEVEL_COLORS[l]
                    : 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Keyword */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Keyword</label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search..."
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200 w-48"
          />
        </div>

        {/* Node Filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Node</label>
          <select
            value={node}
            onChange={(e) => setNode(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
          >
            <option value="">All nodes</option>
            {nodes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Search Button */}
        <button
          onClick={() => handleSearch()}
          disabled={!app || loading}
          className={cn(
            'px-4 py-1.5 rounded text-sm font-medium transition-colors',
            app && !loading
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed',
          )}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Summary Bar */}
      {result && (
        <div className="px-4 py-2 border-b border-gray-700 flex gap-4 text-xs">
          <span className="text-gray-400">
            {result.summary.fileCount} files
          </span>
          <span className="text-gray-400">
            {result.summary.totalLines.toLocaleString()} total lines
          </span>
          <span className="text-red-400">
            {result.summary.errorCount.toLocaleString()} errors
          </span>
          <span className="text-yellow-400">
            {result.summary.warnCount.toLocaleString()} warnings
          </span>
          <span className="text-green-400">
            {result.summary.infoCount.toLocaleString()} info
          </span>
          <span className="ml-auto text-gray-500">
            Showing {result.lines.length} lines
            {afterCursor && ' (paginated)'}
          </span>
        </div>
      )}

      {/* Log Table */}
      <div className="flex-1 overflow-y-auto">
        {!result && !loading && (
          <div className="flex items-center justify-center h-full text-gray-600">
            <p>Select an app and date range to search logs</p>
          </div>
        )}

        {result && result.lines.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-600">
            <p>No matching logs found</p>
          </div>
        )}

        {result && result.lines.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-3 py-2 text-left text-gray-400 font-medium w-44">
                  Timestamp
                </th>
                <th className="px-2 py-2 text-left text-gray-400 font-medium w-16">
                  Level
                </th>
                <th className="px-2 py-2 text-left text-gray-400 font-medium w-40">
                  Source
                </th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">
                  Message
                </th>
                <th className="px-2 py-2 text-left text-gray-400 font-medium w-28">
                  Node
                </th>
                <th className="px-2 py-2 text-left text-gray-400 font-medium w-36">
                  File
                </th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line, i) => (
                <LogRow key={`${line.file}:${line.lineNo}:${i}`} line={line} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {result?.hasMore && (
        <div className="px-4 py-2 border-t border-gray-700 flex justify-center">
          <button
            onClick={handleNextPage}
            disabled={loading}
            className="px-4 py-1.5 rounded text-sm bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

function LogRow({ line }: { line: HistoryLogLine }) {
  const levelColor = line.level ? LEVEL_COLORS[line.level] : '';

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/50">
      <td className="px-3 py-1 text-gray-400 font-mono whitespace-nowrap">
        {line.timestamp ?? '-'}
      </td>
      <td className="px-2 py-1">
        {line.level && (
          <span
            className={cn(
              'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border',
              levelColor,
            )}
          >
            {line.level}
          </span>
        )}
      </td>
      <td className="px-2 py-1 text-gray-500 font-mono truncate max-w-[160px]">
        {line.source ?? ''}
      </td>
      <td className="px-3 py-1 text-gray-200 font-mono break-all">
        {line.message}
      </td>
      <td className="px-2 py-1 text-purple-400 text-[10px] whitespace-nowrap">
        {line.node}
      </td>
      <td className="px-2 py-1 text-gray-500 text-[10px] truncate max-w-[140px]">
        {line.file}
      </td>
    </tr>
  );
}
```

**Step 3: 빌드 확인**

Run: `cd apps/log-viewer && npx vite build`
Expected: 빌드 성공

**Step 4: Commit**

```bash
git add apps/log-viewer/src/history-graphql.ts \
       apps/log-viewer/src/pages/HistoryPage.tsx
git commit -m "feat(log-viewer): /history 페이지 (FilterBar + LogTable + SummaryBar)"
```

---

## Task 10: Docker Compose + E2E Verification

**Files:**
- Modify: `docker-compose.e2e-full.yml`
- Modify: `docker-compose.yml` (production)

**Step 1: E2E compose에 로그 볼륨 마운트 추가**

`docker-compose.e2e-full.yml`의 `log-streamer` 서비스에 추가:

```yaml
log-streamer:
  image: log-streamer:local
  user: root
  environment:
    - LOG_STREAMER_PORT=4003
    - DOCKER_API_VERSION=1.44
    - LOG_DIR=/opt/logs          # 추가
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - /opt/logs:/opt/logs:ro     # 추가
```

**Step 2: Production compose에도 추가**

`docker-compose.yml`의 `log-streamer` 서비스에 동일하게 추가:

```yaml
  environment:
    - LOG_DIR=/opt/logs
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - /opt/logs:/opt/logs:ro
```

**Step 3: Gateway 빌드 + Log-Streamer 빌드 확인**

```bash
pnpm run build:gateway
cd apps/log-streamer && go build ./... && cd ../..
```

Expected: 모든 빌드 성공

**Step 4: Commit**

```bash
git add docker-compose.e2e-full.yml docker-compose.yml
git commit -m "build: log-streamer에 로그 디렉토리 볼륨 마운트 추가"
```
