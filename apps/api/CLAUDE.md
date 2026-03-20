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
- API error/success payloads should be structured for toast consumption in frontend; do not design endpoint contracts around inline page text rendering.

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
- Added mixed refresh-cookie hardening in `src/routes/auth.ts`: reject ambiguous requests with `MIXED_REFRESH_COOKIES` and revoke both refresh cookies on logout when present.
- Strengthened QR auth guard checks in `src/routes/auth.ts` to enforce approved business + active table state and optional token age cap (`QR_TOKEN_MAX_AGE_DAYS`).
- Extended auth route tests for inactive-table rejection and mixed refresh-cookie rejection.
- Added QR token lifecycle rotation endpoint for approved businesses: `POST /api/business/tables/:tableId/qr/regenerate` in `src/routes/business.ts`.
- Rotation flow updates existing table QR token or creates one if missing; previous token becomes invalid by replacement.
- Added onboarding/business-route test coverage for QR regeneration and token change behavior.
- Added QR rotation audit model in Prisma (`QrCodeRotation`) with migration `20260319230000_qr_rotation_audit`.
- Extended regeneration flow to persist rotation history (`oldToken`, `newToken`, actor, reason) and optional grace expiry via `QR_OLD_TOKEN_GRACE_SEC`.
- Added rotation-history endpoint `GET /tables/:tableId/qr/rotations` and public QR grace-token resolution support in `src/routes/public.ts`.
- Started Layer 4 (ADR-007 accepted): added approved-business menu endpoints in `src/routes/business.ts` for category CRUD/reorder and menu-item CRUD/reorder/availability with pagination and decimal-string price validation.
- Added `tests/menuRoutes.test.ts` covering category/menu flows and approved-business gating.

## Updates 2026-03-20
- Added dedicated process health endpoint `GET /healthz` in `src/index.ts` for infrastructure probes.
- Docker compose health checks now target `/healthz` instead of user-facing routes, reducing root-route log noise.
- Seed credentials are now env-configurable in `prisma/seed.ts` using `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` (with safe defaults), documented in `.env.example`.
- Expanded Layer 4 API tests in `tests/menuRoutes.test.ts` to cover duplicate category conflicts (`CATEGORY_EXISTS`) and menu-item update error paths (`VALIDATION_ERROR`, `CATEGORY_NOT_FOUND`).
- Local setup note: creating `apps/api/.env` from `.env.example` is required for seed/migrate commands unless `DATABASE_URL` is passed inline.
- Logging architecture update: added singleton logger at `src/utils/logger.ts` and replaced API bootstrap `console.*` usage in `src/index.ts` with structured logger events.
- Endpoint observability update: request middleware now emits `http.request.start`, `http.request.finish`, and `http.request.aborted` with request-id, route metadata, duration, response bytes, client IP, and user context where available.
- Error-path logging update: global error handler now emits structured `http.request.error` events via logger; startup emits `api.server.started`.
- Added `LOG_LEVEL` to `.env.example` to control logger verbosity.
- Business resolution fix: `resolveBusinessForUser` in `src/middleware/businessApproval.ts` now prefers an approved business when no explicit business id is provided, preventing menu/category operations from being blocked by a newer pending profile.
- Added regression coverage in `tests/menuRoutes.test.ts` for mixed-status businesses (pending + approved) without `x-business-id` header.
- ADR-010 implementation: added subtle AI-assist suggestion endpoints under business scope in `src/routes/business.ts`:
  - `GET /menu-suggestions/categories` (top-5 common categories excluding existing names),
  - `GET /menu-suggestions/items?categoryId=...` (top-5 category-relevant items excluding existing names; includes dietary-tag hints).
