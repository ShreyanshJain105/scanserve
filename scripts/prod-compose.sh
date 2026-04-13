#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run production compose." >&2
  exit 1
fi

ENV_FILE="$ROOT_DIR/.env.prod"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy .env.prod.example to .env.prod and fill required values." >&2
  exit 1
fi

echo "Starting production stack..."

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
