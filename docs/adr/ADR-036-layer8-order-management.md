# ADR-036: Layer 8 Order Management (Business Dashboard)

- Status: Paused
- Date: 2026-03-27

## Context
- Layer 7 ordering + payments is complete (Razorpay).
- Business owners need operational tools to view and manage orders in real time.
- Existing API has placeholder `/api/business/orders` and no end-to-end order management UI.
- Long-term dashboard needs will include historical analytics beyond operational DB capacity.
- Decision needed for order data retention, partitioning strategy, and data warehouse feed.

## Decision (Accepted)
1) **Scope**
   - Business dashboard provides an order management screen with:
     - real-time-ish list (polling) of orders by status,
     - order detail drawer (items, totals, customer/table info),
     - status transitions (confirm → preparing → ready → completed; cancel from pending/confirmed only).

2) **API contracts**
   - `GET /api/business/orders?status=&limit=&cursor=` list with pagination.
   - `GET /api/business/orders/:id` detail view.
   - `PATCH /api/business/orders/:id/status` to update status with validation.

3) **Operational data retention**
   - Keep **6 months** of order data in the primary Postgres DB.
   - Older operational-order data is dropped from Postgres after it has been shipped to the warehouse.

4) **Partitioning**
   - Partition `orders` (and dependent `order_items`) by month for efficient retention.
   - Each monthly partition holds all restaurants’ orders for that month.
   - Automated partition creation + drop policy for rolling 6-month retention.

5) **Event queue + warehouse**
   - Every order create/update emits an **order event** into a queue.
   - Downstream consumer writes to a data warehouse for historical and complex analytics.
   - Dashboards use:
     - Postgres for realtime/operational queries,
     - Warehouse for historical analytics.

6) **Realtime behavior**
   - MVP uses polling (e.g., every 10–15s) with manual refresh.

7) **Auth / gating**
   - Business role + approved business required; blocked businesses cannot update status.

8) **Tests**
   - API route tests for list/detail/status validation.
   - Web tests for status transitions + list refresh behavior.

## Consequences
- Enables basic operational flow without introducing WebSockets.
- Requires careful status validation to avoid invalid transitions.
- Introduces data lifecycle management (partition creation/drop) and warehouse pipeline operations.
- Requires clear event schema + idempotency guarantees for queue processing.

## Questions & Answers

### Questions for User
- Q1: What is the **exact status flow** you want (allowed transitions, cancel rules)?
- Q2: Do you want **order filtering** by table/date/paid status in MVP, or status-only?
- Q3: Should staff be able to **edit order items** after creation, or status-only?
- Q4: Should we add **order history/audit log** now, or defer?
- Q5: Should **retention** apply to both `orders` and `order_items` (and any payment records), or only orders?
- Q6: Are you committed to **Postgres native partitioning**, or open to app-managed monthly tables?
- Q7: What **warehouse target** are you envisioning (e.g., BigQuery/Snowflake/Redshift/ClickHouse), or should we define an abstract sink for now?
- Q8: What **event schema** do you want (full order snapshot per event vs. diff/patch), and do you need **idempotency keys**?
- Q9: Should **deletes** in Postgres be hard deletes after 6 months, or do we keep a minimal tombstone?

### Answers (to be filled by user)
- A1:
  1. Pending
     • New order, awaiting restaurant action
  2. Accepted / Confirmed
     • Restaurant accepts the order
  3. Preparing
     • Kitchen starts work
  4. Ready
     • Plated and ready for serving
  5. Completed
     • Served successfully (final terminal state)
  6. Cancelled
     • Allowed transitions:
     • Pending → Cancelled ✅
     • Accepted → Cancelled (restricted) ⚠️ (Only before Preparing)
     • After Preparing → usually ❌ (or requires support)
- A2: Filter by status only (MVP).
- A3: Status-only
- A4:  short-term history in Postgres (e.g., last 6 months), long-term history in the warehouse
- A5: The order will already have a list of orders_item along with the mode of payement and amount.
- A6: Postgress native
- A7: ClickHouse
- A8: Full snapshot events. Warehouse uses `eventId` for dedupe and upserts by `orderId` only if `eventCreatedAt` is newer than the stored warehouse `eventCreatedAt`.
- A9: Hard delete from Postgres after 6 months.
