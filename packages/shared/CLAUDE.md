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

## What does NOT belong here
- React components (frontend only)
- Database models or Prisma types (backend only)
- Environment-specific config

## Updates 2026-03-19
- Updated API response types to include `status: 1|0` and structured `error`; added `UserProfile` type for auth responses.
- Extended shared business types to include `updatedAt` and `BusinessRejection[]` on `BusinessProfile`.
- Extended auth request payload types with optional `qrToken` on login/register to support ADR-006 shared-endpoint QR customer auth context.
