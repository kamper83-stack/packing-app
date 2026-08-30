#!/usr/bin/env bash
# Issue #31: boot the production backend image and smoke-test /health plus a mock trip.
set -euo pipefail

IMAGE="${IMAGE:-packing-backend:ci}"
BASE="http://127.0.0.1:5001"

docker run -d --name packing-backend-ci -p 127.0.0.1:5001:5001 \
  -e PORT=5001 \
  -e JWT_SECRET=ci_test_secret \
  -e USE_MOCKS=true \
  "$IMAGE"
trap 'docker logs packing-backend-ci || true; docker rm -f packing-backend-ci || true' EXIT

ok=0
for i in $(seq 1 30); do
  if curl -sf "$BASE/health" > /dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  echo "Container health check failed"
  exit 1
fi
curl -fsS "$BASE/health"

REG=$(curl -fsS -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ci-smoke@example.com","password":"Password123!"}')
TOKEN=$(printf '%s' "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

TRIP=$(curl -fsS -X POST "$BASE/api/trips" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"destination":"Barcelona","startDate":"2026-09-10","endDate":"2026-09-12","airline":"EL AL","numPeople":2,"vacationType":"Beach"}')

printf '%s' "$TRIP" | python3 -c "
import json, sys
trip = json.load(sys.stdin)
assert trip.get('id'), trip
items = trip.get('PackingItems') or []
assert len(items) > 0, trip
assert trip.get('weatherSource') == 'mock', trip
assert trip.get('aiSource') == 'mock', trip
assert trip.get('weatherSource') != 'live'
assert trip.get('aiSource') != 'live'
print('Smoke test passed: mock weather + mock Gemini packing list.')
"
