package logreader

import (
	"bufio"
	"compress/gzip"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// 파일명에서 날짜 추출 정규식: app.2024-01-15.log 또는 2024-01-15.log
var dateInFilename = regexp.MustCompile(`(\d{4}-\d{2}-\d{2})`)

// 로테이션 번호 추출 정규식
var rotationNumPattern = regexp.MustCompile(`\.(\d+)(?:\.log|\.gz)$|\.log\.(\d+)(?:\.gz)?$`)

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
		slog.Error("failed to read log base directory", "baseDir", r.baseDir, "error", err)
		return nil, err
	}

	var apps []LogApp
	for _, e := range entries {
		if e.IsDir() {
			apps = append(apps, LogApp{Name: e.Name()})
		}
	}
	slog.Debug("list apps", "baseDir", r.baseDir, "count", len(apps))
	return apps, nil
}

// ListFiles - 특정 앱의 로그 파일 목록 (날짜 범위 필터)
// 앱 루트 + archive/ 두 디렉토리 모두 스캔
func (r *Reader) ListFiles(app, from, to string) ([]LogFile, error) {
	appDir := filepath.Join(r.baseDir, app)

	var files []LogFile
	// 1) 앱 루트 디렉토리 스캔 (활성 로그)
	files = append(files, r.scanDir(appDir, "", from, to)...)
	// 2) archive 서브디렉토리 스캔 (로테이션 파일)
	files = append(files, r.scanDir(filepath.Join(appDir, "archive"), "archive", from, to)...)

	// 정렬: 날짜 오름차순 → 로테이션 번호 오름차순
	sort.SliceStable(files, func(i, j int) bool {
		if files[i].Date != files[j].Date {
			return files[i].Date < files[j].Date
		}
		return extractRotationNum(files[i].Name) < extractRotationNum(files[j].Name)
	})

	return files, nil
}

// scanDir - 디렉토리 내 로그 파일 스캔
func (r *Reader) scanDir(dir, prefix, from, to string) []LogFile {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	var files []LogFile
	for _, e := range entries {
		if e.IsDir() {
			continue
		}

		if !isLogFile(e.Name()) {
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

		name := e.Name()
		if prefix != "" {
			name = prefix + "/" + e.Name()
		}

		files = append(files, LogFile{
			Name:       name,
			Date:       date,
			Size:       info.Size(),
			Compressed: strings.HasSuffix(e.Name(), ".gz"),
		})
	}

	return files
}

// isLogFile - 로그 파일 여부 판별 (날짜 패턴 + .log 포함)
// 매칭 패턴:
//   - app-2026-02-22.log (활성)
//   - app-2026-02-22.log.1 (winston 사이즈 로테이션)
//   - app-2026-02-22.log.gz (winston 압축)
//   - app-2026-02-22.log.1.gz (winston 사이즈 + 압축)
//   - app-2026-02-22.1.log (log4j2 사이즈 로테이션)
func isLogFile(name string) bool {
	return dateInFilename.MatchString(name) && strings.Contains(name, ".log")
}

// extractDate - 파일명에서 날짜 추출
func extractDate(filename string) string {
	matches := dateInFilename.FindStringSubmatch(filename)
	if len(matches) < 2 {
		return ""
	}
	return matches[1]
}

// extractRotationNum - 파일명에서 로테이션 번호 추출
// .log.1 / .log.2.gz (winston 스타일)
// .1.log / .2.log (log4j2 스타일)
// 번호 없으면 0 반환
func extractRotationNum(filename string) int {
	// basename만 사용 (archive/ 접두사 제거)
	base := filepath.Base(filename)
	matches := rotationNumPattern.FindStringSubmatch(base)
	if matches == nil {
		return 0
	}
	// 첫 번째 캡처 그룹: log4j2 스타일 (.1.log)
	if matches[1] != "" {
		n, _ := strconv.Atoi(matches[1])
		return n
	}
	// 두 번째 캡처 그룹: winston 스타일 (.log.1)
	if matches[2] != "" {
		n, _ := strconv.Atoi(matches[2])
		return n
	}
	return 0
}

// gzipReadCloser - gzip 파일 리더 (Reader + Closer)
type gzipReadCloser struct {
	gz   *gzip.Reader
	file *os.File
}

func (g *gzipReadCloser) Read(p []byte) (int, error) { return g.gz.Read(p) }
func (g *gzipReadCloser) Close() error {
	g.gz.Close()
	return g.file.Close()
}

// openFile - 파일 열기 (.gz 파일은 gzip 디코딩)
func (r *Reader) openFile(path string) (io.ReadCloser, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	if strings.HasSuffix(path, ".gz") {
		gz, err := gzip.NewReader(file)
		if err != nil {
			file.Close()
			return nil, err
		}
		return &gzipReadCloser{gz: gz, file: file}, nil
	}
	return file, nil
}

// Search - 로그 파일 검색 (서버사이드 필터링 + 페이지네이션)
func (r *Reader) Search(params SearchParams, nodeName string) (*SearchResult, error) {
	if params.Limit <= 0 {
		params.Limit = 100
	}

	files, err := r.ListFiles(params.App, params.From, params.To)
	if err != nil {
		slog.Error("search: list files failed", "app", params.App, "error", err)
		return nil, err
	}

	slog.Debug("search: files discovered",
		"app", params.App,
		"from", params.From,
		"to", params.To,
		"fileCount", len(files),
	)

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
			slog.Warn("search: file read error", "file", f.Name, "error", err)
			continue
		}

		slog.Debug("search: file scanned",
			"file", f.Name,
			"matchedLines", len(lines),
			"hasMore", hasMore,
		)

		result.Lines = append(result.Lines, lines...)
		if hasMore {
			result.HasMore = true
		}
	}

	return result, nil
}

