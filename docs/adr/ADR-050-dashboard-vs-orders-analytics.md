# ADR-050: Split Dashboard vs Orders Analytics (Summary + Detail)

**Date:** 2026-04-10
**Status:** Accepted

## Context
The current analytics UI reuses a single `AnalyticsOverview` component on both the dashboard and orders pages, calling the same `/api/business/analytics/overview` endpoint. This makes the analytics identical across pages. We need distinct analytics for:
- **Dashboard**: business health, growth, and performance (aggregated).
- **Orders**: business order performance (operational).

We also want the API to return **two tiers of data** in a single request:
- **Summary**: compact metrics for the top-level cards.
- **Detail**: richer metrics and/or time-series for the "View more" analytics page.

Requests must still support the ADR-045 requirement of **two sources** (Postgres for short windows, warehouse for long windows) via **two params in the same request**.

## Decision (Proposed)
Introduce two analytics sections with distinct semantics and metrics. The API will return **summary** or **detail** depending on a request flag, rather than always returning both. The analytics UI will surface a compact summary and include a **"View more"** action (from the dashboard only) that navigates to a dedicated analytics page showing both analytics sections.

### Sections
- `dashboard` analytics: business performance and growth signals.
- `orders` analytics: operational order performance for the selected business.

### API Shape (conceptual)
`POST /api/business/analytics/{section}` with request payload:
```
{
  source: "postgres" | "warehouse",
  windows: ["today" | "yesterday" | "currentWeek" | "lastWeek" | "lastMonth" | "lastQuarter" | "lastYear"],
  granularity: "summary" | "detail"
}
```
Response:
```
{
  section: "dashboard" | "orders",
  timezone: "Asia/Kolkata",
  windows: {
    today: {
      source: "postgres",
      status: "ok" | "error",
      summary?: { ... },
      detail?: { ... }
    },
    lastMonth: {
      source: "warehouse",
      status: "ok" | "error",
      summary?: { ... },
      detail?: { ... }
    }
  }
}
```

### Suggested Analytics (Draft)
#### Dashboard analytics (business performance)
Summary:
- Total orders
- Paid revenue
- Avg paid order value
- Order growth % vs previous window (if available)

Detail (examples):
- Orders over time (trend)
- Revenue over time (trend)
- New vs returning customers
- Conversion proxy (orders per active table, if available)
- Top categories or items by revenue (if available)

#### Orders analytics (operational)
Summary:
- Orders by status (counts)
- Avg prep/fulfillment time
- Cancellation rate
- Paid vs unpaid count

Detail (examples):
- Orders over time by status
- Status transition latency (avg per stage)
- Peak ordering hours/day
- Payment method mix
- Refund/failed payment count (if available)

## Consequences
- Adds new analytics section endpoints (or reworks existing) to separate business performance vs operational order analytics.
- UI must render summary panels for each page and a "View more" button on the dashboard to navigate to a full analytics page that includes both sections.
- API response size is controlled by `granularity` (summary vs detail), reducing payloads for summary views.
- Maintains ADR-045 dual-source requests using `source` + `windows` in the same request.

## Questions & Answers

### Questions for User
- Q1: Confirm the **two sections**: `dashboard` (business performance) vs `orders` (operational order analytics).
- Q2: Which **summary metrics** are mandatory for each page? (Pick from the draft list or add/remove.)
- Q3: Which **detail metrics** must appear on the "View more" page for each section?
- Q4: Should the "View more" page be **per section** (e.g., `/dashboard/analytics` and `/dashboard/orders/analytics`) or a single page with tabs?
- Q5: Should "View more" require the same interval selector as the summary view (default `?interval=`), or should it show multiple windows at once?
- Q6: Confirm that the API **always returns both summary + detail** for requested windows (even if the UI only renders summary initially).

### Answers (filled by user)
- A1: Yes, two sections (`dashboard` vs `orders`).
- A2: Use the draft list and refine as needed.
- A3: Include all listed detail metrics.
- A4: \"View more\" exists only on the dashboard page and shows both analytics sections; orders analytics in that page can be filtered by a business selector.
- A5: Use the interval selector.
- A6: API should support a flag to request summary vs detail (do not always return both).
