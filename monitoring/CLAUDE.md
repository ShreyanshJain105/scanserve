# monitoring — Observability Stack

## What this is
Prometheus + Grafana configuration and provisioning used by the local docker-compose stack.

## Conventions
- Keep provisioning files under `monitoring/grafana/provisioning/`.
- Place dashboard JSON under `monitoring/grafana/dashboards/`.

## Updates 2026-04-09
- Added Grafana dashboard provisioning and a Scan2Serve overview dashboard JSON (`monitoring/grafana/provisioning/dashboards/dashboards.yml`, `monitoring/grafana/dashboards/scan2serve-overview.json`).
