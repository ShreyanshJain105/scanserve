# ADR-049: Dashboard Analytics Interval Selector

**Date:** 2026-04-10
**Status:** Superseded by ADR-050

## Context
Business dashboard pages (main dashboard and orders dashboard) currently render the Analytics Overview with a fixed grid of windows (today, yesterday, current week, last week, last month, last quarter, last year). The request is to add a selector that lets users switch the interval of dashboard data across all dashboards. We need to decide which dashboards/sections respond, what intervals are available, and how the selector state is stored and shared.

## Decision (Proposed)
Introduce a shared **Dashboard Interval Selector** that controls the active analytics window for dashboard-level analytics components. The selector will use the existing analytics windows from ADR-045 and will be displayed consistently wherever analytics summaries are shown (currently `Dashboard` and `Orders`, with the selector treated as a default dashboard pattern for future pages).

Key behaviors:
- Selector options map to existing windows: `today`, `yesterday`, `currentWeek`, `lastWeek`, `lastMonth`, `lastQuarter`, `lastYear`.
- Selector controls **only** analytics summaries (not other page data like order lists).
- UI renders a single summary block for the selected interval (orders, paid revenue, avg paid order), replacing the multi-window grid.
- Selector state is preserved across dashboard routes via a `?interval=` query param (default `today`).
- On page load, request the selected interval immediately and prefetch remaining windows in the background to warm caches.

## Consequences
- Dashboard analytics components must accept an interval value and fetch only that window.
- Analytics overview UI will change from multi-window grid to single-window view (unless we keep the grid and just highlight the chosen window).
- Requires a shared selector component and route-level state propagation.
- May need tests for selector state persistence and analytics fetch behavior.

## Questions & Answers

### Questions for User
- Q1: Which dashboards should respond to the interval selector? (Dashboard overview only, Orders dashboard, or any other dashboard pages with analytics?)
- Q2: Should the selector control **only** analytics summaries, or also other data on the page (e.g., orders list filters)?
- Q3: Do you want to **replace** the current multi-window grid with a **single-window** summary, or keep the grid and just **highlight/filter** the selected window?
- Q4: Should the available options stick to the existing windows (today, yesterday, current week, last week, last month, last quarter, last year), or add rolling ranges like last 7/30/90 days or all-time?
- Q5: How should the selector state persist? (`?interval=` query param, localStorage, or per-page only?)
- Q6: If a user selects a warehouse-only window (lastMonth, lastQuarter, lastYear), should we still prefetch Postgres windows in the background for faster switching, or only fetch the selected window?

### Answers (filled by user)
- A1: Apply to the two existing dashboards for now; treat the selector as a default dashboard pattern for future pages.
- A2: Switch only analytics summaries.
- A3: Use a single-window summary view.
- A4: Stick to the existing windows only.
- A5: Use `?interval=` query param; on initial load request everything and cache async, while the page requests the specific interval.
- A6: Cache prefetching should handle warehouse-only windows.