- Added curated suggestion engine in `src/services/menuSuggestions.ts` with deterministic fallback behavior and filtered dietary tags.
- Extended `tests/menuRoutes.test.ts` with suggestion endpoint coverage (exclusion logic + dietary tags).
- ADR-011 implementation baseline: added singleton LLM client in `src/services/llmClient.ts` (lazy model-handle init, reused per API process).
- Added LLM-backed suggestion orchestrator in `src/services/llmMenuSuggestions.ts` with deterministic fallback (`menuSuggestions.ts`) when LLM key/call is unavailable.
- Added dedicated AI endpoint router `src/routes/ai.ts` and mounted it at `/api/ai` in `src/index.ts`; item suggestions now available at `GET /api/ai/menu/item-suggestions`.
- Updated business item-suggestion endpoint (`GET /api/business/menu-suggestions/items`) to use the same singleton-backed LLM/fallback service for backward compatibility.
- Added LLM env vars in `.env.example` (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MENU_MODEL`, `LLM_MENU_TIMEOUT_MS`) and singleton/fallback tests in `tests/llmMenuSuggestions.test.ts`.
- Timeout handling polish: `src/services/llmClient.ts` now logs LLM aborts as `ai.model.request.timeout` (info-level) instead of error-style stack dumps, while non-timeout failures remain concise warnings.
- Increased default LLM timeout in `.env.example` to `LLM_MENU_TIMEOUT_MS=4500` to reduce false aborts on slower model responses.
- Added explicit fallback-observability event `ai.menu_suggestions.fallback_used` in `src/services/llmMenuSuggestions.ts` to make LLM->deterministic fallback transitions visible.
- Suggestion continuity fix: `src/services/llmMenuSuggestions.ts` now requests a wider LLM candidate set (`limit * 6`, capped at 50) and trims after filtering/deduping, preventing repeated top-5 exhaustion.
- Deterministic fallback now backfills from a global deduped item pool when category-scoped list is exhausted (`src/services/menuSuggestions.ts`), so suggestions continue even after many existing items.
- Added service-level orchestration tests in `tests/llmMenuSuggestions.service.test.ts` for wide-candidate fetch behavior and fallback fill correctness.
- ADR-013 implementation: added `POST /api/ai/menu/item-description` in `src/routes/ai.ts` for AI-generated menu item descriptions with business/category scoping.
- Extended singleton LLM client in `src/services/llmClient.ts` with description generation support (`generateItemDescription`) while preserving timeout/error handling conventions.
- Added deterministic description fallback in AI route when LLM output is unavailable and added endpoint tests in `tests/aiRoutes.test.ts`.
- UX messaging policy alignment: backend responses should continue to provide concise, user-safe messages intended for toast notifications in web UI.
- ADR-014 implementation: `MenuItem` now persists `imagePath` (`image_path`) in Prisma, with migration `prisma/migrations/20260320043000_menu_item_image_path/migration.sql`.
- Added local S3-compatible storage service `src/services/objectStorage.ts` (MinIO-first defaults, bucket bootstrap, object upload, public URL resolution).
- Added provider image-generation adapter `src/services/aiImageProvider.ts` using Nano-Banana-style API contract (`NANOBANANA_*` envs) with timeout and resilient failure handling.
- Added image endpoints in `src/routes/business.ts`:
  - `POST /menu-items/:id/image/upload` (multipart image upload + DB path persistence),
  - `POST /menu-items/:id/image/generate` (AI generation + storage + DB path persistence).
- Menu-item responses now serialize derived `imageUrl` from stored `imagePath`; DB stores path only.
- Expanded `tests/menuRoutes.test.ts` with upload/generate image coverage and verified API test/build gates are green.
- ADR-015 implementation: added `DeletedAssetCleanup` queue model + migration to persist pending S3 deletion tasks for removed/replaced image paths.
- Added cleanup worker service `src/services/deletedAssetCleanup.ts` (periodic runner, optimistic claim, retry/backoff, structured logs) and boot wiring in `src/index.ts`.
- Added S3 delete capability in `src/services/objectStorage.ts` and wired enqueue behavior in `src/routes/business.ts` on image replacement and menu-item delete.
- Added cleanup worker env knobs in `.env.example`: `ENABLE_DELETED_ASSET_CLEANUP`, interval/batch/max-attempt/backoff controls.
- Added worker tests in `tests/deletedAssetCleanup.test.ts` and queue-enqueue assertions in `tests/menuRoutes.test.ts`.
- ADR-016 onboarding update: business slug is now server-generated from name and immutable on update (`SLUG_AUTO_GENERATED` / `SLUG_IMMUTABLE` validation paths in `src/routes/business.ts`).
- Added business currency persistence (`currencyCode` / `currency_code`) and normalized 3-letter uppercase validation in onboarding create/update routes.
- Added onboarding logo upload endpoint `POST /profile/logo` (multipart) in `src/routes/business.ts`, backed by S3 object storage and persisted to `business.logoUrl`.
- Added onboarding route tests for slug auto-generation uniqueness, slug immutability rejection, and profile logo upload behavior.
- ADR-017 implementation:
  - business lifecycle now includes `archived` state with `archived_at` and `archived_previous_status`,
  - added owner endpoints `PATCH /profile/archive` and `PATCH /profile/restore`,
  - restore enforces retention window (`BUSINESS_ARCHIVE_RETENTION_DAYS`).
- Added archived-business cleanup worker `src/services/archivedBusinessCleanup.ts`:
  - permanently deletes archived businesses older than retention threshold,
  - writes audit rows to `archived_business_deletion_audits`,
  - enqueues menu/logo asset paths into `deleted_asset_cleanups` for deferred S3 deletion.
- Added archive lifecycle env knobs in `.env.example` and test coverage in `tests/archivedBusinessCleanup.test.ts` plus onboarding-route archive/restore tests.
- Layer 4 completion update in `src/routes/business.ts`:
  - `GET /menu-items` now supports optional `categoryId` filtering with category ownership validation.
  - Category/item reorder endpoints now normalize `sortOrder` to contiguous `0..N-1` values using payload order.
  - Reorder payload validation now rejects duplicate IDs.
- Added API regression coverage in `tests/menuRoutes.test.ts` for category-filtered item listing and contiguous reorder normalization behavior.
