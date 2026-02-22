package logreader

import (
	"bufio"
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

		if parser == nil {
			parser = DetectParser(line)
		}

		parsed := parser.Parse(line)
		parsed.File = f.Name
		parsed.LineNo = lineNo

		if !matchFilters(parsed, params) {
			continue
		}

		lines = append(lines, parsed)
		if len(lines) >= limit {
			return lines, scanner.Scan(), nil
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
	if params.Level != "" && !strings.EqualFold(line.Level, params.Level) {
		return false
	}

	if params.Keyword != "" {
		kw := strings.ToLower(params.Keyword)
		if !strings.Contains(strings.ToLower(line.Message), kw) &&
			!strings.Contains(strings.ToLower(line.Source), kw) {
			return false
		}
	}

	if params.After != "" && line.Timestamp != "" && line.Timestamp <= params.After {
		return false
	}

	return true
}
