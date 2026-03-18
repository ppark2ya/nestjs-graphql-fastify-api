# ================================================================
# Log Streamer Dockerfile (pre-built)
# 빌드 컨텍스트: apps/log-streamer/
# 전제: Drone CI에서 Go 바이너리 빌드 완료
# 사용법: docker build -f apps/log-streamer/Dockerfile -t log-streamer:tag apps/log-streamer/
# ================================================================
FROM alpine:3.19

RUN apk --no-cache add ca-certificates

WORKDIR /app

# 빌드된 바이너리 복사
COPY log-streamer .

# non-root 사용자 생성
RUN adduser -D -g '' appuser
USER appuser

EXPOSE 4003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost:4003/health || exit 1

ENTRYPOINT ["./log-streamer"]
