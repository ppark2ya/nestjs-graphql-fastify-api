package loki

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

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
