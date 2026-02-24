#!/bin/bash

# Load test script for Gateway GraphQL API

API_URL="http://localhost:4000/graphql"
API_KEY="test-api-key"
ITERATIONS=20

echo "=== Gateway GraphQL Load Test ==="
echo "URL: $API_URL"
echo "Iterations: $ITERATIONS"
echo ""

# Test queries
declare -a QUERIES=(
  '{"query":"{ health }"}'
  '{"query":"{ hello }"}'
  '{"query":"{ echo(message: \"test\") }"}'
  '{"query":"{ add(input: {a: 10, b: 20}) }"}'
  '{"query":"{ containers { id name status state } }"}'
)

# Stats
success=0
fail=0
total_time=0

for i in $(seq 1 $ITERATIONS); do
  # Pick random query
  query_idx=$((RANDOM % ${#QUERIES[@]}))
  query="${QUERIES[$query_idx]}"

  start_time=$(date +%s%N)

  response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d "$query" 2>&1)

  end_time=$(date +%s%N)
  elapsed=$(( (end_time - start_time) / 1000000 ))  # ms
  total_time=$((total_time + elapsed))

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if echo "$body" | grep -q '"data"'; then
    ((success++))
    status="✓"
  else
    ((fail++))
    status="✗"
  fi

  echo "[$i/$ITERATIONS] $status ${elapsed}ms - $(echo "$query" | jq -r '.query' | head -c 40)..."
done

echo ""
echo "=== Results ==="
echo "Success: $success / $ITERATIONS"
echo "Failed: $fail / $ITERATIONS"
echo "Average response time: $((total_time / ITERATIONS))ms"
echo "Total time: ${total_time}ms"
