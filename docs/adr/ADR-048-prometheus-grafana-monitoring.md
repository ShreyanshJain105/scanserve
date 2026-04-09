# ADR-048: Prometheus Metrics + Grafana Monitoring

- **Date:** 2026-04-09
- **Status:** Accepted

## Context
We want first-class observability for API and gateway health. The project already uses Docker Compose for local/dev stacks and has an Nginx gateway in front of the API/web services. We also decided to drop private networking work for now, but keep monitoring (Grafana + Prometheus) as a future milestone. This ADR defines the monitoring stack and initial metrics scope.

## Decision (Proposed)
Introduce Prometheus for metrics collection and Grafana for dashboarding:

- Add **Prometheus** and **Grafana** services to `docker-compose.yml` with persistent volumes.
- Expose a **metrics endpoint** on the API (e.g., `/metrics`) using a Node metrics client (likely `prom-client`), capturing request/response counts, latency histograms, and process metrics.
- Configure **Prometheus** to scrape:
  - API metrics endpoint
- Postgres metrics via exporter
- ClickHouse metrics via its `/metrics` endpoint
- Add **Grafana** with a preconfigured Prometheus datasource and a starter dashboard set (API latency, error rate, request throughput).
- Keep metrics endpoints **internal** (not exposed to browsers) and gated either by:
  - internal network access only, or
  - internal API key header where appropriate.
 - Expose **Grafana only** through the gateway so the UI is reachable at `/grafana/`.

## Consequences
- Adds two new runtime services to local/dev environments.
- Requires minimal API code to expose a metrics endpoint.
- Requires decisions on access control and metrics scope (API-only vs API + gateway).
- Creates a baseline observability layer for future reliability work.

## Alternatives Considered
- Use a hosted monitoring provider (Datadog, New Relic): more setup cost, external dependencies.
- Rely on logs only: insufficient for latency SLOs and dashboards.

## Questions & Answers

### Questions for User
- Q1: Should Prometheus scrape **only the API** to start, or should we include **Nginx gateway metrics** (via an exporter) in the initial scope?
- Q2: Should the API metrics endpoint require the **internal API key header**, or should it be **network-restricted only**?
- Q3: Do you want **Grafana and Prometheus exposed on local ports** (e.g., `:9090`, `:3001`), or only via internal compose networking?
- Q4: Any **starter dashboards** you want prioritized (e.g., request rate, error rate, p95 latency, business-order rate)?

### Answers (to be filled by user)
- A1: API-only scraping to start, plus DB and ClickHouse metrics (no gateway metrics in v1).
- A2: Require the internal API key header.
- A3: Expose Grafana only through the gateway (Prometheus remains internal).
- A4: Default dashboard starter set is fine; prioritize request rate, error rate, and p95 latency.
