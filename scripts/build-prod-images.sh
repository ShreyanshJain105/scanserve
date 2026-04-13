#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to build images." >&2
  exit 1
fi

ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.prod}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

TAG="${TAG:-latest}"
REGISTRY="${REGISTRY:-}"
PLATFORM="${PLATFORM:-}"

if [ -n "$REGISTRY" ] && [[ "$REGISTRY" != */ ]]; then
  REGISTRY="${REGISTRY}/"
fi

PLATFORM_ARG=()
if [ -n "$PLATFORM" ]; then
  PLATFORM_ARG=(--platform "$PLATFORM")
fi

WEB_BUILD_ARGS=()
if [ -n "${NEXT_PUBLIC_API_URL:-}" ]; then
  WEB_BUILD_ARGS+=(--build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}")
fi

echo "Building production images (tag: $TAG)..."

docker build ${PLATFORM_ARG[@]+"${PLATFORM_ARG[@]}"} \
  -f apps/api/Dockerfile \
  -t "${REGISTRY}scan2serve-api:${TAG}" \
  .

docker build ${PLATFORM_ARG[@]+"${PLATFORM_ARG[@]}"} ${WEB_BUILD_ARGS[@]+"${WEB_BUILD_ARGS[@]}"} \
  -f apps/web/Dockerfile \
  -t "${REGISTRY}scan2serve-web:${TAG}" \
  .

docker build ${PLATFORM_ARG[@]+"${PLATFORM_ARG[@]}"} \
  -f gateway/Dockerfile \
  -t "${REGISTRY}scan2serve-gateway:${TAG}" \
  .

echo "Built images:"
printf '%s\n' "- ${REGISTRY}scan2serve-api:${TAG}"
printf '%s\n' "- ${REGISTRY}scan2serve-web:${TAG}"
printf '%s\n' "- ${REGISTRY}scan2serve-gateway:${TAG}"
