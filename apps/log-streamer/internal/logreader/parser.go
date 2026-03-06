package logreader

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Log4j2 패턴: 2024-01-15 10:30:45.123 INFO  c.e.MyClass - User logged in
var log4j2Pattern = regexp.MustCompile(
	`^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}[.,]\d{3})\s+(\w+)\s+(\S+)\s+-\s+(.*)$`,
)

// Bracket Log4j2 패턴: [INFO ] 2024-01-15 10:30:45.123 [CID:abc] [TRACE:xyz] [admin] [c.e.s.MyService.doSomething:42] User logged in
var bracketLog4j2Pattern = regexp.MustCompile(
	`^\[(\w+)\s*\]\s+(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}[.,]\d{3})((?:\s+\[[^\]]*\])*)\s+\[([^\]]+)\]\s+(.*)$`,
)

// Bracket 감지 패턴: [LEVEL] 또는 [LEVEL ]
var bracketDetectPattern = regexp.MustCompile(`^\[(\w+)\s*\]`)

// Context bracket 파싱 패턴: [KEY:VALUE] 또는 [VALUE]
var contextBracketPattern = regexp.MustCompile(`\[([^\]]*)\]`)

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

// JSON 표준 키 (metadata에서 제외)
var jsonStandardKeys = map[string]bool{
	"timestamp": true, "@timestamp": true, "time": true,
	"level": true, "severity": true,
	"logger": true, "source": true, "name": true, "module": true,
	"msg": true, "message": true,
	"log.level": true, "log.logger": true,
	"ecs.version": true,
	"process.pid": true, "process.thread.name": true,
	"service.name": true,
}

// DetectParser - 첫 줄로 파서 자동 감지
func DetectParser(firstLine string) Parser {
	trimmed := strings.TrimSpace(firstLine)
	if strings.HasPrefix(trimmed, "{") {
		return &JSONParser{}
	}
	if bracketDetectPattern.MatchString(trimmed) {
		return &Log4j2Parser{}
	}
	if log4j2Pattern.MatchString(trimmed) {
		return &Log4j2Parser{}
	}
	return &RawParser{}
}

func (p *Log4j2Parser) Parse(line string) LogLine {
	// Bracket 패턴 먼저 시도
	if matches := bracketLog4j2Pattern.FindStringSubmatch(line); matches != nil {
		result := LogLine{
			Level:     strings.ToUpper(strings.TrimSpace(matches[1])),
			Timestamp: matches[2],
			Source:    matches[4],
			Message:   matches[5],
		}

		// Context brackets 파싱 → metadata
		if contextStr := strings.TrimSpace(matches[3]); contextStr != "" {
			result.Metadata = parseContextBrackets(contextStr)
		}

		return result
	}

	// 기존 Log4j2 패턴 시도
	if matches := log4j2Pattern.FindStringSubmatch(line); matches != nil {
		return LogLine{
			Timestamp: matches[1],
			Level:     strings.ToUpper(strings.TrimSpace(matches[2])),
			Source:    matches[3],
			Message:   matches[4],
		}
	}

	return LogLine{Message: line}
}

// parseContextBrackets - context bracket 문자열을 JSON metadata로 변환
// "[CID:abc] [TRACE:xyz] [admin]" → `{"cid":"abc","trace":"xyz","ctx0":"admin"}`
func parseContextBrackets(contextStr string) string {
	matches := contextBracketPattern.FindAllStringSubmatch(contextStr, -1)
	if len(matches) == 0 {
		return ""
	}

	meta := make(map[string]string)
	ctxIdx := 0

	for _, m := range matches {
		content := strings.TrimSpace(m[1])
		if content == "" {
			continue
		}

		if idx := strings.IndexByte(content, ':'); idx > 0 {
			key := strings.ToLower(content[:idx])
			value := content[idx+1:]
			meta[key] = value
		} else {
			key := fmt.Sprintf("ctx%d", ctxIdx)
			meta[key] = content
			ctxIdx++
		}
	}

	if len(meta) == 0 {
		return ""
	}

	b, err := json.Marshal(meta)
	if err != nil {
		return ""
	}
	return string(b)
}

func (p *JSONParser) Parse(line string) LogLine {
	var data map[string]any
	if err := json.Unmarshal([]byte(line), &data); err != nil {
		return LogLine{Message: line}
	}

	result := LogLine{
		Timestamp: firstStr(data, "@timestamp", "timestamp", "time"),
		Level:     strings.ToUpper(firstStr(data, "log.level", "level", "severity")),
		Source:    firstStr(data, "log.logger", "logger", "source", "name", "module"),
		Message:   firstStr(data, "message", "msg"),
	}

	// 표준 키 외 추가 필드를 metadata로 수집
	meta := make(map[string]any)
	for k, v := range data {
		if !jsonStandardKeys[k] {
			meta[k] = v
		}
	}
	if len(meta) > 0 {
		if b, err := json.Marshal(meta); err == nil {
			result.Metadata = string(b)
		}
	}

	return result
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
