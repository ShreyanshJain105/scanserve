# ADR-039: Cash Payments + Payment-Gated Order Creation

- Status: Accepted
- Date: 2026-03-29

## Context
- Orders are currently created immediately on `POST /api/public/orders` with `paymentStatus="pending"`.
- Razorpay checkout happens after order creation, and verification updates `paymentStatus` to `paid`.
- When Razorpay is not configured and there is no cash option, orders still get created, which is confusing for operators.
- Product wants: allow cash payments, and avoid creating unpaid orders unless cash is explicitly selected.
- UI should show both order **status** and **payment status** (paid/unpaid) clearly.

## Decision (Proposed)
1) **Payment method required at order creation**
   - `POST /api/public/orders` must include `paymentMethod`.
   - Allowed values (MVP): `"razorpay" | "cash"`.

2) **Order creation gating**
   - If `paymentMethod=razorpay`:
     - Order creation is allowed **only when Razorpay is configured**.
     - Order is created with `paymentStatus="pending"` and must proceed to checkout/verify.
   - If `paymentMethod=cash`:
     - Order is created immediately with `paymentStatus="unpaid"` (or `pending` if keeping enum), and `paymentMethod="cash"`.

3) **Payment status semantics**
   - Extend order payment tracking to distinguish paid vs unpaid:
     - `paid` = verified via Razorpay or manually marked (future).
     - `unpaid` = cash order awaiting collection.
     - `pending` = Razorpay order awaiting payment verification.
     - (Keep `failed/refunded` unchanged.)

4) **Checkout/verify flows**
   - `POST /orders/:id/checkout` allowed only for `paymentMethod=razorpay`.
   - `POST /orders/:id/verify-payment` updates `paymentStatus` to `paid` and sets status to `confirmed`.
   - Cash orders never call checkout/verify.

5) **UI updates**
   - Orders list shows **both** status tag and payment tag (paid/unpaid/pending) on each card.
   - Paid/unpaid tag is visually distinct from status tag.

## Consequences
- Prevents unpaid order creation when Razorpay is disabled unless cash is explicitly selected.
- Requires schema/type updates for `paymentMethod` (and possibly `paymentStatus` enum if `unpaid` is new).
- Requires public order creation payload + tests + UI updates for payment tag display.

## Questions & Answers

### Questions for User
- Q1: Should `paymentStatus` add an explicit `unpaid` state for cash, or reuse `pending` and rely on `paymentMethod` to infer unpaid?
- Q2: Should Razorpay orders be blocked entirely if Razorpay is not configured, or should they be created but marked `paymentStatus="pending"` with a warning?
- Q3: Should `cash` orders be auto-`confirmed`, or remain `pending` until staff confirms?
- Q4: Do we need a manual **mark as paid** action for cash orders now, or defer to later?

### Answers
- A1: Add explicit `paymentStatus="unpaid"` for cash orders.
- A2: Block Razorpay orders entirely when Razorpay is not configured.
- A3: Cash orders remain `pending` until staff confirms.
- A4: Add a “Mark as paid” button on the order card for cash orders.
