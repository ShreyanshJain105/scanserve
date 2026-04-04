#!/usr/bin/env bash
set -euo pipefail

# Run tests via compose profile.
# Requires Docker/Compose available on host.

PROJECT_NAME="scan2serve-tests"

docker compose --project-name "$PROJECT_NAME" down --remove-orphans
docker compose --project-name "$PROJECT_NAME" --profile tests up --build tests
