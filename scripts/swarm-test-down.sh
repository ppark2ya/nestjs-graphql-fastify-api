#!/usr/bin/env bash
set -euo pipefail

# Docker Swarm 통합 테스트 환경 정리 스크립트
# 사용법: bash scripts/swarm-test-down.sh

STACK_NAME="test-app"

echo "=== Docker Swarm 테스트 환경 정리 ==="

# 1. Stack 제거
echo "--- [1/3] Stack 제거 ---"
if docker stack ls 2>/dev/null | grep -q "$STACK_NAME"; then
  docker stack rm "$STACK_NAME"
  echo "서비스 정리 대기 (15초)..."
  sleep 15
else
  echo "스택 없음, 건너뜀"
fi

# 2. 볼륨 정리
echo "--- [2/3] 볼륨 정리 ---"
for vol in ${STACK_NAME}_redis-data ${STACK_NAME}_mysql-data ${STACK_NAME}_relay-data; do
  if docker volume ls -q | grep -q "^${vol}$"; then
    docker volume rm "$vol" && echo "삭제: $vol" || echo "삭제 실패 (사용 중): $vol"
  fi
done

# 3. Swarm 비활성화 (선택)
echo ""
echo "--- [3/3] Swarm 비활성화 ---"
read -p "Docker Swarm을 비활성화할까요? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  docker swarm leave --force
  echo "Swarm 비활성화 완료"
else
  echo "Swarm 유지"
fi

echo ""
echo "=== 정리 완료 ==="
