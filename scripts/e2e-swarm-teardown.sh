#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="e2e"

echo "=== Tearing down E2E environment ==="

echo "[1/3] Removing stack..."
docker stack rm "$STACK_NAME" 2>/dev/null || true
# Swarm이 태스크 드레인 완료를 기다림
sleep 5

echo "[2/3] Leaving Swarm..."
docker swarm leave --force 2>/dev/null || true

echo "[3/3] Pruning networks..."
docker network prune -f 2>/dev/null || true

echo "=== Teardown complete ==="
