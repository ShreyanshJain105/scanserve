# ADR-041: Require Customer Login Before Order Placement

- Status: Proposed
- Date: 2026-03-30

## Context
- Orders can currently be placed from the public menu without customer authentication.
- Product wants to require customer login before placing an order.
- QR-scoped customer auth already exists (ADR-006) and can be used to gate order placement.

## Decision (Proposed)
1) **Order creation requires customer session**
   - `POST /api/public/orders` will require a valid **QR-scoped customer session**.
   - If no customer session is present, return `401` with `CUSTOMER_AUTH_REQUIRED`.

2) **QR scope enforcement**
   - Customer session must be validated against the current QR context when present.
   - Existing QR auth rules remain unchanged (no non-QR customer auth routes).

3) **UI behavior**
   - Public menu checkout should prompt login when unauthenticated.
   - After login, user can proceed to place the order.

## Consequences
- Anonymous order placement is no longer possible.
- Requires API middleware check for customer session on order creation.
- Public menu UI may need a login prompt/redirect when checkout is attempted.

## Questions & Answers

### Questions for User
- Q1: Should we allow orders when a **business** session exists but no customer session? (likely no)
- Q2: Should we require login for **all** orders (including cash), or only online payments?

### Answers (to be filled by user)
- A1:
- A2:
