# apps/api — Express Backend

## What this is
REST API server built with Express + TypeScript. Handles auth, menu CRUD, table/QR management, orders, payments (Razorpay), and admin operations.

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
- ADR-020 established Gemini provider-switch support in `src/services/aiImageProvider.ts`; this path is now superseded by ADR-022 (Gemini-only runtime).
- Added Gemini provider env variables to `.env.example`: `GEMINI_API_KEY`, `GEMINI_API_URL`, `GEMINI_IMAGE_MODEL`.
- Added provider-level tests in `tests/aiImageProvider.test.ts` covering Gemini success path, missing-config handling, and unsupported-provider fallback behavior.
- ADR-021 accepted and implemented: added shared AI guardrail service (`src/services/aiGuardrails.ts`) with deterministic unsafe-content checks and generated-text sanitization helpers.
- Guardrails are now enforced in text and image generation routes (`src/routes/ai.ts`, `src/routes/business.ts`) with `AI_PROMPT_UNSAFE` request blocking and sanitized/fallback-safe text descriptions.
- Added regression tests in `tests/aiRoutes.test.ts`, `tests/menuRoutes.test.ts`, and `tests/aiGuardrails.test.ts` for unsafe-input rejection and text sanitization behavior.
- ADR-022 accepted and implemented: menu image generation runtime is now Gemini-only in `src/services/aiImageProvider.ts`; Nano-Banana/provider-switch branches were removed.
- Runtime config cleanup: removed `AI_IMAGE_PROVIDER` and `NANOBANANA_*` expectations from API env surface; image generation now depends on `GEMINI_API_KEY`, `GEMINI_API_URL`, `GEMINI_IMAGE_MODEL`, `AI_IMAGE_TIMEOUT_MS`.
- Docker runtime note: for local compose, API now reads `./apps/api/.env` via `env_file`; avoid setting `GEMINI_API_KEY: ""` in compose `environment` because it overrides env-file values and causes immediate `AI_IMAGE_GENERATION_FAILED` responses.
- ADR-019 accepted and implemented for Layer 5 API contracts in `src/routes/business.ts`:
  - `GET /tables` (pagination + inactive filter + QR metadata),
  - `POST /tables/bulk` (sequential table creation with QR issuance),
  - `PATCH /tables/:tableId` (label + active toggle),
  - `GET /tables/:tableId/qr/download` (single PNG/SVG),
  - `POST /tables/qr/download` (batch ZIP export).
- Added ZIP utility `src/utils/simpleZip.ts` (store-mode zip builder) to support batch QR downloads without external runtime deps.
- Added Layer 5 route tests in `tests/tableRoutes.test.ts` covering list/bulk/patch and single/batch QR download response contracts.
- Prisma observability update: `src/prisma.ts` now routes DB query logging through singleton `logger` when `PRISMA_LOG_QUERIES=true` (event-based Prisma query logs).
- Added `PRISMA_LOG_QUERIES=false` to `.env.example` as the runtime toggle for SQL query logging.
- Auth scope resolution update in `src/routes/auth.ts`: `/api/auth/*` now stays unified and resolves customer-vs-business scope from `qrToken` validity (body/query/header), rather than requiring separate route namespaces.
- Refresh/me/logout semantics now use scoped cookie selection in `src/routes/auth.ts`; mixed cookie presence no longer hard-fails by default when scope is deterministically resolved.
- Updated `tests/authRoutes.test.ts` to align with qrToken-validity scope behavior (invalid/inactive QR context falls back to non-customer scope and rejects customer-intent requests with `CUSTOMER_AUTH_QR_ONLY`).
- Customer-session cookie-path fix in `src/routes/auth.ts`: `qr_customer_access` is now set with `path=/` (was `/qr`) so `/api/auth/me` can read customer access tokens reliably without falling back to business identity.
- This preserves separate cookie names for customer/business (`qr_customer_*` vs standard tokens) while preventing apparent token overwrite/mix issues during shared-browser sessions.
- ADR-024 implementation in `src/routes/auth.ts`:
  - added `GET /api/auth/sessions` to expose both currently valid access-token sessions (`businessUser`, `customerUser`) plus `activeScope`,
  - extended `POST /api/auth/logout` to accept optional `{ scope: "business" | "customer" | "all" }` for explicit scoped logout in mixed-session scenarios.
- Added auth route tests in `tests/authRoutes.test.ts` for dual-session introspection and scoped logout behavior.
- Runtime verification note: `/api/auth/sessions` reports both `businessUser` and `customerUser` independently from access cookies; `activeScope` follows qrToken-context resolution, so without QR context it remains `business` even when only customer session is still active.

## Updates 2026-03-24
- Added public menu endpoint `GET /api/public/menu/:slug` that validates approved/non-archived business, optional active table, and QR/grace tokens, returning sorted categories/items with derived image URLs and decimal-string prices.
- Expanded `apps/api/tests/publicRoutes.test.ts` with public menu coverage; API test suite passes.

