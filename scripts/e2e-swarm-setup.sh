#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STACK_NAME="e2e"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.e2e-full.yml"

echo "=== [1/4] Building application images ==="
docker build -f "$PROJECT_DIR/apps/gateway/Dockerfile" -t gateway:local "$PROJECT_DIR"
docker build -f "$PROJECT_DIR/apps/log-streamer/Dockerfile" -t log-streamer:local "$PROJECT_DIR/apps/log-streamer"
docker build -t apache-proxy:local -f "$PROJECT_DIR/docker/apache/Dockerfile" "$PROJECT_DIR/docker/apache"

echo "=== [2/4] Initializing Docker Swarm ==="
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
  docker swarm init || true
fi

echo "=== [3/4] Deploying stack ==="
docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME" --resolve-image=never

echo ""
echo "Waiting for services to be ready..."
sleep 10

# 헬스체크 대기
READY=false
for i in $(seq 1 30); do
  if curl -sf http://localhost:80 > /dev/null 2>&1; then
    echo "Apache is ready!"
    READY=true
    break
  fi
  echo "Waiting for Apache... ($i/30)"
  sleep 2
done

if [ "$READY" = false ]; then
  echo "ERROR: Apache did not become ready within 60 seconds"
  echo "Checking service status..."
  docker stack services "$STACK_NAME"
  docker stack ps "$STACK_NAME" --no-trunc 2>/dev/null || true
  exit 1
fi

echo ""
echo "=== [4/4] Verifying deployment ==="
echo "  Apache:  http://localhost:80"
docker node ls
docker stack services "$STACK_NAME"
