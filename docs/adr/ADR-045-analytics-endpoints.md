# ADR-045: Business Analytics Endpoints (Dashboard-Scoped, Dual-Source)

**Date:** 2026-04-04
**Status:** Accepted

## Context
The dashboard currently lacks analytics data; placeholder analytics cards have been removed pending real endpoints. We need analytics APIs for business users that support dashboard sections and time-series windows. Requirements include: no client-side aggregation, strict window definitions (today vs all other windows excluding today), and a split data source strategy (Postgres for short windows; ClickHouse warehouse for longer windows). We also want Redis-backed caching for all non-today windows and a non-blocking UI that can render with partial data.

## Decision (Proposed)
Adopt **dashboard-scoped analytics endpoints** (one endpoint per dashboard section) and support a **fixed set of windows** per section:
`today`, `yesterday`, `currentWeek`, `lastWeek`, `lastMonth`, `lastQuarter`, `lastYear`.

Data sourcing rules:
- **Postgres** serves `today`, `yesterday`, and `currentWeek`.
- **ClickHouse** serves `lastWeek`, `lastMonth`, `lastQuarter`, and `lastYear`.
- All windows **except `today`** must exclude the current day from their search space.
- No analytics aggregation in JS; all computations are performed in SQL/warehouse queries.

Endpoints are read-only, require business-role access, and return **fully aggregated** metrics + time series for their section. Each endpoint response includes per-window `source` and `status` so the UI can render partial data if one source fails.
Requests include a `source` field (and optional `windows`) so the UI can issue **two calls per section**: one for Postgres windows and one for warehouse windows.

Caching:
- Redis-backed caching for all windows **except `today`**.
- Cache keys must include `businessId`, `timezone`, window, and section.

Timezone:
- Business profiles will store a `timezone` field chosen at onboarding.
- Onboarding will add a timezone dropdown driven by country selection (country → timezone mapping).

Proposed section endpoints:
- `GET /api/business/analytics/overview` — high-level metrics and time series for orders + revenue.
- `GET /api/business/analytics/orders` — order volume, status breakdowns, and order trends.
- `GET /api/business/analytics/revenue` — paid revenue + AOV trends.
- `GET /api/business/analytics/customers` — customer order counts and repeat rate (if available), otherwise placeholder for future.

Response shape (conceptual):
```
{
  section: "overview",
  timezone: "Asia/Kolkata",
  windows: {
    today: { source: "postgres", status: "ok", series: [...], summary: {...} },
    lastMonth: { source: "clickhouse", status: "error", error: "...", series: [], summary: {...?} }
  }
}
```

## Consequences
- Adds new dashboard-scoped analytics endpoints + shared response types.
- Requires Redis integration for analytics caching.
- Requires ClickHouse query layer for long windows and Postgres query layer for short windows.
- Adds onboarding timezone selection and a `timezone` field on Business (schema + migration).
- Enables partial UI rendering with per-window status and source metadata.

## Questions & Answers

### Questions for User
- Q1: Confirm dashboard-scoped endpoints (one endpoint per dashboard section) as the route strategy.
- Q2: Confirm timezone onboarding: add `country` + `timezone` selection to business onboarding; store `timezone` on Business for analytics windowing.
- Q3: Confirm Redis caching: use Redis for all non-today windows, with cache keys scoped by `businessId`, `timezone`, `section`, and `window`.
- Q4: Confirm ClickHouse as the warehouse for long windows (lastWeek/lastMonth/lastQuarter/lastYear).
- Q5: Should each dashboard endpoint **merge Postgres + ClickHouse in one response** (returning partial data if one source fails), or should we keep **two endpoints** per section (one for Postgres windows, one for warehouse windows) and let the UI merge?

### Answers (to be filled by user)
- A1: Per dashboard.
- A2: Add timezone selection in onboarding based on country; store timezone on business.
- A3: Use Redis for caching (non-today windows).
- A4: ClickHouse is the warehouse target for long windows.
- A5: Keep one endpoint per dashboard section, but request payload specifies which source windows to fetch; UI will make two requests (Postgres windows + warehouse windows) and merge.
