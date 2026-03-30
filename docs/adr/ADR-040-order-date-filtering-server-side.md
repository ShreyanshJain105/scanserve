# ADR-040: Server-Side Order Date Filtering

- Status: Accepted
- Date: 2026-03-30

## Context
- Orders list currently filters by date on the client, which is slow for large datasets.
- Orders are stored with `created_at` in Postgres as `timestamp` (`DateTime` in Prisma).
- We want maximum efficiency by performing date filtering in database queries.

## Decision (Proposed)
1) **API query parameters**
   - Extend `GET /api/business/orders` with `date=today|yesterday|all`.
   - Server applies the filter using `created_at` in the database.

2) **Timezone basis**
   - Date windows should be defined in a single, consistent timezone.
   - The API will compute the date range and apply it in SQL.

3) **Client behavior**
   - Orders dashboard will send `date` to the API and remove client-side date filtering.
   - Sorting and status filters can remain client-side (or be expanded later).

## Consequences
- Faster filter response time, especially for large order volumes.
- Requires a decision on **timezone definition** to avoid ambiguity.

## Questions & Answers

### Questions for User
- Q1: Which timezone should define “today/yesterday” — business local timezone (preferred), server timezone, or browser timezone?
- Q2: Do you want date filtering to include **only** orders created in that date window, or also orders updated in that window?

### Answers
- A1: Use browser timezone.
- A2: Filter by order update time (`updatedAt`).
