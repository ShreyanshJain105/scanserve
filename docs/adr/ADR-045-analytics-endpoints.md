# ADR-045: Business Analytics Endpoints

**Date:** 2026-04-04
**Status:** Proposed

## Context
The dashboard currently lacks analytics data; placeholder analytics cards have been removed pending real endpoints. We need a minimal, reliable analytics API for business users that supports the dashboard summary metrics and future charts. This must be consistent with existing order retention/partitioning (6-month Postgres retention, order partitions) and avoid heavy warehouse dependencies for MVP.

## Decision (Proposed)
Introduce a small set of business-scoped analytics endpoints backed by Postgres to power dashboard summary cards and a basic trends chart. The endpoints will be read-only, require business-role access, and accept a date range window in the business’s local timezone. Aggregations will include order counts and revenue derived from paid orders only (matching current dashboard summary semantics).

Initial endpoints (proposed):
- `GET /api/business/analytics/summary` — aggregate metrics for a time window (e.g., total orders, paid revenue, cancelled count, average order value, unpaid cash count).
- `GET /api/business/analytics/trends` — time-series buckets (daily or hourly) for orders and revenue within a window.
- (Optional) `GET /api/business/analytics/top-items` — top-selling items (by quantity) within a window.

Key rules (proposed):
- Use server-side windowing with `startDate`, `endDate`, and `tzOffset` (minutes) so queries align with the business’s local day boundaries.
- Revenue uses paid orders only; cancelled orders are excluded from counts/revenue unless explicitly requested.
- Results are scoped to the selected business (respecting business memberships and RBAC).
- No warehouse dependency for MVP; queries run on Postgres partitions.

## Consequences
- Adds new query surfaces and shared types for analytics responses.
- Requires careful query performance and indices for partitioned orders.
- Establishes a contract for future dashboard charts and a clear upgrade path to warehouse-backed analytics later.

## Questions & Answers

### Questions for User
- Q1: Which summary metrics are required for MVP? (e.g., total orders, paid revenue, avg order value, cancelled count, unpaid cash count, active orders)
- Q2: What default date window should the dashboard use? (e.g., today, last 7 days, last 30 days)
- Q3: Do you want trend buckets daily only, or should we support hourly for “today” views?
- Q4: Should analytics include only `completed` orders, or all non-cancelled statuses? (Current UI summary excludes cancelled and counts paid revenue only.)
- Q5: Do you want a “top items” endpoint in this MVP, or defer it?

### Answers (to be filled by user)
- A1:
- A2:
- A3:
- A4:
- A5:
