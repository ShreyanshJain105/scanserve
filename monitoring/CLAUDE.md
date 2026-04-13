# monitoring — Observability Stack

## What this is
Prometheus + Grafana configuration and provisioning used by the local docker-compose stack.

## Conventions
- Keep provisioning files under `monitoring/grafana/provisioning/`.
- Place dashboard JSON under `monitoring/grafana/dashboards/`.

## Updates 2026-04-09
- Added Grafana dashboard provisioning and a Scan2Serve overview dashboard JSON (`monitoring/grafana/provisioning/dashboards/dashboards.yml`, `monitoring/grafana/dashboards/scan2serve-overview.json`).

## Updates 2026-04-09
- Enabled ClickHouse Prometheus metrics endpoint via config in `clickhouse-config/prometheus.xml` and mounted config dir in `docker-compose.yml`.

## Updates 2026-04-10
- Added ClickHouse Grafana dashboard template (`monitoring/grafana/dashboards/clickhouse-overview.json`) using Prometheus-scraped ClickHouse metrics.

## Updates 2026-04-10
- Added minimal Postgres exporter config file and mounted it to silence missing config warnings (`monitoring/postgres_exporter.yml`, `docker-compose.yml`).

## Updates 2026-04-13
- Added Grafana/Prometheus services to production compose to satisfy gateway upstream (`docker-compose.prod.yml`).
