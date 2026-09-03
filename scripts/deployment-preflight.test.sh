#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFLIGHT="$REPO_ROOT/scripts/deployment-preflight.sh"

run_preflight() {
  env -i \
    PATH="$PATH" \
    HOME="$HOME" \
    JWT_SECRET="student-ready-test-secret-with-32-characters" \
    GEMINI_API_KEY="test-gemini-key" \
    WEATHER_API_KEY="test-weather-key" \
    USE_MOCKS="false" \
    bash "$PREFLIGHT"
}

if ! run_preflight >/tmp/packing-preflight-valid.out 2>&1; then
  printf 'Expected valid deployment configuration to pass. Output:\n' >&2
  cat /tmp/packing-preflight-valid.out >&2
  exit 1
fi

if env -i PATH="$PATH" HOME="$HOME" JWT_SECRET="dev_insecure_jwt_secret_change_me" GEMINI_API_KEY="test-gemini-key" WEATHER_API_KEY="test-weather-key" USE_MOCKS="false" bash "$PREFLIGHT" >/tmp/packing-preflight-invalid.out 2>&1; then
  printf 'Expected an insecure JWT secret to be rejected.\n' >&2
  exit 1
fi

grep -q 'JWT_SECRET' /tmp/packing-preflight-invalid.out
printf 'Deployment preflight tests passed.\n'
