package logreader

import (
	"encoding/json"
	"testing"
)

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
	if result.Metadata != "" {
		t.Errorf("metadata should be empty, got %q", result.Metadata)
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

func TestBracketLog4j2ParserFull(t *testing.T) {
	p := &Log4j2Parser{}
	line := "[INFO ] 2024-01-15 10:30:45.123 [CID:abc123] [TRACE:xyz789] [admin] [c.e.s.MyService.doSomething:42] User logged in"
	result := p.Parse(line)

	if result.Level != "INFO" {
		t.Errorf("level = %q, want %q", result.Level, "INFO")
	}
	if result.Timestamp != "2024-01-15 10:30:45.123" {
		t.Errorf("timestamp = %q, want %q", result.Timestamp, "2024-01-15 10:30:45.123")
	}
	if result.Source != "c.e.s.MyService.doSomething:42" {
		t.Errorf("source = %q, want %q", result.Source, "c.e.s.MyService.doSomething:42")
	}
	if result.Message != "User logged in" {
		t.Errorf("message = %q, want %q", result.Message, "User logged in")
	}

	// metadata 검증
	if result.Metadata == "" {
		t.Fatal("metadata should not be empty")
	}
	var meta map[string]string
	if err := json.Unmarshal([]byte(result.Metadata), &meta); err != nil {
		t.Fatalf("metadata JSON parse error: %v", err)
	}
	if meta["cid"] != "abc123" {
		t.Errorf("metadata cid = %q, want %q", meta["cid"], "abc123")
	}
	if meta["trace"] != "xyz789" {
		t.Errorf("metadata trace = %q, want %q", meta["trace"], "xyz789")
	}
	if meta["ctx0"] != "admin" {
		t.Errorf("metadata ctx0 = %q, want %q", meta["ctx0"], "admin")
	}
}

func TestBracketLog4j2ParserNoContext(t *testing.T) {
	p := &Log4j2Parser{}
	line := "[ERROR] 2024-01-15 10:30:45.123 [c.e.s.OrderService.create:99] Order creation failed"
	result := p.Parse(line)

	if result.Level != "ERROR" {
		t.Errorf("level = %q, want %q", result.Level, "ERROR")
	}
	if result.Timestamp != "2024-01-15 10:30:45.123" {
		t.Errorf("timestamp = %q, want %q", result.Timestamp, "2024-01-15 10:30:45.123")
	}
	if result.Source != "c.e.s.OrderService.create:99" {
		t.Errorf("source = %q, want %q", result.Source, "c.e.s.OrderService.create:99")
	}
	if result.Message != "Order creation failed" {
		t.Errorf("message = %q, want %q", result.Message, "Order creation failed")
	}
	if result.Metadata != "" {
		t.Errorf("metadata should be empty, got %q", result.Metadata)
	}
}

func TestBracketLog4j2ParserPartialContext(t *testing.T) {
	p := &Log4j2Parser{}
	line := "[WARN ] 2024-01-15 10:30:45.123 [CID:req-001] [c.e.s.UserService.find:15] Slow query detected"
	result := p.Parse(line)

	if result.Level != "WARN" {
		t.Errorf("level = %q, want %q", result.Level, "WARN")
	}
	if result.Source != "c.e.s.UserService.find:15" {
		t.Errorf("source = %q, want %q", result.Source, "c.e.s.UserService.find:15")
	}
	if result.Message != "Slow query detected" {
		t.Errorf("message = %q, want %q", result.Message, "Slow query detected")
	}

	var meta map[string]string
	if err := json.Unmarshal([]byte(result.Metadata), &meta); err != nil {
		t.Fatalf("metadata JSON parse error: %v", err)
	}
	if meta["cid"] != "req-001" {
		t.Errorf("metadata cid = %q, want %q", meta["cid"], "req-001")
	}
	if len(meta) != 1 {
		t.Errorf("metadata should have 1 entry, got %d", len(meta))
	}
}

func TestBracketLog4j2ParserCommaMillis(t *testing.T) {
	p := &Log4j2Parser{}
	line := "[DEBUG] 2024-01-15 10:30:45,123 [c.e.s.Debug:1] test"
	result := p.Parse(line)

	if result.Level != "DEBUG" {
		t.Errorf("level = %q, want %q", result.Level, "DEBUG")
	}
	if result.Timestamp != "2024-01-15 10:30:45,123" {
		t.Errorf("timestamp = %q, want %q", result.Timestamp, "2024-01-15 10:30:45,123")
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

func TestJSONParserMetadata(t *testing.T) {
	p := &JSONParser{}
	line := `{"timestamp":"2024-01-15T10:30:45","level":"info","message":"request completed","correlationId":"abc-123","method":"GET","statusCode":200,"duration":42}`
	result := p.Parse(line)

	if result.Timestamp != "2024-01-15T10:30:45" {
		t.Errorf("timestamp = %q", result.Timestamp)
	}
	if result.Message != "request completed" {
		t.Errorf("message = %q", result.Message)
	}
	if result.Metadata == "" {
		t.Fatal("metadata should not be empty")
	}

	var meta map[string]any
	if err := json.Unmarshal([]byte(result.Metadata), &meta); err != nil {
		t.Fatalf("metadata JSON parse error: %v", err)
	}
	if meta["correlationId"] != "abc-123" {
		t.Errorf("metadata correlationId = %v, want %q", meta["correlationId"], "abc-123")
	}
	if meta["method"] != "GET" {
		t.Errorf("metadata method = %v, want %q", meta["method"], "GET")
	}
	// statusCode, duration이 있어야 함
	if _, ok := meta["statusCode"]; !ok {
		t.Error("metadata should contain statusCode")
	}
	if _, ok := meta["duration"]; !ok {
		t.Error("metadata should contain duration")
	}
	// 표준 키는 metadata에 없어야 함
	if _, ok := meta["timestamp"]; ok {
		t.Error("metadata should not contain timestamp")
	}
	if _, ok := meta["level"]; ok {
		t.Error("metadata should not contain level")
	}
	if _, ok := meta["message"]; ok {
		t.Error("metadata should not contain message")
	}
}

func TestJSONParserNoMetadata(t *testing.T) {
	p := &JSONParser{}
	line := `{"timestamp":"2024-01-15T10:30:45","level":"info","message":"simple log"}`
	result := p.Parse(line)

	if result.Metadata != "" {
		t.Errorf("metadata should be empty for standard-only fields, got %q", result.Metadata)
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

// --- Spring 실제 로그 형식 테스트 ---

func TestBracketLog4j2SpringDBLog(t *testing.T) {
	// Spring DB 커넥션 로그: context brackets 뒤에 bracket 없는 텍스트 + 메시지 내 [commit], [DB:RET] 등 내장 bracket
	p := &Log4j2Parser{}
	line := "[INFO ] 2026-02-26 15:21:17.938 [CID:f1cefe12-4755-42b2-9fff-5885d1af9aa1] [TRACE:81474387860151257] [jt****k] [10.0.1.5:8080] conn-540 [commit] | 0 ms | [DB:RET] TransDetailRepositoryCustom.findForeignWonTransSummary took=62ms kind=COLLECTION count=0"
	result := p.Parse(line)

	if result.Level != "INFO" {
		t.Errorf("level = %q, want %q", result.Level, "INFO")
	}
	if result.Timestamp != "2026-02-26 15:21:17.938" {
		t.Errorf("timestamp = %q, want %q", result.Timestamp, "2026-02-26 15:21:17.938")
	}
	if result.Source != "10.0.1.5:8080" {
		t.Errorf("source = %q, want %q", result.Source, "10.0.1.5:8080")
	}
	if result.Message != "conn-540 [commit] | 0 ms | [DB:RET] TransDetailRepositoryCustom.findForeignWonTransSummary took=62ms kind=COLLECTION count=0" {
		t.Errorf("message = %q", result.Message)
	}

	var meta map[string]string
	if err := json.Unmarshal([]byte(result.Metadata), &meta); err != nil {
		t.Fatalf("metadata JSON parse error: %v", err)
	}
	if meta["cid"] != "f1cefe12-4755-42b2-9fff-5885d1af9aa1" {
		t.Errorf("metadata cid = %q", meta["cid"])
	}
	if meta["trace"] != "81474387860151257" {
		t.Errorf("metadata trace = %q", meta["trace"])
	}
	if meta["ctx0"] != "jt****k" {
		t.Errorf("metadata ctx0 = %q", meta["ctx0"])
	}
}

func TestBracketLog4j2SpringResponseLog(t *testing.T) {
	// Spring HTTP 응답 로그: 메시지 내 [GET /api/...] 패턴
	p := &Log4j2Parser{}
	line := `[INFO ] 2026-02-26 15:21:17.940 [CID:f1cefe12-4755-42b2-9fff-5885d1af9aa1] [TRACE:81474387860151257] [jt****k] [k.c.d.m.b.c.i.LoggingInterceptor] RESPONSE [GET /api/currency-exchange/foreign-won/list]`
	result := p.Parse(line)

	if result.Level != "INFO" {
		t.Errorf("level = %q, want %q", result.Level, "INFO")
	}
	if result.Source != "k.c.d.m.b.c.i.LoggingInterceptor" {
		t.Errorf("source = %q, want %q", result.Source, "k.c.d.m.b.c.i.LoggingInterceptor")
	}
	if result.Message != "RESPONSE [GET /api/currency-exchange/foreign-won/list]" {
		t.Errorf("message = %q", result.Message)
	}
}

func TestBracketLog4j2SpringStatementLog(t *testing.T) {
	// Spring DB statement 로그: [statement] 패턴 + 소스 클래스
	p := &Log4j2Parser{}
	line := "[INFO ] 2026-02-26 15:21:17.976 [CID:7137a48a-3dea-45db-a645-704b2bf8c96] [TRACE:81474387864764860] [jt****k] [10.0.1.5:3306] conn-542 [statement] | 87 ms | kr.co.dozn.mx.backoffice.common.utils.LogCallSite.firstOutside(LogCallSite.kt:21)"
	result := p.Parse(line)

	if result.Level != "INFO" {
		t.Errorf("level = %q, want %q", result.Level, "INFO")
	}
	if result.Timestamp != "2026-02-26 15:21:17.976" {
		t.Errorf("timestamp = %q", result.Timestamp)
	}
	if result.Source != "10.0.1.5:3306" {
		t.Errorf("source = %q", result.Source)
	}
	expectedMsg := "conn-542 [statement] | 87 ms | kr.co.dozn.mx.backoffice.common.utils.LogCallSite.firstOutside(LogCallSite.kt:21)"
	if result.Message != expectedMsg {
		t.Errorf("message = %q, want %q", result.Message, expectedMsg)
	}
}

func TestBracketLog4j2ContinuationLineAsRaw(t *testing.T) {
	// SQL continuation line (구조화 패턴 없음) → raw fallback
	p := &Log4j2Parser{}
	line := "        select count(t1_0.id)"
	result := p.Parse(line)

	if result.Timestamp != "" {
		t.Errorf("continuation line should have empty timestamp, got %q", result.Timestamp)
	}
	if result.Level != "" {
		t.Errorf("continuation line should have empty level, got %q", result.Level)
	}
	if result.Message != "        select count(t1_0.id)" {
		t.Errorf("message = %q", result.Message)
	}
}

func TestDetectParser(t *testing.T) {
	tests := []struct {
		line string
		want string
	}{
		{`{"level":"info","msg":"test"}`, "JSONParser"},
		{"2024-01-15 10:30:45.123 INFO c.e.Test - msg", "Log4j2Parser"},
		{"[INFO ] 2024-01-15 10:30:45.123 [c.e.Test] msg", "Log4j2Parser"},
		{"[ERROR] 2024-01-15 10:30:45.123 [c.e.Test] msg", "Log4j2Parser"},
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
