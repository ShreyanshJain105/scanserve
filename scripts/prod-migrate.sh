#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run production migrations." >&2
  exit 1
fi

ENV_FILE="$ROOT_DIR/.env.prod"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy .env.prod.example to .env.prod and fill required values." >&2
  exit 1
fi

echo "Running production migrations..."

docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  pnpm --filter @scan2serve/api db:migrate:deploy

echo "Seeding admin user..."

docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  pnpm --filter @scan2serve/api db:seed

echo "Seeding sample data..."

docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  pnpm --filter @scan2serve/api db:seed:sample

echo "Done."
