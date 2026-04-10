# ADR-052: Customer Reviews Storage + Warehouse/Cache Model

**Date:** 2026-04-10  
**Status:** Accepted

## Context
We need to store customer reviews for each business and make them available for business pages and analytics. Reviews should be tied to completed orders and remain immutable. We also want a storage model that keeps recent reviews fast in Postgres while moving older reviews to ClickHouse for history and analytics. To avoid slowing page loads, review data should be cached asynchronously.

## Decision
1. **Review eligibility and shape**
   - One review per completed order (customer-auth only).
   - Rating scale: 1–5 stars (integer).
   - Optional text comment.
   - Immediate public visibility; no moderation in v1.
   - Immutable reviews (no edits/deletes).
   - Review likes: customer-only, one like per review (toggle on/off).
   - Default sort: most likes first, then most recent.

2. **Storage mental model**
   - **Hot store (Postgres):** keep recent reviews (last 90 days) for transactional reads and page loads.
   - **Cold store (ClickHouse):** store older reviews for historical analytics.
   - **Event‑driven migration:** a periodic job (cron/worker) moves reviews older than 90 days to ClickHouse and removes them from Postgres.
   - **Read model:** pages fetch recent reviews + summary from Postgres; older review history is only used for analytics/long‑range queries.

3. **Cache model**
   - Asynchronously cache **rating summary + recent reviews** per business **and** per star filter + pagination.
   - Cache writes are non‑blocking (review creation returns immediately).
   - **Event‑driven invalidation** on review create and migration (no fixed TTL in v1).
   - Menu page defaults to Postgres for recent reviews; when **all reviews** or **star‑filtered** views are requested, query **Postgres + ClickHouse** and merge results.

4. **Data model (conceptual)**
   - References: `business_id`, `order_id`, `customer_user_id`.
   - Unique constraint: one review per order.
   - Fields: `rating` (1–5), `comment` (optional), `created_at`, `updated_at`.
   - Status: implicit “published” (no moderation flag in v1).

5. **Review insertion UX (client flow)**
   - **Customer orders page:** when an order is completed, show a **“Give review”** button on that order card.
   - Clicking the button opens a **review dialog** tied to the completed order (rating + optional comment).
   - Submit posts a review for that specific order; on success, UI updates and the button is replaced with a “Reviewed” state.
   - **Business menu page:** show recent reviews and average rating alongside the menu.
   - Provide **star-based filters** (e.g., All, 5★, 4★, …) for reviews on the menu page.

## Consequences
- Fast page loads for recent reviews via Postgres + cache.
- Historical review data remains accessible via ClickHouse for analytics.
- Additional background job required to migrate and clean up old reviews.
- Review editing is not supported; auditability is preserved.

## Implementation Tasks
- [x] Confirm ADR-052 acceptance and finalize any open decisions (likes/relevance definition).
- [x] Prisma: add `review` model (unique `order_id`, `business_id`, `customer_user_id`, `rating`, `comment`, timestamps) + indexes.
- [x] Prisma: add review-like storage if required for relevance sorting (model + unique constraints).
- [x] ClickHouse: add `reviews` table for cold storage + ingest script (schema aligned to Postgres review model).
- [x] API: add review creation endpoint (customer-auth, completed-only, 1 review per order, 250-char cap).
- [x] API: add review list + summary endpoints (business scope, star filter, pagination, default relevance sort).
- [x] API: add cache read/write + event-driven invalidation on review create and migration.
- [x] Worker: add periodic migration job to move >90-day reviews from Postgres → ClickHouse, then delete from Postgres; invalidate caches.
- [x] Web: add review dialog + “Reviewed” state on customer orders hub (completed orders only).
- [x] Web: add menu-page review summary + list + star filters + pagination.
- [x] Tests: API validation + pagination + merge behavior, worker migration, and web UX flows (add coverage alongside each change).

## Implementation Notes (ADR only)
- Use existing event/outbox patterns to stream older reviews into ClickHouse.
- A cron/worker handles retention cut‑over and Postgres cleanup.
- Cache TTL/keying strategy to be defined during implementation.

## Questions & Answers

### Questions for User
- Q1: Who can create a review and how many per business?
- Q2: What rating scale should we store?
- Q3: How should reviews be visible?
- Q4: How long should reviews stay in Postgres before moving to ClickHouse?
- Q5: Can customers edit or delete reviews after posting?
- Q6: What do you want cached for fast page load?

### Answers (confirmed)
- A1: Per completed order (one review per completed order).
- A2: 1–5 stars.
- A3: Immediate public display.
- A4: 90 days in Postgres, then move to ClickHouse.
- A5: No edits/deletes.
- A6: Cache per business + star filter + pagination, event‑driven invalidation only.
- A7: Default sort = relevance (review likes), tie-breaker = most recent.
- A8: Pagination size = 10.
- A9: Comment max length = 250 chars.
- A10: Eligibility requires `status=completed` only.
- A11: Likes are customer-only, one like per review, click again to remove.
