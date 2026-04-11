# packages/shared — Shared Types & Constants

## What this is
Shared TypeScript types, constants, and validators used by both `apps/web` and `apps/api`. Imported as `@scan2serve/shared`.

## How to use
```ts
import { UserRole, OrderStatus, ORDER_STATUS_FLOW } from "@scan2serve/shared";
```

## What belongs here
- TypeScript type definitions shared between frontend and backend
- Enums and constants (order status flow, dietary tags, etc.)
- Validation schemas (if using Zod, shared validators can live here)
- Shared API feedback message contracts should remain concise and suitable for toast presentation in frontend.

## What does NOT belong here
- React components (frontend only)
- Database models or Prisma types (backend only)
- Environment-specific config

## Updates 2026-03-19
- Updated API response types to include `status: 1|0` and structured `error`; added `UserProfile` type for auth responses.
- Extended shared business types to include `updatedAt` and `BusinessRejection[]` on `BusinessProfile`.
- Extended auth request payload types with optional `qrToken` on login/register to support ADR-006 shared-endpoint QR customer auth context.
- Updated `MenuItem.price` shared type to `string` to align with Layer 4 decimal-string API contract.
- UX messaging policy alignment: shared response/message shapes are intended for toast-based notifications in UI, not inline page text alerts.
- Menu item image contract now includes persisted `imagePath` (S3 object key/path) while `imageUrl` remains derived/render-oriented in API responses.
- Business shared profile contract now includes `currencyCode` for onboarding/admin/dashboard flows.
- Business shared lifecycle contract now includes `archived` status and optional `archivedAt` for dashboard archive/restore behavior.

## Updates 2026-03-24
- Order shared types now represent monetary values as strings; `CreateOrderRequest` only accepts item ids + quantities (no client prices).

## Updates 2026-03-24
- Order shared type now uses Razorpay fields (`razorpayOrderId`, `razorpayPaymentId`) instead of Stripe.

## Updates 2026-03-27
- Added shared org/business RBAC types (`OrgRole`, `OrgInviteStatus`, `BusinessRole`) plus org/membership interfaces.
- Extended notification type union to include org invite and business-access events.

## Updates 2026-03-29
- Added `BusinessProfile.businessRole` plus `OrgMemberSummary` and `BusinessMemberSummary` types to support RBAC assignment UI.
- Removed `OrgRole` and org role fields from shared types; org membership and org member summaries now expose `isOwner` instead of role to support roleless org membership.

## Updates 2026-03-29
- Added `paymentMethod` and `unpaid` payment status to shared order types to support cash orders.

## Updates 2026-03-30
- Auth request types now allow phone identifiers for customer login/register (`LoginRequest`, `RegisterRequest`).
- Added customer orders hub response types (`CustomerOrderSummary`, `CustomerOrdersListResponse`).

## Updates 2026-04-04
- Added `countryCode` + `timezone` to `BusinessProfile` for analytics windowing.
- Added shared analytics request/response types (`AnalyticsSectionRequest`, `AnalyticsSectionResponse`, windows/sources/series/summary).

## Updates 2026-04-09
- Added `StatusActorInfo`/`StatusActors` types and attached `statusActors` to `Order` to support per-status `{ userId, email }` actor metadata.

## Updates 2026-04-10
- Redesigned shared analytics types for ADR-050: dashboard vs orders sections, summary/detail granularity, and expanded analytics detail structures (`packages/shared/src/types.ts`).
- Added shared review types for ADR-052 (review list items, summary, scope, and customer order review id) (`packages/shared/src/types.ts`).

## Updates 2026-04-10
- Added dashboard analytics summary fields for revenue growth and avg items per order (`packages/shared/src/types.ts`).

## Updates 2026-04-10
- Added shared review analytics summary/detail types for dashboard analytics (`packages/shared/src/types.ts`).

## Updates 2026-04-11
- Added `PaymentActors` and attached `paymentActors` to shared `Order` type for mark-paid attribution (`packages/shared/src/types.ts`).
