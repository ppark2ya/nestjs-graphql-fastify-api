#!/usr/bin/env bash
set -euo pipefail

# Docker Swarm 통합 테스트 환경 구성 스크립트
# 사용법: bash scripts/swarm-test-up.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELAY_ROOT="$HOME/workspace/relay"
STACK_NAME="test-app"

echo "=== Docker Swarm 통합 테스트 환경 구성 ==="
echo "프로젝트 루트: $PROJECT_ROOT"
echo ""

# 1. Docker Swarm 초기화
echo "--- [1/5] Docker Swarm 초기화 ---"
if ! docker info 2>/dev/null | grep -q "Swarm: active"; then
  echo "Swarm 활성화 중..."
  docker swarm init || true
else
  echo "Swarm 이미 활성화됨"
fi
echo ""

# 2. 로그 디렉토리 생성 (Docker Desktop은 bind mount 시 자동 생성하므로 실패해도 무시)
echo "--- [2/5] 로그 디렉토리 생성 ---"
mkdir -p /opt/logs /var/log/app/gateway 2>/dev/null || echo "(권한 부족 - Docker Desktop에서는 자동 생성됨, 건너뜀)"
echo ""

# 3. Docker 이미지 빌드
echo "--- [3/5] Docker 이미지 빌드 ---"

echo "[3a] gateway 빌드..."
docker build -f "$PROJECT_ROOT/apps/gateway/Dockerfile" -t gateway:test "$PROJECT_ROOT"

echo "[3b] auth 빌드..."
docker build -f "$PROJECT_ROOT/apps/auth/Dockerfile" -t auth:test "$PROJECT_ROOT"

echo "[3c] log-streamer 빌드..."
docker build -f "$PROJECT_ROOT/apps/log-streamer/Dockerfile" -t log-streamer:test "$PROJECT_ROOT/apps/log-streamer"

echo "[3d] relay 빌드..."
# relay의 Dockerfile이 golang:1.23을 사용하지만 go.mod는 1.25를 요구하므로 버전 패치
sed 's/golang:1.23-alpine/golang:1.25-alpine/g' "$RELAY_ROOT/Dockerfile_alpine" \
  | docker build -t relay:test -f - "$RELAY_ROOT"

echo "이미지 빌드 완료"
echo ""

# 4. 기존 스택 제거 (존재하는 경우)
echo "--- [4/5] 기존 스택 정리 ---"
if docker stack ls 2>/dev/null | grep -q "$STACK_NAME"; then
  echo "기존 $STACK_NAME 스택 제거 중..."
  docker stack rm "$STACK_NAME"
  echo "서비스 정리 대기 (15초)..."
  sleep 15
fi
echo ""

# 5. Stack 배포
echo "--- [5/5] Stack 배포 ---"
docker stack deploy -c "$PROJECT_ROOT/docker-stack.test.yml" "$STACK_NAME"
echo ""

# 상태 확인
echo "=== 배포 완료 ==="
echo ""
echo "서비스 상태 확인 (수렴까지 약 30-60초 소요):"
echo "  docker stack services $STACK_NAME"
echo "  docker stack ps $STACK_NAME"
echo ""
echo "접속:"
echo "  Gateway:  http://localhost:4000"
echo "  GraphQL:  http://localhost:4000/graphql"
echo "  Relay:    http://localhost:8080"
echo ""
echo "로그 확인:"
echo "  docker service logs -f ${STACK_NAME}_gateway"
echo "  docker service logs -f ${STACK_NAME}_auth"
echo "  docker service logs -f ${STACK_NAME}_log-streamer"
echo "  docker service logs -f ${STACK_NAME}_relay"
echo ""
echo "테스트:"
echo "  bash scripts/load-test.sh"
echo "  node scripts/test-subscription.js test-redis"
echo ""
echo "종료: bash scripts/swarm-test-down.sh"
