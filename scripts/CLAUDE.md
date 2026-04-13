# scripts — Repo Automation

## What this is
Shell scripts for local workflows (setup, dev, tests, packaging). Keep them concise and rooted at repo paths.

## Conventions
- Use bash with `set -euo pipefail`.
- Resolve repo root at runtime (`ROOT_DIR`) and `cd` into it.
- Print actionable errors to stderr and exit non-zero.

## Updates 2026-04-12
- Added production image build helper (`scripts/build-prod-images.sh`).

## Updates 2026-04-12
- Added production compose helper script (`scripts/prod-compose.sh`).

## Updates 2026-04-13
- Fixed build script array expansion under `set -u` to avoid unbound errors on empty args (`scripts/build-prod-images.sh`).

## Updates 2026-04-13
- Fixed `printf` usage in build script to avoid option parsing when printing leading dashes (`scripts/build-prod-images.sh`).

## Updates 2026-04-13
- Build script now loads `.env.prod` (or `ENV_FILE`) to inject NEXT_PUBLIC vars during web image build (`scripts/build-prod-images.sh`).

## Updates 2026-04-13
- Added `scripts/prod-migrate.sh` to run production migrations and seed the admin user.

## Updates 2026-04-13
- Extended `scripts/prod-migrate.sh` to seed sample data after admin seed.