// searchFile - 단일 파일 검색 (multi-line 로그 그룹핑 지원)
func (r *Reader) searchFile(params SearchParams, f LogFile, limit int) ([]LogLine, bool, error) {
	path := filepath.Join(r.baseDir, params.App, f.Name)
	reader, err := r.openFile(path)
	if err != nil {
		return nil, false, err
	}
	defer reader.Close()

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var lines []LogLine
	var parser Parser
	var current *LogLine // 진행 중인 multi-line 엔트리
	lineNo := 0

	// flush - 진행 중인 엔트리를 필터 적용 후 결과에 추가
	flush := func() {
		if current == nil {
			return
		}
		if matchFilters(*current, params) {
			lines = append(lines, *current)
		}
		current = nil
	}

	for scanner.Scan() {
		lineNo++
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}

		if parser == nil {
			parser = DetectParser(line)
		}

		parsed := parser.Parse(line)
		parsed.File = f.Name
		parsed.LineNo = lineNo

		if parsed.Timestamp != "" {
			// 새로운 구조화된 로그 엔트리 → 이전 엔트리 flush
			flush()
			if len(lines) >= limit {
				return lines, true, nil
			}
			entry := parsed
			current = &entry
		} else if current != nil {
			// Continuation line → 현재 엔트리의 Message에 병합
			current.Message += "\n" + parsed.Message
		} else {
			// 독립 raw line (앞선 구조화 엔트리 없음)
			if matchFilters(parsed, params) {
				lines = append(lines, parsed)
				if len(lines) >= limit {
					return lines, scanner.Scan(), nil
				}
			}
		}
	}

	// 파일 끝: 남은 엔트리 flush
	flush()
	if len(lines) >= limit {
		return lines[:limit], true, scanner.Err()
	}

	return lines, false, scanner.Err()
}

// Stats - 로그 통계 (파일별 레벨 카운트)
func (r *Reader) Stats(app, from, to, nodeName string) (*LogStats, error) {
	files, err := r.ListFiles(app, from, to)
	if err != nil {
		slog.Error("stats: list files failed", "app", app, "error", err)
		return nil, err
	}

	stats := &LogStats{
		Node:      nodeName,
		FileCount: len(files),
	}

	for _, f := range files {
		if err := r.countFile(filepath.Join(r.baseDir, app, f.Name), stats); err != nil {
			slog.Warn("stats: file count error", "file", f.Name, "error", err)
			continue
		}
	}

	return stats, nil
}

// countFile - 단일 파일 라인/레벨 카운트 (multi-line 그룹핑 지원)
func (r *Reader) countFile(path string, stats *LogStats) error {
	reader, err := r.openFile(path)
	if err != nil {
		return err
	}
	defer reader.Close()

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var parser Parser
	var currentLevel string // 진행 중인 multi-line 엔트리의 레벨
	inEntry := false       // 현재 multi-line 엔트리 진행 중 여부

	// flushCount - 진행 중인 엔트리를 통계에 반영
	flushCount := func() {
		if !inEntry {
			return
		}
		stats.TotalLines++
		switch strings.ToUpper(currentLevel) {
		case "ERROR":
			stats.ErrorCount++
		case "WARN", "WARNING":
			stats.WarnCount++
		case "INFO":
			stats.InfoCount++
		case "DEBUG":
			stats.DebugCount++
		}
		inEntry = false
		currentLevel = ""
	}

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		if parser == nil {
			parser = DetectParser(line)
		}

		parsed := parser.Parse(line)

		if parsed.Timestamp != "" {
			// 새로운 구조화된 엔트리 → 이전 엔트리 카운트
			flushCount()
			currentLevel = parsed.Level
			inEntry = true
		} else if !inEntry {
			// 독립 raw line
			stats.TotalLines++
		}
		// continuation line (inEntry && Timestamp=="")은 무시 (부모 엔트리에 포함)
	}

	// 파일 끝: 남은 엔트리 카운트
	flushCount()

	return scanner.Err()
}

// matchFilters - 레벨/키워드/타임스탬프 커서 필터
func matchFilters(line LogLine, params SearchParams) bool {
	if params.Level != "" && !strings.EqualFold(line.Level, params.Level) {
		return false
	}

	if params.Keyword != "" {
		kw := strings.ToLower(params.Keyword)
		if !strings.Contains(strings.ToLower(line.Message), kw) &&
			!strings.Contains(strings.ToLower(line.Source), kw) &&
			!strings.Contains(strings.ToLower(line.Metadata), kw) {
			return false
		}
	}

	if params.After != "" && line.Timestamp != "" && line.Timestamp <= params.After {
		return false
	}

	return true
}
