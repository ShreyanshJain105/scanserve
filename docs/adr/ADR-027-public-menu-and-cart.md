# ADR-027: Public Menu & Cart (Layer 6)

- Status: Accepted
- Date: 2026-03-24

## Context

Layer 6 in the feature pyramid is the public, customer-facing menu and cart experience reached primarily through QR codes. Current implementation stops at QR resolution (`/qr/[qrToken]` -> `/menu/[slug]`) with placeholder menu UI and no cart. Customer auth is already QR-scoped (ADR-006, ADR-023–025); the next step is to define read-only public menu delivery and client-side cart behavior without stepping into ordering/payments (Layer 7).

## Decision

- **Public menu delivery:**
  - Serve `/menu/[slug]` via SSR using the resolved business slug and optional table/qrToken query params.
  - Add a read-only public API endpoint `GET /api/public/menu/:slug` (optionally `?tableId=...&qrToken=...`) that returns categories and items for approved, non-archived businesses only. Reject inactive tables or invalid/expired QR contexts with ADR-006 error codes when table context is provided.
  - Responses include `currencyCode`, category list with sort order, and items with `id`, `name`, `description`, `price` (decimal string), `dietaryTags`, `imageUrl` (derived), and `isAvailable`.

- **Cart scope and storage:**
  - Cart lives client-side (localStorage) keyed by `businessSlug|tableId|qrTokenVersion`, so carts stay isolated across tables and QR rotations.
  - Cart operations: add, increment/decrement quantity, remove item, clear cart. Block adding unavailable items; clamp quantity to `>=1` and max of a configurable limit (default 20) to avoid runaway payloads.
  - When QR/table context changes (different token or table), the cart resets automatically.

- **Auth and UX integration:**
  - Maintain route-based auth dialogs (`/qr/login`, `/qr/register`) with history-first close; surface scoped login/logout via existing header customer mode (ADR-024/025) but allow anonymous carting.
  - If a customer session exists and a QR token is present, prefill customer identity for Layer 7 handoff but do not block cart use when unauthenticated.

- **Out-of-scope (deferred to Layer 7):** order submission, payment initiation, order status polling, and persisted server-side carts.

## Consequences

- New public menu endpoint adds server enforcement for business/table/QR validity, reducing client-only trust on availability and context.
- Client-side cart isolation by slug+table+token prevents cross-table leakage and naturally clears on QR rotation changes.
- Layer 7 can build on this by revalidating cart contents server-side before creating orders and by optionally persisting carts.

## Testing

- API: public menu endpoint rejects inactive/archived businesses and inactive tables; accepts approved business + active table; returns sorted categories/items with correct decimal price serialization and availability flags.
- Web: `/menu/[slug]` renders menu data from the public endpoint; cart add/increment/decrement/remove flows work and persist across reload for the same slug/table/token; cart clears when navigating to a different table or QR token. Dialog close behavior remains history-first for QR auth routes.
