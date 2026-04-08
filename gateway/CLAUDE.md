# gateway — Nginx Reverse Proxy

## What this is
Nginx-based gateway that fronts web + API services. It provides a single entry point and will host future edge concerns (rate limiting, auth headers, load balancing).

## Conventions
- Routing config lives in `gateway/nginx.conf.template`.
- Keep initial config minimal; add security headers and rate limiting later.

## Updates 2026-04-09
- Added initial Nginx routing config and compose service for the gateway (`gateway/nginx.conf.template`, `docker-compose.yml`).
- Fixed internal API key injection to use envsubst variable instead of a hardcoded value (`gateway/nginx.conf.template`).
