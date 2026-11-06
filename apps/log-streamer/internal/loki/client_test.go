package loki

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestStreamEntryUsesLowerCamelCaseRESTContract(t *testing.T) {
	encoded, err := json.Marshal(StreamEntry{
		Timestamp:   time.Unix(0, 100).UTC(),
		TimestampNS: "100",
		Line:        "log line",
		Labels:      map[string]string{"service": "gateway"},
	})
	if err != nil {
		t.Fatal(err)
	}

	var response map[string]any
	if err := json.Unmarshal(encoded, &response); err != nil {
		t.Fatal(err)
	}
	if response["timestamp"] == nil || response["timestampNs"] != "100" {
		t.Fatalf("missing REST contract fields: %s", encoded)
	}
	if _, found := response["Timestamp"]; found {
		t.Fatalf("unexpected Go field name in REST response: %s", encoded)
	}
}

func TestQueryRangeFlattensAndSortsStreams(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/loki/api/v1/query_range" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("direction"); got != "backward" {
			t.Fatalf("unexpected direction: %s", got)
		}
		_, _ = w.Write([]byte(`{"status":"success","data":{"result":[{"stream":{"service":"b"},"values":[["200","{\"message\":\"later\"}"]]},{"stream":{"service":"a"},"values":[["100","plain"],["300","{\"message\":\"latest\"}"]]}]}}`))
	}))
	defer server.Close()

	client, err := NewClient(server.URL, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := client.QueryRange(context.Background(), `{log_source="file"}`, time.Unix(0, 0), time.Now(), "backward", 200)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 || entries[0].TimestampNS != "300" || entries[2].TimestampNS != "100" {
		t.Fatalf("entries were not globally sorted: %#v", entries)
	}
	if entries[0].Fields["message"] != "latest" || entries[2].Fields != nil {
		t.Fatalf("JSON fields were not parsed correctly: %#v", entries)
	}
}
