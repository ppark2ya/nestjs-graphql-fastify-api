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