## Updates 2026-03-27
- Implemented business order management endpoints in `src/routes/business.ts`: `GET /orders` (status filter + cursor pagination), `GET /orders/:id` detail, and `PATCH /orders/:id/status` with status transition validation.
- Added order-event publisher service at `src/services/orderEvents.ts` and wired best-effort event emission for public order create, Razorpay verify, and business status updates.
- Added Layer 8 API coverage in `tests/orderManagementRoutes.test.ts`.
- Implemented ADR-037 org+RBAC backend: org/org-invite/membership endpoints in `src/routes/business.ts`, org membership + business membership tables in Prisma schema, and role gating for menu/table/admin actions.
- Updated business resolution (`requireApprovedBusiness`) to respect business memberships and attach `req.businessRole`.
- Added API test coverage for org invite flows and updated existing tests to include business membership mocks.
- Fixed Prisma schema relation by adding `Business.memberships` for `BusinessMembership`.
- Added org membership lookup + org creation API tests in `tests/orgInviteRoutes.test.ts`.
- Stabilized API tests: added business membership mocks in `tests/aiRoutes.test.ts`, hoisted org-invite prisma store, and added Decimal fallback setup in `tests/publicRoutes.test.ts`.
- Added business-role gating for order management endpoints so only `owner`/`manager`/`staff` can list, view, or update orders.

## Updates 2026-03-29
- Added org-member listing endpoint (`GET /api/business/org/members`) and business membership listing (`GET /api/business/memberships?businessId=...`) for RBAC assignment UI.
- `/api/business/profiles` now includes `businessRole` per business (membership role or owner fallback) for frontend gating.
- Extended org-invite API tests to cover org-member listing and business membership listing responses.
- Stabilized API tests: mocked `@prisma/client` in `tests/publicRoutes.test.ts` to avoid missing generated client errors and updated org-invite mocks to include `business.userId` for membership listing.
- Fixed Vitest mock hoisting error by moving Decimal mock into `vi.hoisted` in `tests/publicRoutes.test.ts`.
- Org invites no longer accept a role; invite creation now defaults org role to `staff` and business roles are assigned at business-access grant time.
- Added business membership removal endpoint (`DELETE /api/business/memberships`) with owner/manager role constraints and test coverage.

## Updates 2026-03-24
- Business profile updates from approved businesses now move the business back to `pending` status for admin re-approval (no slug changes allowed). Patch route `/api/business/profile` sets `status=pending` when current status is `approved` or `rejected`.
- API test suite re-run and passing.

## Updates 2026-03-24
- ADR-028 accepted: added `blocked` flag and business update request queue model.
- `Business` now has `blocked` boolean; middleware returns `BUSINESS_BLOCKED` for blocked businesses.
- Approved-business profile edits are queued in `business_update_requests` and do not block live data; pending/rejected keep prior behavior.
- Admin endpoints added: list/approve/reject update requests and block/unblock businesses.
- Prisma schema updated (new enum/table). API test suite passes.

## Updates 2026-03-24
- Added business notifications table and owner-facing `GET /api/business/notifications` (last 50) including business name/type/message/payload.
- Admin approve/reject/block/unblock actions now emit notifications to the business owner.
- API tests re-run and still passing (13 files, 66 tests).

## Updates 2026-03-24
- ADR-029 accepted: added `notification_events` (history) and `notification_inbox` (unread) tables with indexes.
- Admin moderation actions now emit event + inbox entries with actor attribution.
- Business notification endpoints now support scope unread/all, mark-read, and mark-all; responses include unread count and inbox id for mark-read.

## Updates 2026-03-24
- ADR-030 accepted: removed legacy `business_notifications` Prisma model and relations; schema now uses only `notification_events` + `notification_inbox`.

## Updates 2026-03-24
- Admin approve/reject now emits notification events + inbox entries (`BUSINESS_APPROVED`/`BUSINESS_REJECTED`).

## Updates 2026-03-24
- Added admin notifications endpoints and emission for business submissions and update requests.

## Updates 2026-03-24
- ADR-032 approved: pending UX-only changes for notifications and blocked banners (no API changes yet).

## Updates 2026-03-26
- Added CSRF utilities (`src/utils/csrf.ts`) and global CSRF middleware (`src/middleware/csrf.ts`) enforced on mutating routes.
- Added `GET /api/auth/csrf` to issue CSRF token cookie + payload for client use.
- Added API test coverage for CSRF middleware (`tests/csrfMiddleware.test.ts`).
- Added colored log output in `src/utils/logger.ts` (disable with `LOG_COLOR=false`).

## Updates 2026-03-24
- Layer 7 ordering endpoints updated: `POST /api/public/orders` now enforces server-side price calculation with normalized item quantities (item id + quantity only).
- Order checkout now includes menu item names in Stripe line items, supports `{ORDER_ID}` env URL templates, and returns order details with business currency data.
- Added Stripe webhook router (`src/routes/payments.ts`) using raw body parsing to mark orders paid/failed; mounted before JSON middleware in `src/index.ts`.
- Added Stripe env keys to `.env.example`; added API tests for order creation totals and webhook handling.

## Updates 2026-03-24
- Replaced Stripe checkout/webhook flow with Razorpay order creation + signature verification (`/api/public/orders/:id/checkout`, `/api/public/orders/:id/verify-payment`).
- Removed Stripe service/router and raw-body webhook mount; added Razorpay service (`src/services/razorpay.ts`) and Razorpay env vars in `.env.example`.
- Order schema now stores `razorpay_order_id` + `razorpay_payment_id` (migration `20260324180000_razorpay_payments`); public route tests cover Razorpay checkout + verify.

## Updates 2026-03-29
- Implemented ADR-038 roleless org membership: removed org role checks, org invites now require org owner or any business owner/manager in the org, and org membership responses now include `isOwner` (apps/api/src/routes/business.ts).
- Business access management now requires owner/manager role for the selected business (managers limited to staff) and org owner checks use `org.ownerUserId` instead of membership roles.
- Prisma schema + migration updated to drop `OrgRole` and role columns from org memberships/invites (apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260329120000_roleless_org_memberships).
