# ADR-054: Order Pinning + Mark-Paid Actor Attribution

- Status: Accepted
- Date: 2026-04-11

## Context
- Layer 8 order management is live with status transitions and a cash `mark-paid` action.
- Status transitions record actor attribution (`statusActors`), but cash `mark-paid` does **not** record who performed the action.
- The orders list is busy; operators want to keep priority orders visible by “pinning” them at the top.

## Decision (Proposed)
1) **Mark-paid actor attribution**
   - Extend the order record to store who marked a cash order as paid.
   - Expose this in the order detail view and include it in analytics/event snapshots where relevant.

2) **Order pinning**
   - Allow a business user to pin an order so it stays at the top of the list.
   - Pinned state is persisted and visible to all users of the business (unless we choose per-user pins).

## Proposed Implementation

### A) Mark-Paid Actor
- Add a new field to `orders`:
  - Option 1: `paymentActors` JSON (similar to `statusActors`), with `paidBy`.
  - Option 2: `paidByUserId`, `paidByEmail`, `paidAt` columns.
- `PATCH /api/business/orders/:id/mark-paid` records the actor.
- Order detail UI shows “Paid by {actor}” (and optional timestamp if stored).

### B) Order Pinning
- Add fields to `orders`:
  - `pinned_at` timestamp (and optionally `pinned_by_user_id`).
- New endpoint:
  - `PATCH /api/business/orders/:id/pin` with `{ pinned: true | false }`.
- Orders list sorts pinned orders first, then by selected sort order.
- Order detail UI adds a “Pin/Unpin” control.

## Consequences
- Requires DB schema change + migration.
- Order list queries must include pinned sorting and filtering logic.
- Need clarity on pin scope (global per business vs per user), and whether pinning applies to completed/cancelled orders.

## Questions & Answers

### Questions for User
1. **Mark-paid attribution storage:** Do you prefer a single `paidBy` field (user id/email) or a JSON `paymentActors` blob like `statusActors`?
2. **Display requirements:** Should we show a `paidAt` timestamp in the UI, or just the actor?
3. **Pin scope:** Should pins be **global for the business** (everyone sees same pinned orders) or **per-user**?
4. **Pin eligibility:** Can **any status** be pinned, or only active (non-completed/non-cancelled) orders?
5. **Pin limit:** Do you want a maximum number of pinned orders (e.g., 3–5), or no limit?
6. **Sorting:** Should pinned orders always appear on top **regardless of sort option**, or should they only rise within their current sort bucket?

### Answers (to be filled by user)
- A1: Use JSON `paymentActors` (like `statusActors`) to store `paidBy` + `paidAt`.
- A2: Show both actor and paidAt.
- A3: Per-user pinning (personal tracking).
- A4: Any status can be pinned.
- A5: Max 3 pinned orders.
- A6: Pinned orders always appear at the top (regardless of sort).
 Use json 
