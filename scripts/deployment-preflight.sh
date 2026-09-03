#!/usr/bin/env bash
# Validate deploy-time configuration without contacting the VPS or external APIs.
set -euo pipefail

required=(JWT_SECRET GEMINI_API_KEY WEATHER_API_KEY USE_MOCKS)
for name in "${required[@]}"; do
  value="${!name:-}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    printf 'Deployment preflight failed: %s must be set.\n' "$name" >&2
    exit 1
  fi
done

if [[ "$JWT_SECRET" == "dev_insecure_jwt_secret_change_me" || ${#JWT_SECRET} -lt 32 ]]; then
  printf 'Deployment preflight failed: JWT_SECRET must be unique and at least 32 characters.\n' >&2
  exit 1
fi

for name in GEMINI_API_KEY WEATHER_API_KEY; do
  value="${!name}"
  if [[ "$value" == "your_"*"_here" || "$value" == "replace-with-"* ]]; then
    printf 'Deployment preflight failed: %s contains a placeholder value.\n' "$name" >&2
    exit 1
  fi
done

if [[ "$USE_MOCKS" != "false" ]]; then
  printf 'Deployment preflight failed: USE_MOCKS must be false for a live deployment.\n' >&2
  exit 1
fi

# Render the Compose model only; this does not create, stop, or inspect containers.
docker compose config -q
printf 'Deployment preflight passed.\n'
