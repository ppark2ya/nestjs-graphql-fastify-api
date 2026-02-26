package logreader

// LogApp - 앱 디렉토리 정보
type LogApp struct {
	Name string `json:"name"`
}

// LogFile - 로그 파일 메타데이터
type LogFile struct {
	Name       string `json:"name"`       // 상대 경로 포함 (예: "archive/app-2026-02-22.log.gz")
	Date       string `json:"date"`       // YYYY-MM-DD (파일명에서 추출)
	Size       int64  `json:"size"`
	Compressed bool   `json:"compressed"` // .gz 여부
	fullPath   string // 실제 파일 경로 (unexported → JSON 미포함)
}

// LogLine - 파싱된 로그 라인
type LogLine struct {
	Timestamp string `json:"timestamp,omitempty"`
	Level     string `json:"level,omitempty"`
	Source    string `json:"source,omitempty"`
	Message   string `json:"message"`
	Metadata  string `json:"metadata,omitempty"`
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
