# apps/api — Express Backend

## What this is
REST API server built with Express + TypeScript. Handles auth, menu CRUD, table/QR management, orders, payments (Stripe), and admin operations.

## Commands
```bash
pnpm dev          # start dev server with hot reload (tsx watch) on :4000
pnpm build        # compile TypeScript to dist/
pnpm db:migrate   # run Prisma migrations
pnpm db:push      # push schema to DB without migration (dev only)
pnpm db:generate  # regenerate Prisma client after schema changes
pnpm db:seed      # seed admin user
pnpm db:studio    # open Prisma Studio GUI
```

## Conventions
- All route handlers use `asyncHandler()` wrapper from `src/utils/asyncHandler.ts` to catch async errors
- API responses follow `{ success: boolean, data?, error? }` shape from `@scan2serve/shared`
- Route files export an Express Router, mounted in `src/index.ts`
- Business logic lives in `src/services/`, routes are thin controllers
- Validation uses Zod schemas
- Auth middleware in `src/middleware/` — `requireAuth` and `requireRole(role)`

## Database
- Prisma ORM, schema at `prisma/schema.prisma`
- All table/column names use snake_case in DB, camelCase in code (Prisma `@map`)
- Price fields use `Decimal(10,2)` — never use floats for money

## Environment
- Copy `.env.example` to `.env` and fill in values
- `DATABASE_URL` must point to a running PostgreSQL instance

## Updates 2026-03-19
- Implemented auth foundations: refresh-token cookies, `requireAuth/requireRole` middleware, auth routes, response helpers with `status` 1/0, and Prisma `refresh_tokens` table.
- Added `.env.example` with JWT/cookie/TTL settings; added cookie-parser dependency.
- Added Vitest setup; auth unit tests pass. Route-level tests are present but skipped in sandbox (Express router mock hangs without sockets); run or adapt in a permissive env.
- Reworked `tests/authRoutes.test.ts` to remove `describe.skip` and run in sandbox without sockets by invoking route handlers directly from `authRouter.stack` with `node-mocks-http`.
- API test suite now runs fully in this environment (`authService` + `authRoutes`, 6/6 passing).
- Added Layer 3 backend routes: `src/routes/business.ts` (profile create/list/get/update + gated ops probe) and `src/routes/admin.ts` (business list/approve/reject).
- Added business approval middleware in `src/middleware/businessApproval.ts` with ADR error codes: `BUSINESS_PROFILE_REQUIRED`, `BUSINESS_PENDING_APPROVAL`, `BUSINESS_REJECTED`.
- Updated Prisma schema for multi-business support and rejection history (`BusinessRejection` model; removed unique user-to-business constraint).
- Added `tests/onboardingRoutes.test.ts` to validate onboarding lifecycle, admin moderation transitions, and route gating states.
- Docker compose diagnostics: `docker-compose up --build` currently fails in non-interactive containers because `pnpm install` aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` unless `CI=true` is passed into the container environment.
- Verified API container path with `CI=true`: install + `prisma db push` + API dev boot succeeds (`[api] Server running on http://localhost:4000`).
- Compose fix applied in `docker-compose.yml`: added `CI=true` + `PNPM_CONFIG_CONFIRM_MODULES_PURGE=false` for service startup; API now cleanly reaches healthy state in full compose boot.
- Added migration baseline files for current schema (`prisma/migrations/20260319190000_init/migration.sql`, `prisma/migration_lock.toml`) and regenerated Prisma client.
- Fixed API build typing blockers (`src/utils/asyncHandler.ts`, `src/index.ts`, `src/routes/auth.ts`, `src/prisma.ts`) so `pnpm --filter @scan2serve/api build` now succeeds.
- Compose healthcheck probe updated to `http://127.0.0.1:4000/api/health` to avoid IPv6 localhost false negatives.
- ADR-006 baseline implemented in `src/routes/auth.ts`: shared auth endpoints now require `qrToken` context for `role=customer` and reject non-QR customer auth with `CUSTOMER_AUTH_QR_ONLY`.
- Added QR customer cookie isolation (`qr_customer_access`, `qr_customer_refresh`) so business auth middleware remains bound to existing business cookies.
- Added `ENABLE_CUSTOMER_QR_AUTH` in `.env.example` for environment-level QR customer auth toggling.
- Added public QR resolve route `GET /api/public/qr/:qrToken` in `src/routes/public.ts` and mounted it from `src/index.ts` for token -> business/table context resolution.
- Extended auth route tests with customer-login tamper blocking and added public-route tests (`tests/publicRoutes.test.ts`).
- Expanded Prisma seed (`prisma/seed.ts`) to create reproducible QR smoke-test context (`seed-qr-biz`, table 1, `valid-qr-live-token-123456`).
- Added in-memory QR customer-auth rate limiting (`src/middleware/qrAuthRateLimit.ts`) and applied it to customer register/login paths in `src/routes/auth.ts`.
- Added QR auth rate-limit env knobs in `.env.example` (`QR_AUTH_RATE_LIMIT_WINDOW_SEC`, `QR_AUTH_RATE_LIMIT_MAX_ATTEMPTS`).
- Added API test coverage for rate-limit behavior on repeated bad QR customer-auth attempts.
