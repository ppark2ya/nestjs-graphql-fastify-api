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
	var data map[string]any
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
func firstStr(data map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := data[k]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
	}
	return ""
}
