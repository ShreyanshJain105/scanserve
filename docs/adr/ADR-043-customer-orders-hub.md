# ADR-043: Customer Orders Hub Page

- Status: Accepted
- Date: 2026-03-30

## Context
- Customer order status was previously accessed via `/order/:id`, which was not linked from a navigable list.
- Product request: a single “template” orders page that shows current + previous orders for the logged-in customer.
- Customer auth is QR-scoped and now required for order creation and order status access (ADR-042).

## Decision
1) **Customer orders hub route**
   - Add a dedicated customer-facing orders page at `/orders` that lists all orders for the logged-in customer.
   - This page becomes the primary entry for order history and current status.
   - Orders are shown across all businesses associated with the customer's account.

2) **Order selection UX**
   - The page shows a list of orders and a selected order detail area.
   - Default selection: prefer the most recently updated **active** order (`pending|confirmed|preparing|ready`), otherwise fall back to the most recently updated order.

3) **API support**
   - Add an authenticated customer endpoint to list orders scoped to the customer session.
   - Reuse existing order detail endpoint for the selected order.
   - Proposed contract: `GET /api/customer/orders?cursor=<id>&limit=10` returning newest-first (by `updatedAt`), with `nextCursor`.

4) **Remove deep links**
   - Remove `/order/:id` routes and rely on `/orders` for customer order access.

## Alternatives Considered
- Keep only `/order/:id`: simple but not discoverable for order history.
- Add history tabs inside `/order/:id`: awkward navigation and no clear entry point.

## Consequences
- Requires a new customer orders list API and new web route at `/orders`.
- Removing `/order/:id` breaks existing deep links; any external references must be updated to `/orders`.
- Requires UI decisions for empty states and pagination UX.

## Implementation Tasks
- [x] Update checkout success redirects to `/orders` with selected order (currently `/order/:id` in `apps/web/src/components/public/public-menu-client.tsx`).
- [x] Remove `/order/[id]` route and replace with `/orders` hub UI.
- [x] Add customer orders list API endpoint (paginated, newest-first) and wire `/orders` UI to it.
- [x] Update/replace tests that target `/order/[id]` (`apps/web/tests/orders-hub.test.tsx`).
- [x] Update ADRs that mention `/order/[id]` (`docs/adr/ADR-033-ordering-and-payments.md`, `docs/adr/ADR-034-razorpay-payments.md`, `docs/adr/ADR-042-separate-customer-accounts-and-order-auth.md`).
- [x] Update web docs (`apps/web/CLAUDE.md`) to reflect `/orders` hub.

## Questions & Answers

### Questions for User
- Q1: What should be the hub route? (`/orders`, `/order`, or another path)
- Q2: Should we show orders **across all businesses** the customer ordered from, or only for the current QR business?
- Q3: Should we keep `/order/:id` as a deep link that redirects into the hub and preselects that order?
- Q4: How many orders should be shown by default (all, or paginated)? If paginated, what page size?

### Answers
- A1: '/orders'
- A2: all the order belonging to a customer
- A3: remove the `order/:id` routes
- A4: 10 orders page size, rest paginated.
