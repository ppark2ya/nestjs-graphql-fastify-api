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
