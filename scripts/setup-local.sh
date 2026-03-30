#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install it first (corepack enable && corepack prepare pnpm@latest --activate)." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 20+ before continuing." >&2
  exit 1
fi

API_ENV="$ROOT_DIR/apps/api/.env.local"
WEB_ENV="$ROOT_DIR/apps/web/.env.local"

if [ ! -f "$API_ENV" ]; then
  cp "$ROOT_DIR/apps/api/.env.example" "$API_ENV"
  echo "Created $API_ENV from .env.example. Update DATABASE_URL and secrets as needed."
fi

if [ ! -f "$WEB_ENV" ]; then
  cp "$ROOT_DIR/apps/web/.env.example" "$WEB_ENV"
  echo "Created $WEB_ENV from .env.example. Update NEXT_PUBLIC_API_URL as needed."
fi

set -a
source "$API_ENV"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set in $API_ENV. Update it before running migrations." >&2
  exit 1
fi

echo "Installing dependencies..."
CI=true PNPM_CONFIG_CONFIRM_MODULES_PURGE=false pnpm install --no-frozen-lockfile

echo "Generating Prisma client..."
pnpm --filter @scan2serve/api db:generate

echo "Running migrations..."
pnpm --filter @scan2serve/api db:migrate

if [ "${SEED_DB:-false}" = "true" ]; then
  echo "Seeding database..."
  pnpm --filter @scan2serve/api db:seed
fi

echo "Setup complete."
