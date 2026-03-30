# ADR-042: Separate Customer Accounts + Order Auth Requirement

- Status: Accepted
- Date: 2026-03-30

## Context
- Business/admin users and QR-scoped customers currently share the same `users` table.
- This prevents creating a customer account with the same email as a business account.
- Product requires customer identity to place orders so order history and status can be tied to a login.

## Decision (Proposed)
1) **Separate account storage**
   - Introduce a dedicated `customer_users` table for QR-scoped customer identities.
   - Keep `users` table for business/admin only.
   - Customer auth cookies remain QR-scoped; business auth remains unchanged.

2) **Order placement requires customer login**
   - `POST /api/public/orders` requires a valid customer session.
   - If unauthenticated, return `401` with `CUSTOMER_AUTH_REQUIRED`.

3) **Order ownership**
   - `orders` will reference `customer_user_id` (nullable if migration needs backward compatibility).
   - Customer orders hub (`/orders`) and order detail (`/api/public/orders/:id`) verify the requesting customer matches the order owner.

4) **Migration/compatibility**
   - Existing orders without `customer_user_id` remain visible to business dashboards.
   - Public order status view requires login once migration is complete.

## Alternatives Considered
- **Single users table + role**: simpler, but blocks same-email customer + business accounts.
- **Guest order tokens**: avoid login but weakens identity persistence; harder to manage account history.

## Consequences
- Requires new Prisma model, auth routes for customer users, and updates to order creation/lookup.
- Adds data migration complexity if existing customer records exist in `users`.

## Questions & Answers

### Questions for User
- Q1: Do you want customer accounts to be **email-only**, or support phone as primary identity?
- Q2: Should customer login be **required for all orders** (cash + Razorpay), or only online payments?
- Q3: Should `/orders` (and order detail API) require login, or allow a fallback via one-time token?
- Q4: For existing customer sessions (from current `users` table), do we migrate them into `customer_users` or force re-register?

### Answers
- A1: Register the customer with either email or phone number.
- A2: Login is required for all orders.
- A3: `/orders` must require login and only the customer who placed the order can view details.
- A4: We'll reset persistence/seed the DB, so no legacy migration is needed.
