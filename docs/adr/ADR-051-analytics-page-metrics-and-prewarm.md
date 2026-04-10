# ADR-051: Analytics Page Metrics Expansion + Interval Prewarm

**Date:** 2026-04-10  
**Status:** Proposed

## Context
The analytics page currently repeats summary metrics and feels thin on business-oriented insights. The user wants richer, more meaningful analytics on the dashboard analytics page. Additionally, interval switching currently triggers per-interval fetches; the user asked to prewarm intervals on initial load and rely on cache for subsequent switches.

We already have analytics endpoints that accept `windows[]` and `granularity` (`summary` vs `detail`) for both `dashboard` and `orders` sections (ADR-050). This can be used to prefetch multiple intervals in one request, warming Redis cache and allowing the UI to switch without new fetches.

## Decision
1. **Expand analytics content** on the analytics page by adding new, non-duplicative metrics and visuals that better communicate business performance vs operational order insights.
2. **Prewarm all intervals on initial page load** by requesting `windows: WINDOW_OPTIONS` for both `dashboard` and `orders` sections (summary + detail) using existing endpoints, storing results in memory for the session and warming Redis for non-today windows.
3. **Interval switching** uses already-loaded data (local state), falling back to on-demand fetch only if a window is missing.

## Selected Metrics (Final)
### Dashboard (business performance)
- **Revenue growth % vs previous window** (new aggregation; use paid revenue delta).
- **Orders growth % vs previous window** (existing `orderGrowthPct`).
- **Orders per active table** (existing detail).
- **Avg items per order** (new aggregation from order_items per order).
- **New vs returning customer share** (use `newVsReturning` where available).
- **Top categories share** (existing detail; visualize as bars).

### Orders (operational)
- **Status mix** (existing summary; visualize as bars).
- **Peak hours distribution** (existing detail).
- **Payment method mix** (existing detail; show % + revenue).
- **Avg prep/fulfillment time** (use `statusLatencyMinutes` if present; otherwise omit).
- **Failed payment / refund counts** (existing detail fields).

## Proposed Metrics (Draft)
### Dashboard (business performance)
- **Revenue growth vs previous window** (already in summary as `orderGrowthPct`; add revenue growth if available).
- **Orders per active table** (detail already available; surface with context).
- **Avg items per order** (requires new aggregation in Postgres/ClickHouse).
- **Top categories share** (already available; visualize as bars).
- **Revenue volatility / trend delta** (simple slope from revenue series).

### Orders (operational)
- **Status mix** (already available; visualize with bars).
- **Peak hours distribution** (detail already available).
- **Payment method mix** (detail already available; visualize as share).
- **Completion time** (requires duration metric from status timestamps if present; otherwise omit).
- **Cancellation reasons** (not currently tracked; omit unless added).

## API Shape (No new endpoints)
- `POST /api/business/analytics/dashboard` with `windows: WINDOW_OPTIONS`, `granularity: summary`
- `POST /api/business/analytics/dashboard` with `windows: WINDOW_OPTIONS`, `granularity: detail`
- `POST /api/business/analytics/orders` with `windows: WINDOW_OPTIONS`, `granularity: summary`
- `POST /api/business/analytics/orders` with `windows: WINDOW_OPTIONS`, `granularity: detail`

All calls are done in parallel on page load. Results are stored in state keyed by window and section. Interval switch uses in-memory data first; no additional call unless missing.

## Consequences
- **Pros:** Faster interval switching, improved perceived performance, richer insights, reuses existing endpoints.
- **Cons:** Heavier initial load (4 parallel requests with multiple windows); may need to guard for slow networks or large data.

## Alternatives Considered
1. **Lazy-load per interval only** (current behavior)  
   - Simpler but slower UX; does not meet requirement.
2. **Backend prewarm job**  
   - Overkill for now; not scoped to user context per business.
3. **Single combined endpoint**  
   - Would reduce request count but is a new API surface; unnecessary if current endpoints suffice.

## Questions & Answers

### Questions for User
- Q1: Which *new* analytics should be included (pick 4–6) beyond what we already show? If you want, I can implement the draft list above.
- Q2: Should we prewarm **both** dashboard and orders analytics (summary + detail), or only dashboard detail + orders summary?
- Q3: Is a heavier initial load acceptable, or should we stagger prewarm (summary first, detail after idle)?

### Answers (to be filled by user)
- A1: yes do it on own
- A2: both
- A3: staggered prewarm (summary first, then detail after idle/background)
