package loki

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL    *url.URL
	httpClient *http.Client
}

type UpstreamError struct {
	StatusCode int
}

func (e *UpstreamError) Error() string {
	return fmt.Sprintf("Loki request failed with status %d", e.StatusCode)
}

type StreamEntry struct {
	Timestamp   time.Time
	TimestampNS string
	Line        string
	Labels      map[string]string
	Fields      map[string]any
}

type queryRangeResponse struct {
	Status string `json:"status"`
	Data   struct {
		Result []struct {
			Stream map[string]string `json:"stream"`
			Values [][]string        `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

type valuesResponse struct {
	Status string   `json:"status"`
	Data   []string `json:"data"`
}

func NewClient(rawURL string, timeout time.Duration) (*Client, error) {
	baseURL, err := url.Parse(rawURL)
	if err != nil || baseURL.Scheme == "" || baseURL.Host == "" {
		return nil, fmt.Errorf("LOKI_GATEWAY_URL must be an absolute URL")
	}
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &Client{baseURL: baseURL, httpClient: &http.Client{Timeout: timeout}}, nil
}

func (c *Client) LabelValues(ctx context.Context, label, selector string, start, end time.Time) ([]string, error) {
	path := "/loki/api/v1/label/" + url.PathEscape(label) + "/values"
	query := url.Values{
		"start": []string{start.UTC().Format(time.RFC3339Nano)},
		"end":   []string{end.UTC().Format(time.RFC3339Nano)},
	}
	if selector != "" {
		query.Set("query", selector)
	}
	var response valuesResponse
	if err := c.get(ctx, path, query, &response); err != nil {
		return nil, err
	}
	sort.Strings(response.Data)
	return response.Data, nil
}

func (c *Client) QueryRange(ctx context.Context, query string, start, end time.Time, direction string, limit int) ([]StreamEntry, error) {
	params := url.Values{
		"query":     []string{query},
		"start":     []string{start.UTC().Format(time.RFC3339Nano)},
		"end":       []string{end.UTC().Format(time.RFC3339Nano)},
		"direction": []string{direction},
		"limit":     []string{strconv.Itoa(limit)},
	}
	var response queryRangeResponse
	if err := c.get(ctx, "/loki/api/v1/query_range", params, &response); err != nil {
		return nil, err
	}

	entries := make([]StreamEntry, 0)
	for _, stream := range response.Data.Result {
		for _, value := range stream.Values {
			if len(value) < 2 {
				continue
			}
			nanoseconds, err := strconv.ParseInt(value[0], 10, 64)
			if err != nil {
				continue
			}
			entry := StreamEntry{
				Timestamp:   time.Unix(0, nanoseconds).UTC(),
				TimestampNS: value[0],
				Line:        value[1],
				Labels:      stream.Stream,
			}
			var fields map[string]any
			if json.Unmarshal([]byte(value[1]), &fields) == nil {
				entry.Fields = fields
			}
			entries = append(entries, entry)
		}
	}

	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].TimestampNS == entries[j].TimestampNS {
			return fingerprint(entries[i]) < fingerprint(entries[j])
		}
		if direction == "forward" {
			return entries[i].TimestampNS < entries[j].TimestampNS
		}
		return entries[i].TimestampNS > entries[j].TimestampNS
	})
	return entries, nil
}

func (c *Client) get(ctx context.Context, path string, query url.Values, destination any) error {
	endpoint := c.baseURL.ResolveReference(&url.URL{Path: path})
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return &UpstreamError{StatusCode: response.StatusCode}
	}
	if err := json.NewDecoder(response.Body).Decode(destination); err != nil {
		return fmt.Errorf("invalid Loki response: %w", err)
	}
	return nil
}

func fingerprint(entry StreamEntry) string {
	labels, _ := json.Marshal(entry.Labels)
	return strings.Join([]string{entry.TimestampNS, string(labels), entry.Line}, "\x00")
}
