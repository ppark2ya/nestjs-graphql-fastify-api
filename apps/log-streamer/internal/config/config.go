package config

import (
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port           int
	LogLevel       string
	LogDir         string
	LokiGatewayURL string
	LokiTimeout    time.Duration
}

func Load() *Config {
	// Load .env file if exists (ignore error if not found)
	_ = godotenv.Load()

	port := 4003
	if p := os.Getenv("LOG_STREAMER_PORT"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil {
			port = parsed
		}
	}

	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "info"
	}

	logDir := os.Getenv("LOG_DIR")
	if logDir == "" {
		logDir = "/opt/logs"
	}

	lokiTimeout := 30 * time.Second
	if raw := os.Getenv("LOKI_TIMEOUT_SECONDS"); raw != "" {
		if seconds, err := strconv.Atoi(raw); err == nil && seconds > 0 {
			lokiTimeout = time.Duration(seconds) * time.Second
		}
	}

	return &Config{
		Port:           port,
		LogLevel:       logLevel,
		LogDir:         logDir,
		LokiGatewayURL: os.Getenv("LOKI_GATEWAY_URL"),
		LokiTimeout:    lokiTimeout,
	}
}
