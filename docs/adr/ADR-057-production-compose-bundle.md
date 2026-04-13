# ADR-057: Production Compose Bundle

**Date:** 2026-04-12
**Status:** Accepted

## Context
We need a production-ready compose file that uses the built images (API, web, gateway) instead of bind mounts and dev commands. It should load environment variables from a dedicated `.env.prod` file and avoid dev-only services.

## Decision
Create a production compose bundle (`docker-compose.prod.yml`) that:
- Runs API, web, and gateway from built images.
- Uses `.env.prod` for API and web environment variables.
- Exposes only the gateway port to the host.
- Keeps stateful services (Postgres, Redis, ClickHouse, MinIO) containerized for a single-host deployment.
- Skips dev/test-only services and volumes for node_modules.

## Consequences
- **Pros:** clean production footprint, no source mounts, aligns with prod images and `.env.prod`.
- **Cons:** requires `.env.prod` to be kept in sync with production secrets; external managed DBs would require edits.
- **Neutral:** monitoring stack (Prometheus/Grafana) is optional and can be kept or removed later.

## Alternatives Considered
- Use only a Kubernetes or managed services setup: rejected for now to keep deployment simple.
- Keep a single compose for dev + prod with flags: rejected to avoid accidental dev settings in production.
