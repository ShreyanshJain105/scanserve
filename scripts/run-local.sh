#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_ENV="$ROOT_DIR/apps/api/.env.local"
WEB_ENV="$ROOT_DIR/apps/web/.env.local"

if [ ! -f "$API_ENV" ]; then
  echo "Missing $API_ENV. Run scripts/setup-local.sh first." >&2
  exit 1
fi

if [ ! -f "$WEB_ENV" ]; then
  echo "Missing $WEB_ENV. Run scripts/setup-local.sh first." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install it first." >&2
  exit 1
fi

echo "Starting services locally..."

echo "Reminder: ensure Postgres, Redis, ClickHouse, and MinIO are running locally."

echo "Starting API + Web..."
pnpm dev
