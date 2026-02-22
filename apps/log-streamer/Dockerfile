# Build stage
FROM golang:1.19-alpine AS builder

WORKDIR /app

# Copy source code + vendor (no network required)
COPY . .

# Build with vendor mode
RUN CGO_ENABLED=0 GOOS=linux go build -mod=vendor -ldflags='-s -w' -o /log-streamer ./cmd/server

# Production stage
FROM alpine:3.19

# Install ca-certificates for HTTPS connections
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /log-streamer .

# Create non-root user
RUN adduser -D -g '' appuser
USER appuser

# Expose port
EXPOSE 4003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost:4003/health || exit 1

# Run the application
ENTRYPOINT ["./log-streamer"]
