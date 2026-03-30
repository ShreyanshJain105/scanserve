# ADR-033: Ordering & Payments (Layer 7)

- Status: Accepted
- Date: 2026-03-24

## Context
- Layer 6 delivers public menu + local cart only. No order creation or payment processing yet.
- Layer 7 must introduce: order creation, payment initiation, payment confirmation, and customer order status.
- Must remain compatible with QR-scoped customer auth and business approval/blocked gating.

## Decision (Proposed)
1) **Order model & lifecycle**
   - Use existing `orders` + `order_items` tables.
   - Allowed statuses: `pending` → `confirmed` → `preparing` → `ready` → `completed` (admin/business updates later).
2) **Create order endpoint**
   - `POST /api/public/orders` accepts `businessId`, `tableId`, and `items[]` where each item is `{ menuItemId, quantity }`.
   - Client never sends prices or item metadata; the server must always fetch menu items, validate availability/ownership, and compute totals from stored prices (tamper-proof).
   - Returns `orderId`, `amount`, and `paymentIntentId`.
3) **Payments**
   - Stripe Checkout Sessions for customer payment.
   - `POST /api/public/orders/:id/checkout` creates session and returns `url`.
   - Webhook endpoint `POST /api/payments/webhook` to confirm payment and set order status `confirmed`.
4) **Customer order status**
   - `GET /api/public/orders/:id` returns status, items, and totals.
   - Customer order hub page `/orders` shows list + selected order detail and refreshes as needed.
5) **Gating**
   - Block order creation if business is not approved or is blocked/archived.
   - Table must be active and belong to business.
6) **Tests**
   - API tests for order creation validation, totals, and status transitions.
   - Web tests for orders hub rendering + selection behavior.

## Consequences
- Introduces payment dependency (Stripe keys + webhook secret).
- Requires server-side item lookup + total calculation to avoid tampering.
- Lays groundwork for Layer 8 (order management UI).
