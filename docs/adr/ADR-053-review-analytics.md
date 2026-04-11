# ADR-053: Review Analytics Expansion

**Date:** 2026-04-10  
**Status:** Accepted

## Context
We now store customer reviews in Postgres and archive to ClickHouse. The analytics page currently focuses on orders/revenue metrics, but we want additional insights tied to review volume and quality. This should reuse existing analytics endpoints (ADR-050) and be compatible with the Postgres/ClickHouse window split (ADR-045).

## Decision
1. **Extend dashboard analytics** to include review-focused metrics and trends without adding new endpoints. Review metrics will be returned under dashboard analytics summary/detail payloads.
2. **Source selection** follows the existing window split:
   - `today`, `yesterday`, `currentWeek`: Postgres
   - `lastWeek`, `lastMonth`, `lastQuarter`, `lastYear`: ClickHouse `reviews` table
3. **Metrics (baseline set)**
   - **Average rating** for the window
   - **Total reviews** for the window
   - **Rating distribution** (1–5)
   - **Likes per review** (like-rate) and total likes
   - **Review conversion**: `reviews / completed orders` for the window
   - **Review trend series**: per-bucket review count + avg rating

## API Shape
Re-use `POST /api/business/analytics/dashboard` with existing `windows[]` + `granularity`:
- **Summary**: add `reviews` summary fields
- **Detail**: add `reviews` detail fields (trend + distribution)

Proposed shared shapes:
- `DashboardAnalyticsSummary` adds `reviewSummary` or inline fields for average rating, total reviews, like rate, review conversion
- `DashboardAnalyticsDetail` adds `reviewSeries`, `ratingCounts`, `reviewLikes`, and optional `reviewConversionPct`

## Data Notes
- Postgres review queries can join orders for completed-order counts.
- ClickHouse review queries will use the `reviews` table; completed-order counts can be derived from `order_events` (status transitions) for conversion if enabled.
- For windows where review migration is incomplete, we will return partial metrics rather than block analytics.

## Consequences
- **Pros:** richer business quality insights, better feedback loop for owners, minimal API surface changes.
- **Cons:** more complex aggregation logic and potential discrepancies if review migration lags.

## Alternatives Considered
1. **New `/analytics/reviews` endpoint**
   - Cleaner separation but extra API surface and client complexity.
2. **UI-only review widgets from `/api/public/reviews`**
   - Simple but not windowed and lacks conversion metrics.

## Questions & Answers

### Questions for User
- Q1: Which review metrics should we **prioritize** in the UI? (default list: avg rating, total reviews, rating distribution, likes per review, review conversion, review trend series)
- Q2: Should review analytics appear **only** on the dashboard analytics page, or also within orders analytics?
- Q3: For review conversion, should the denominator be **completed orders** or **paid orders**?
- Q4: For warehouse windows, should we use **ClickHouse reviews only** or **merge Postgres + ClickHouse** like the public review list does?

### Answers (verified by user)
- A1: Prioritize all baseline review metrics: avg rating, total reviews, rating distribution, likes per review, review conversion, review trend series.
- A2: Dashboard analytics page only (orders analytics stays focused on ops).
- A3: Use completed orders as the denominator for review conversion.
- A4: Merge Postgres + ClickHouse for warehouse windows (dedupe by review_id) to avoid gaps if migration lags.
