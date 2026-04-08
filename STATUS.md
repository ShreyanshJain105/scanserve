# Project Status

> **How this file works:**
> - **Last Session** — overwritten each session. This is what a new Claude reads first for fast pickup.
> - **Timeline** — append-only log. Never delete or modify past entries. New entries go at the bottom.
> - **Decisions Log** — append-only. All ADRs recorded here.

---

## Last Session

**Date:** 2026-04-09
**What was done:**
- Accepted ADR-047 to store order status actors as `{ userId, email }` objects per status key in `status_actors`.
- Added status-actor normalization utility and updated API status update + order snapshot serialization to use the new object shape (`apps/api/src/utils/statusActors.ts`, `apps/api/src/routes/business.ts`, `apps/api/src/services/orderEvents.ts`).
- Updated orders dashboard timeline to render actor labels from `{ userId, email }` entries with legacy string fallback (`apps/web/src/app/dashboard/orders/page.tsx`).
- Updated orders status transition handler to merge the full API order payload so actor data refreshes immediately after status changes (`apps/web/src/app/dashboard/orders/page.tsx`).
- Added shared `StatusActorInfo`/`StatusActors` types and attached `statusActors` to `Order` (`packages/shared/src/types.ts`).

**What's NOT done yet:**
- Run API/web test suites to validate the new statusActors shape and UI refresh behavior.

**Next step:**
1. Run targeted tests (`pnpm --filter @scan2serve/api test`, `pnpm --filter @scan2serve/web test`) and fix any regressions.

**Build progress:**
```
Layer 1:  Foundation          ✅ DONE
Layer 2:  Authentication      ✅ DONE
Layer 3:  Business Onboarding ✅ DONE
Layer 4:  Menu Management     ✅ DONE
Layer 5:  Table & QR Codes    ✅ DONE
Layer 6:  Public Menu & Cart  ✅ DONE
Layer 7:  Ordering & Payments ✅ DONE
Layer 8:  Order Management
Layer 9:  Business Dashboard
Layer 10: Admin Panel
Layer 11: Polish & Deploy
```

---

## Timeline

### 2026-03-19 — Session 2: CLAUDE-aware skill
- Added `skills/claude-context-programmer` to bake CLAUDE.md + STATUS workflows into coding tasks and context handoff.
- Reviewed existing CLAUDE.md guidance; no feature implementation this session.
- Regenerated `agents/openai.yaml` for the skill and installed PyYAML in local `.venv` to support skill scripts.

### 2026-03-19 — Session 3: Auth implementation
- Implemented auth stack with access/refresh httpOnly cookies, refresh rotation, status=1/0 responses, and Prisma `refresh_tokens`.
- Added API auth routes + middleware, response helpers, cookie-parser, env sample.
- Added frontend auth context, API client with refresh retry, login/register/business-register pages, dashboard placeholder, and web env sample.
- Added testing mandate note to root CLAUDE.md: unit + integration/e2e required with new features.
- Added Vitest + supertest/testing-library setups and initial auth tests; ADR-003 recorded in docs/adr.
- Ran `pnpm install --no-frozen-lockfile`; API tests: unit pass, route-level specs skipped in sandbox; Web tests pass.

### 2026-03-19 — Session 4: Layer 3 planning alignment
- Updated STATUS "Last Session" and build progress to reflect Layer 2 auth as complete.
- Drafted ADR-004 (`docs/adr/ADR-004-business-onboarding.md`) to define Business Onboarding architecture and approval gate.
- Set Layer 3 as the implementation next step pending ADR approval.

### 2026-03-19 — Session 5: ADR-004 regeneration
- Regenerated ADR-004 with explicit API contracts, lifecycle transitions, business-feature gating behavior, and required test scope.
- Updated `docs/CLAUDE.md` and root `CLAUDE.md` with ADR refresh context.
- No feature code implemented; waiting for ADR approval before Layer 3 development.

### 2026-03-19 — Session 6: ADR ambiguity checklist
- Regenerated ADR-004 to include 10 explicit ambiguity questions that must be answered in-ADR before approval.
- Updated `docs/CLAUDE.md` and root `CLAUDE.md` notes to reflect the new review gate.
- No feature code implemented; waiting for user answers and ADR acceptance.

### 2026-03-19 — Session 7: Auth route tests unblocked in sandbox
- Reworked `apps/api/tests/authRoutes.test.ts` to run without socket binding by invoking auth route handlers directly from router stack with `node-mocks-http`.
- Removed static skip from auth route suite and adjusted assertions for validation and token mint behavior.
- Verified API test suite in sandbox: `pnpm --filter @scan2serve/api test` passes (2 files, 6 tests).

### 2026-03-19 — Session 8: ADR-004 answers consolidated
- Updated ADR-004 by writing all 10 open-question answers directly in the ADR as concrete implementation decisions.
- Clarified middleware failure contract, admin list default behavior, dashboard lock UX, login-time status fetch policy, and test execution policy.
- Updated `docs/CLAUDE.md` and root `CLAUDE.md`; no feature code implemented yet.

### 2026-03-19 — Session 9: ADR accepted + Layer 3 implementation
- Marked ADR-004 as `Accepted`.
- Added Layer 3 API routes (`business`, `admin`) and business-approval middleware with explicit ADR error codes.
- Updated Prisma schema for multi-business support and rejection history model (`BusinessRejection`).
- Implemented web onboarding/status UX (`/dashboard` lock states + `/dashboard/onboarding` create/edit flow).
- Added onboarding route tests for API and dashboard gating tests for web; API and web test suites pass.

### 2026-03-19 — Session 10: Docker compose diagnostics
- Ran `docker-compose up --build` and captured startup failures.
- Confirmed first blocker: `pnpm install` aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` in `api`/`web` containers without `CI=true`.
- Confirmed second blocker: web compose command forwards invalid args to Next (`Invalid project directory ... /--hostname`).
- Verified API startup succeeds when run with explicit `CI=true` and db push in one-off compose run.

### 2026-03-19 — Session 11: Docker compose fixes applied
- Updated `docker-compose.yml` to make startup non-interactive-safe and corrected web command argument forwarding.
- Added service healthchecks and health-based dependency ordering.
- Verified full stack boot from clean `docker-compose down -v` then `docker-compose up --build`: db/api/web all started successfully.

### 2026-03-14 — Session 1: Project Scaffolding
- Initialized pnpm monorepo with workspace config
- Scaffolded Express + TypeScript backend (`apps/api/`)
- Scaffolded Next.js 15 + Tailwind frontend (`apps/web/`)
- Created shared types package (`packages/shared/`) with all entity types, order flow constants, dietary tags
- Set up Prisma schema with 8 models: users, businesses, categories, menu_items, tables, qr_codes, orders, order_items
- Added ESLint + Prettier at root
- Created CLAUDE.md in root, apps/api, apps/web, packages/shared
- Verified API health endpoint working
- Initial commit `3ac7e00` on `main`

### 2026-03-19 — Session 12: Full stabilization + compose healthcheck fix
- Added migration baseline files for current Prisma schema and regenerated Prisma client.
- Fixed baseline build blockers (API async handler typing, Prisma client import typing, and web Vitest config typing), then verified both app builds pass.
- Added admin moderation page and improved onboarding/dashboard status UX consistency.
- Diagnosed compose false-unhealthy web status as IPv6 localhost probe failure (`::1`) and switched API/web healthcheck URLs to `127.0.0.1`.
- Reverified compose stack health via `docker-compose ps`: `db`, `api`, and `web` all healthy.

### 2026-03-19 — Session 13: ADR-006 accepted + QR-scoped customer auth baseline
- Replaced ADR-005 with ADR-006 as accepted source of truth for customer-auth policy.
- Implemented shared-endpoint QR enforcement in auth routes: `role=customer` now requires valid `qrToken` context.
- Added QR-scoped customer cookie names and kept business auth cookie path unchanged.
- Converted `/register` to business-only redirect and added QR auth route pages (`/qr/[qrToken]`, `/qr/login`, `/qr/register`).
- Updated shared request types and auth-context helpers for QR customer auth payloads.
- Verified API/web tests and builds pass after changes.

### 2026-03-19 — Session 14: Full runtime smoke test + web main-page fix
- Reproduced runtime 500s on web main route and diagnosed Next chunk resolution failures in container logs.
- Fixed by isolating Next build artifacts in docker-compose (`web-next-cache` volume for `/app/apps/web/.next`), then recreating web service.
- Re-ran full live smoke matrix for web/API/auth/QR flows; all requested checks pass after fix.

### 2026-03-19 — Session 15: QR resolve endpoint + container SSR routing fix
- Added public QR resolve API route and wired web `/qr/[qrToken]` to server-side resolve + redirect into `/menu/[slug]`.
- Added minimal `/menu/[slug]` placeholder page for resolved QR destination.
- Expanded API tests with public QR route coverage and customer login tamper-case coverage.
- Extended DB seed with deterministic QR context for reproducible local runtime checks.
- Fixed docker SSR API routing by adding `API_INTERNAL_URL` for web container server-side fetches; verified `/qr/:token` redirect works in compose.

### 2026-03-19 — Session 16: ADR-006 rate-limit hardening
- Added QR customer-auth rate limiter middleware and wired it into customer register/login handlers.
- Added env-configurable thresholds and API tests that validate `QR_AUTH_RATE_LIMITED` behavior.
- Revalidated full API/web test and build suites after hardening changes.

### 2026-03-19 — Session 17: ADR-006 tamper + state guard hardening
- Added mixed refresh-cookie protection (`MIXED_REFRESH_COOKIES`) and dual-token logout revocation behavior.
- Strengthened QR auth guard to enforce approved business and active table checks plus optional token age cap.
- Expanded auth route tests for mixed-cookie and inactive-table rejection paths; full test/build suites remain green.

### 2026-03-19 — Session 18: ADR-006 QR rotation endpoint
- Added approved-business QR regeneration endpoint for table tokens and integrated token replacement behavior.
- Added API test coverage validating token regeneration updates for a table.
- Revalidated full API/web test and build suites.

### 2026-03-19 — Session 19: ADR-006 optional lifecycle enhancements
- Added Prisma `QrCodeRotation` model + migration for QR token rotation audit trail.
- Added rotation history endpoint and grace-window resolution path for old QR tokens in public lookup.
- Added tests for rotation listing and grace-token public resolution.
- Regenerated Prisma client and revalidated full API/web test + build suite.

### 2026-03-19 — Session 20: ADR-007 accepted + Layer 4 implementation start
- Accepted ADR-007 and implemented business menu/category API endpoints with approved-business gating.
- Added Layer 4 API tests (`menuRoutes.test.ts`) and dashboard menu page baseline (`/dashboard/menu`) with web test coverage.
- Updated shared menu price contract to decimal string.
- Revalidated API/web tests and builds successfully.

### 2026-03-20 — Session 21: Health endpoints + Layer 4 UI parity pass
- Added dedicated `/healthz` endpoints for API and web and moved docker-compose healthchecks to those paths.
- Extended `/dashboard/menu` to include category rename/delete/reorder and menu item edit/delete plus pagination controls.
- Updated web menu tests with pagination interaction coverage.
- Revalidated API/web tests and build pipelines successfully.

### 2026-03-20 — Session 22: Owner admin access alignment
- Verified moderation panel is available at `/admin` with approve/reject flow.
- Fixed login role routing so admin users are redirected to `/admin` instead of `/dashboard`.
- Added owner-facing entry points on home page plus `/owner` redirect route.
- Revalidated web tests and web build after owner-flow updates.

### 2026-03-20 — Session 23: Owner flow tightened + env-based admin seed credentials
- Removed separate public admin entry/button from home page and removed `/owner` alias route.
- Kept role-based login redirect so admin credentials always land on `/admin`.
- Added configurable seed env vars (`ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`) and wired them into `apps/api/prisma/seed.ts`.
- Revalidated API and web builds after changes.

### 2026-03-20 — Session 24: Layer 4 test completion + local env seeding
- Created `apps/api/.env` from `.env.example` to simplify local API commands.
- Expanded Layer 4 API tests (`menuRoutes.test.ts`) for duplicate category rejection and menu-item update validation/ownership errors.
- Expanded Layer 4 web tests (`menu-page.test.tsx`) for item edit/delete interactions and blocked-business state behavior.
- Re-ran DB seed against local docker Postgres using explicit `DATABASE_URL`; seeding completed successfully.
- Revalidated API/web test and build suites successfully.

### 2026-03-24 — Session 25: ADR-028 UI + notifications pass
- Added owner header notification bell with badge (fetches `/api/business/notifications`) and new notifications page test coverage.
- Admin pending-update list now shows field-level diffs and raw payload toggle; blocked/pending reasons surfaced on menu/tables pages via banners.
- Added blocked-state banners for menu/tables flows; kept blocked/pending/rejected/archived actions disabled.
- New web tests for header badge and notifications page; re-ran full API suite (13/66) and web suite (12/43) — all green.

### 2026-03-24 — Session 26: Header bell inline + logout visibility
- Header notification bell moved to rightmost, icon-only; opens inline scrollable/paginated list instead of navigating.
- Logout hidden when no session; dashboard link hidden while on dashboard path to avoid self-link.
- Updated test mocks for `usePathname`; reran web suite (12/43) all green; API suite unchanged (13/66).

### 2026-03-24 — Session 27: ADR-029 unread inbox + history
- Accepted ADR-029 introducing `notification_events` (history) and `notification_inbox` (unread) tables.
- Added unread/all notification endpoints plus mark-read and mark-all; admin approve/reject/block/unblock now write event + inbox.
- Header panel now supports unread/all toggle, per-item mark-read, mark-all; badge uses unread count. Updated shared types; API (13/66) and Web (12/43) tests passing.

### 2026-03-24 — Session 28: ADR-030 remove legacy notifications
- Removed legacy `business_notifications` Prisma model and relations; notifications now only use `notification_events` + `notification_inbox`.
- Added ADR-030 and prepared for full DB wipe + schema re-push.

### 2026-03-24 — Session 29: Admin approval notifications
- Added notification event + inbox emission for initial business approve/reject actions.
- Extended notification type union with business approval/rejection variants.

### 2026-03-24 — Session 30: Admin inbox notifications
- Added admin inbox endpoints and header support; business submissions and update requests now emit admin notifications.
- Updated API tests to mock notification event/inbox prisma calls.

### 2026-03-24 — Session 31: ADR-032 approved (UX polish)
- ADR-032 approved to polish notification UX and standardize blocked banners across owner pages (implementation pending).

### 2026-03-24 — Session 32: ADR-032 implementation
- Notification panel now renders field-level diffs, type badges, and actor hints with grouped business headers.
- Added blocked-status banners on dashboard and onboarding pages; web test suite passing.

### 2026-03-20 — Session 25: Root-route redirect + `/home` landing split
- Added ADR-008 and accepted root-route policy: `/` now redirects by auth state while the public landing page lives at `/home`.
- Migrated previous `src/app/page.tsx` landing content to `src/app/home/page.tsx`.
- Implemented server-side root redirect in `src/app/page.tsx` using cookie presence + `/api/auth/me` role check (`/dashboard` for business, `/admin` for admin, otherwise `/home`).
- Added refresh fallback in `src/app/page.tsx`: when `/api/auth/me` is not valid but `refresh_token` exists, route using `/api/auth/refresh` response role.
- Updated login fallback (`src/app/(auth)/login/page.tsx`) from `/` to `/home` for non-admin/non-business roles.
- Added `apps/web/tests/root-page.test.ts`; web tests (16 total) and build pass.

### 2026-03-20 — Session 26: Logout redirect alignment to `/home`
- Updated unauthenticated guards in admin/dashboard routes to redirect to `/home` instead of `/login`.
- Files updated: `apps/web/src/app/admin/page.tsx`, `apps/web/src/app/dashboard/page.tsx`, `apps/web/src/app/dashboard/onboarding/page.tsx`, `apps/web/src/app/dashboard/menu/page.tsx`.
- Revalidated web test suite: `pnpm --filter @scan2serve/web test` passes (16 tests).

### 2026-03-20 — Session 27: API singleton logger + structured endpoint logs
- Added ADR-009 and accepted API logging standardization around a singleton logger utility.
- Introduced `apps/api/src/utils/logger.ts` and routed API bootstrap/error/startup logs through it.
- Upgraded endpoint logs in `apps/api/src/index.ts` to structured request lifecycle events with request IDs and detailed context.
- Added `LOG_LEVEL` to `apps/api/.env.example`.
- Revalidated API test/build pipeline: `pnpm --filter @scan2serve/api test` (24) and `pnpm --filter @scan2serve/api build` pass.

### 2026-03-20 — Session 28: Menu category create fix for mixed business statuses
- Investigated non-functional category creation in menu flow and identified fallback business resolution behavior as the blocker when users have multiple business profiles.
- Updated `resolveBusinessForUser` to prefer an approved business when no explicit business id is provided, reducing false `BUSINESS_PENDING_APPROVAL` failures.
- Added regression test coverage for mixed-status fallback behavior in `apps/api/tests/menuRoutes.test.ts`.
- Revalidated API suite and build: `pnpm --filter @scan2serve/api test` (25 tests) and `pnpm --filter @scan2serve/api build` pass.

### 2026-03-20 — Session 29: Menu category create fix for content-type/header merge
- Investigated API logs showing `contentType: text/plain;charset=UTF-8` on `POST /api/business/categories` and identified `apiFetch` header merge order bug in web client.
- Fixed `apps/web/src/lib/api.ts` so merged headers are applied after options spread, preserving default JSON content-type alongside custom headers.
- Added `apps/web/tests/api.test.ts` coverage to verify outbound category-create style requests keep both `Content-Type: application/json` and `x-business-id`.
- Revalidated web suite and build: `pnpm --filter @scan2serve/web test` (17 tests) and `pnpm --filter @scan2serve/web build` pass.

### 2026-03-20 — Session 30: ADR-010 drafted for AI-assisted menu authoring
- Added `docs/adr/ADR-010-ai-assisted-menu-suggestions.md` with proposed subtle AI scope for categories/items suggestions, dietary auto-fill, and dietary-tag display.
- Included low-hassle enhancement recommendations in ADR-010 to accelerate implementation with minimal complexity.
- Updated docs/root context files to mark ADR-010 as proposed and awaiting approval before coding.

### 2026-03-20 — Session 31: ADR-010 implementation (AI-assisted menu suggestions)
- Marked ADR-010 as accepted and implemented business-scoped suggestion endpoints for category/item authoring.
- Added deterministic suggestion service (`apps/api/src/services/menuSuggestions.ts`) and routed new suggestion APIs in `apps/api/src/routes/business.ts`.
- Updated dashboard menu UI to show suggestion chips, auto-fill dietary tags from selected item suggestions, and display dietary-tag badges on item cards.
- Extended API and web test coverage for suggestion filtering/autofill/tag-visibility behavior.
- Revalidated full API/web suites and builds: API tests (26), web tests (18), API build, web build.

### 2026-03-20 — Session 32: ADR-011 drafted for LLM suggestions + autocomplete
- Added `docs/adr/ADR-011-llm-menu-suggestions-autocomplete.md` as a proposed enhancement for LLM-driven top-5 item suggestions based on category context.
- Defined typed-input autocomplete behavior (`q` query), plus top-5 common fallback when category has no items.
- Explicitly preserved deterministic fallback, timeout, and caching constraints for reliability and cost control.
- Updated docs/root context files to mark ADR-011 as pending approval before implementation.

### 2026-03-20 — Session 33: ADR-011 API implementation + singleton LLM client
- Implemented singleton LLM client (`apps/api/src/services/llmClient.ts`) with lazy process-wide model-handle initialization.
- Added LLM suggestion orchestration service (`apps/api/src/services/llmMenuSuggestions.ts`) with deterministic fallback path.
- Added dedicated AI endpoint namespace route (`apps/api/src/routes/ai.ts`) and mounted `/api/ai` in API bootstrap.
- Updated existing business item-suggestion endpoint to use the same singleton-backed service so current clients continue to work.
- Added LLM env configuration keys and new tests (`apps/api/tests/llmMenuSuggestions.test.ts`) to validate singleton behavior and fallback.
- Updated ADR-011 to `Accepted` and synced CLAUDE context files (`apps/api/CLAUDE.md`, `docs/CLAUDE.md`, `CLAUDE.md`).

### 2026-03-20 — Session 34: LLM timeout/fallback logging polish
- Investigated runtime `AbortError` logs from LLM calls timing out around `~2.5s`.
- Updated LLM client error handling so timeout aborts are treated as expected fallback events (`ai.model.request.timeout`, info level) instead of stack-heavy warnings.
- Increased default LLM timeout to `4500ms` in `.env.example` to reduce false timeouts for slower model responses.
- Added explicit fallback telemetry (`ai.menu_suggestions.fallback_used`) to observe when deterministic fallback is serving suggestions.
- Revalidated API tests/build after changes.

### 2026-03-20 — Session 35: AI suggestion continuity + dashboard suggestion UX fixes
- Fixed suggestion exhaustion by over-fetching LLM candidates in `apps/api/src/services/llmMenuSuggestions.ts` and trimming after exclusion/ranking.
- Improved deterministic fallback in `apps/api/src/services/menuSuggestions.ts` to backfill from a global deduped item pool when category-local suggestions are exhausted.
- Switched dashboard item suggestions to `/api/ai/menu/item-suggestions` with business/category/query params and debounced typed-query fetch.
- Updated dashboard behavior to clear stale suggestion chips while search requests are in-flight and reload suggestions when selected category changes.
- Added/updated tests:
  - `apps/api/tests/llmMenuSuggestions.service.test.ts`,
  - `apps/web/tests/menu-page.test.tsx` (category-change + in-flight clearing scenarios).
- Revalidated API/web tests and both builds successfully.

### 2026-03-20 — Session 36: Dashboard menu lock-state UX refinement
- Removed `All categories` selector from dashboard category rail to simplify category-scoped workflow.
- Updated `apps/web/src/app/dashboard/menu/page.tsx` so menu items panel stays blurred/locked until at least one category exists.
- Added first-time setup helper copy in menu panel (`Add your first category to unlock menu item management.`).
- Auto-selects first category when available and keeps selected category valid after category mutations.
- Added web regression test for no-category locked state and absence of `All categories` in `apps/web/tests/menu-page.test.tsx`.
- Revalidated web tests/build.

### 2026-03-20 — Session 37: Dashboard menu visual polish with icon actions
- Replaced category/menu-item row action text buttons with icon-only controls (move/edit/delete) in `apps/web/src/app/dashboard/menu/page.tsx`.
- Added accessibility labels/titles to icon controls so interaction semantics remain explicit for users and tests.
- Refreshed category and menu item card design with cleaner spacing and subtle gradient/surface styling.
- Updated menu test selectors in `apps/web/tests/menu-page.test.tsx` to use accessible labels for icon buttons.
- Revalidated web tests/build successfully.

### 2026-03-20 — Session 38: ADR-012 category color + item image entry UI
- Marked ADR-012 as `Accepted` and implemented menu UI visual refresh scope.
- Upgraded category cards to color-accented gradient styling for better visual distinction.
- Added item image preview/placeholder block to menu cards and introduced `Upload image` + `Generate AI image` UI actions (non-persistent hooks in this pass).
- Added web test coverage for placeholder/actions and image-preview rendering in `apps/web/tests/menu-page.test.tsx`.
- Revalidated web tests/build successfully.

### 2026-03-20 — Session 39: UI feedback pass on category cards and item image controls
- Reworked category cards to cleaner styling with colored side accents and reduced visual noise versus prior gradient-heavy look.
- Moved item image action buttons directly below image placeholder/preview and converted both actions to icon-only controls.
- Kept accessibility intact through `aria-label` + tooltip titles for icon-only image actions.
- Updated tests and revalidated web test/build successfully.

### 2026-03-20 — Session 40: ADR-013 item description authoring + AI generation
- Marked ADR-013 as `Accepted`.
- Added AI description endpoint `POST /api/ai/menu/item-description` under dedicated AI namespace with business/category validation and fallback description behavior.
- Extended singleton LLM client with description generation support and reused existing timeout/error conventions.
- Added manual description authoring in dashboard create/edit flows plus AI description generation actions.
- Updated menu item card rendering to display description when available.
- Added API/web tests for description generation and revalidated API/web tests and builds.

### 2026-03-20 — Session 41: Description icon + section separator UI refinement
- Moved create/edit `Generate Description` actions into description textareas as icon-only inline controls in `apps/web/src/app/dashboard/menu/page.tsx`.
- Updated menu-page test selectors to target the new accessible icon control labels in `apps/web/tests/menu-page.test.tsx`.
- Improved dashboard menu sectioning: category panel now uses faded gradient grouped regions and menu panel uses subtle gradient divider lines.
- Revalidated web tests (`pnpm --filter @scan2serve/web test -- menu-page.test.tsx`) and confirmed passing.

### 2026-03-20 — Session 42: Suggestions embedded into input fields
- Updated `apps/web/src/app/dashboard/menu/page.tsx` so category suggestions are attached to the category input and item suggestions are attached to the item-name input as inline dropdown chip panels.
- Removed the standalone suggested-menu-items block beneath the create-item form to keep suggestion context local to the input being edited.
- Revalidated targeted web tests: `pnpm --filter @scan2serve/web test -- menu-page.test.tsx` passed.

### 2026-03-20 — Session 43: Suggestions kept inline without dropdown behavior
- Updated `apps/web/src/app/dashboard/menu/page.tsx` to remove absolute-position dropdown overlays for suggestions and keep category/item suggestion chips inline in their respective input blocks.
- Kept suggestion click-to-fill/autotag behavior unchanged.
- Revalidated targeted web tests: `pnpm --filter @scan2serve/web test -- menu-page.test.tsx` passed.

### 2026-03-20 — Session 44: Visual rollback for category/menu separators
- Reverted category faded-gradient grouping and menu-section gradient divider lines in `apps/web/src/app/dashboard/menu/page.tsx` per UI feedback.
- Restored neutral bordered section containers while retaining the newer inline in-block suggestion chips.
- Revalidated targeted web tests: `pnpm --filter @scan2serve/web test -- menu-page.test.tsx` passed.

### 2026-03-20 — Session 45: Toast-only messaging policy added to CLAUDE files
- Updated `CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`, `docs/CLAUDE.md`, and `packages/shared/CLAUDE.md` with explicit guidance that user notifications/errors should be delivered via toasts rather than inline page text.
- Captured the policy in both conventions and dated updates sections to keep future agent behavior consistent.

### 2026-03-20 — Session 46: Web toast system + inline message migration
- Added a lightweight global toast system in web app (`src/lib/toast.ts` + `src/components/ui/toast-viewport.tsx`) and mounted it in root layout.
- Migrated inline error/notification text to toast-driven feedback in login, business registration, QR login/register, admin moderation, onboarding, and dashboard menu pages.
- Removed inline menu error text rendering and kept blocked/helper content intact; action feedback now emits toast events.
- Revalidated `@scan2serve/web` with full tests and production build.

### 2026-03-20 — Session 47: ADR-014 accepted + MinIO image persistence and AI image hooks
- Marked `docs/adr/ADR-014-menu-item-image-storage-local-s3-filepath.md` as `Accepted`.
- Replaced persisted menu-item image field with S3 object path (`image_path`) in Prisma and added migration `20260320043000_menu_item_image_path`.
- Added API object-storage service (`src/services/objectStorage.ts`) using S3-compatible config and MinIO-first local defaults.
- Added provider-backed image generation service (`src/services/aiImageProvider.ts`) using Nano-Banana-style API contract + timeout/error handling.
- Added business image endpoints:
  - `POST /api/business/menu-items/:id/image/upload` (multipart upload),
  - `POST /api/business/menu-items/:id/image/generate` (AI generation + store).
- Updated menu-item route serialization to return derived `imageUrl` from stored `imagePath` while persisting only path.
- Wired dashboard image buttons to real endpoints and added multipart `FormData` support in web API client.
- Added MinIO service + env wiring in `docker-compose.yml`; expanded API env config for S3 and AI image provider keys/model/timeouts.
- Expanded API/web tests for image upload/generate flows and revalidated API/web tests + builds successfully.

### 2026-03-20 — Session 48: Environment build fix for MinIO healthcheck
- Reproduced user-reported compose startup failure where `scan2serve-minio` stayed unhealthy and blocked dependent services.
- Confirmed MinIO image lacks `wget`/`curl`, causing the previous HTTP healthcheck command to fail despite successful server boot.
- Updated MinIO healthcheck in `docker-compose.yml` to file-based readiness check (`/data/.minio.sys/format.json`).
- Re-ran `docker-compose up --build -d`; verified all services healthy via `docker-compose ps`.
- Verified API and web health endpoints return `{"status":"ok"}`.

### 2026-03-20 — Session 49: ADR-015 accepted + deleted-asset cron cleanup queue
- Marked `docs/adr/ADR-015-s3-deletion-queue-and-cron-cleanup.md` as `Accepted`.
- Added cleanup queue persistence model/migration (`DeletedAssetCleanup`) for S3 object deletion tasks.
- Added `deleteImageObject` to object storage service and implemented scheduled cleanup worker (`src/services/deletedAssetCleanup.ts`) with retry/backoff.
- Wired enqueue logic into menu image replacement and menu-item delete flows so old image paths are persisted for deferred cleanup.
- Added env-driven cleanup controls and enabled them in compose API service.
- Added worker tests (`tests/deletedAssetCleanup.test.ts`) and extended menu route tests for queue-enqueue behavior.
- Revalidated API/web tests and builds successfully.

### 2026-03-20 — Session 50: ADR-016 accepted + onboarding auto-slug/currency/logo-upload
- Marked `docs/adr/ADR-016-onboarding-auto-slug-currency-and-logo-upload.md` as `Accepted`.
- Added `currency_code` to business model with migration (`20260320070000_business_currency_code`) and propagated `currencyCode` through API serializers/shared types.
- Updated business onboarding API to auto-generate unique immutable slugs from business names and to reject manual slug updates.
- Added multipart onboarding logo upload endpoint (`POST /api/business/profile/logo`) backed by S3-compatible storage.
- Reworked onboarding UI to show read-only slug preview, collect currency code, and use drag-drop logo upload (with preview + upload on submit).
- Added/updated API and web tests for slug generation/immutability, currency normalization, and logo upload flow.
- Revalidated API/web tests and builds successfully.

### 2026-03-20 — Session 51: Onboarding refresh-loop fix + searchable currency dropdown
- Fixed onboarding repeated activity/log issue by changing profile refresh effect dependencies to stable user identity fields in `apps/web/src/app/dashboard/onboarding/page.tsx`.
- Replaced plain currency text input UX with searchable currency picker (`datalist`) while preserving strict uppercase ISO-like 3-letter input constraints.
- Revalidated web test/build pipelines: `pnpm --filter @scan2serve/web test` and `pnpm --filter @scan2serve/web build` both pass.

### 2026-03-20 — Session 52: Onboarding currency dropdown consistency fix
- Replaced native browser `datalist` currency control with a fully app-styled searchable combobox to ensure consistent UI across browsers/devices.
- Added dropdown keyboard/interaction affordances (`Escape` close, outside-click close) and kept filtered search over allowed currency codes.
- Updated `apps/web/tests/onboarding-page.test.tsx` selectors to target the new combobox flow and revalidated web tests/build successfully.

### 2026-03-20 — Session 53: Onboarding currency field merged into single-row search/display input
- Merged currency display and search into one input field so there is no separate second-row search box.
- Preserved value safety: typing does not overwrite saved currency until an explicit option selection is made.
- Added close/revert behavior so leaving search restores display of current saved currency value.
- Revalidated `@scan2serve/web` test and build pipelines successfully.

### 2026-03-20 — Session 54: Currency select now auto-closes on option pick
- Enforced close-on-select behavior by blurring the currency input after option click so dropdown never remains open after commit.
- Added regression assertions that option list is removed and selected value is rendered immediately after selection.
- Revalidated onboarding/web tests and web build.

### 2026-03-20 — Session 55: Currency dropdown collapse regression fixed via markup structure
- Diagnosed real-browser reopen behavior as label-driven refocus caused by placing combobox interactive elements inside a wrapping `<label>`.
- Updated onboarding currency section to explicit `label htmlFor="currency-code"` plus non-label wrapper so option click no longer triggers implicit refocus/reopen.
- Revalidated `@scan2serve/web` tests and production build.

### 2026-03-20 — Session 56: Root CLAUDE scope snapshot expanded across all implemented features
- Added a new `Implemented Scope Snapshot (Current)` section in root `CLAUDE.md`.
- Consolidated implemented feature status across foundation, auth, onboarding/approval, menu management, AI assistance, image lifecycle cleanup, infra observability, and UX policy.
- Purpose: keep base CLAUDE as a fast, complete scope reference beyond only recent feature deltas.

### 2026-03-20 — Session 57: Root CLAUDE spec audited and synchronized with current codebase
- Scanned actual API route mounts, Prisma schema models, and existing web routes; cross-checked with `STATUS.md`.
- Rewrote stale root `CLAUDE.md` sections (`Database Schema`, `API Endpoints`, `Key Frontend Routes`, monorepo commands) to match current implementation reality.
- Kept long-term feature dependency pyramid intact while separating implemented vs placeholder/not-yet-mounted scope.

### 2026-03-20 — Session 58: ADR-017 accepted + dashboard logo/archive lifecycle implementation
- Implemented dashboard business-card logo rendering and archived-business UX (hidden-by-default with toggle, confirm-before-archive, restore action).
- Extended business lifecycle with archived state + restore window and API endpoints (`PATCH /profile/archive`, `PATCH /profile/restore`).
- Added archived-business retention worker + deletion audit table and S3 cleanup enqueue integration for menu/logo assets.
- Added migration `20260320130000_business_archive_lifecycle` and expanded API/web tests; all API/web test+build gates pass.

### 2026-03-20 — Session 59: Runtime incident validation + schema drift fix
- Investigated “implementation not working” report by running test suites and live runtime diagnostics.
- Found container runtime mismatch: Postgres `BusinessStatus` enum in running DB did not include `archived`, causing archive-worker/runtime failures.
- Fixed by applying schema sync inside running API container (`docker-compose exec -T api pnpm --filter @scan2serve/api db:push`).
- Verified live archive flow end-to-end in container (`register -> login -> create profile -> archive -> restore` all successful).

### 2026-03-20 — Session 60: Dashboard hook-order runtime fix
- Investigated user-reported dashboard crash and confirmed React `Rules of Hooks` violation in `apps/web/src/app/dashboard/page.tsx`.
- Root cause: `useMemo` and a follow-up `useEffect` were defined after early-return branches (`loading`, `user`, role, business list), changing hook order between renders.
- Moved those hooks above all conditional returns so every render executes hooks in identical order.
- Revalidated with `pnpm --filter @scan2serve/web test` (27 tests passing).

### 2026-03-20 — Session 61: Archived badge red-tint UI refinement
- Updated dashboard archived status chips to use red-tinted styling on business cards and selected-business overview status pill.
- Change applied in `apps/web/src/app/dashboard/page.tsx` with archived-only conditional class variants.
- Revalidated with `pnpm --filter @scan2serve/web test` (27 tests passing).

### 2026-03-20 — Session 62: Archived-only filter toggle + stronger inactive card emphasis
- Changed dashboard business-list filtering so `Show archived` renders archived businesses only (instead of showing all).
- Added red-tinted backgrounds for archived business cards and the archived overview section/metric cards to emphasize non-active state.
- Updated `tests/dashboard.test.tsx` for archived-only toggle expectation and archived red-chip class assertion.
- Revalidated with `pnpm --filter @scan2serve/web test` (27 tests passing).

### 2026-03-20 — Session 63: ADR-018 accepted + public UI redesign with dialog auth
- Accepted ADR-018 and implemented a structured light-theme public shell (`header/main/footer`) used across home and public-facing auth/menu surfaces.
- Rebuilt `/home` with explicit hero, sectioned body/subsections, and authenticated profile card showing one role-aware CTA.
- Added reusable dialog primitives and shared business auth forms, then moved home login/register UX into dialogs.
- Converted `/qr/login` and `/qr/register` into dialog-style QR auth pages while preserving QR token behavior.
- Kept `/login` and `/register/business` as functional fallback routes with dialog-style rendering.
- Added `tests/home-page.test.tsx` for home dialog + profile CTA behavior and revalidated web test/build pipelines.

### 2026-03-20 — Session 64: Layer 4 completion pass (category-filtered listing + reorder normalization)
- Finalized Layer 4 backend contracts by adding optional `categoryId` filtering to `GET /api/business/menu-items`, including category ownership validation.
- Hardened reorder behavior in category/item reorder endpoints to persist contiguous `sortOrder` values (`0..N-1`) and reject duplicate IDs in payloads.
- Updated dashboard menu loading to request category-scoped items, refresh on category change, and guard against partial list payloads.
- Added delete confirms for category/item actions in menu UI.
- Extended API/web test coverage for the new behavior and fixed menu-page mocks for category-query URL shapes.
- Revalidated both suites: API `47/47` and web `29/29` passing.

### 2026-03-20 — Session 65: Menu delete confirm UX moved to app dialog
- Replaced `window.confirm(...)` usage in dashboard menu delete actions with in-app modal dialog confirmation.
- Added shared `ModalDialog` confirm surface for both category and menu-item delete flows in `apps/web/src/app/dashboard/menu/page.tsx`.
- Updated `apps/web/tests/menu-page.test.tsx` to assert dialog-driven confirmation (`Confirm delete`) before delete API invocation.
- Revalidated web tests via `pnpm --filter @scan2serve/web test -- tests/menu-page.test.tsx` (29/29 passing in run output).

### 2026-03-20 — Session 66: Shared header across pages with profile at top-right
- Added reusable app header component (`apps/web/src/components/layout/app-header.tsx`) with brand home-link, optional left metadata slot, and right-side auth/profile controls.
- Wired `PublicSiteShell` to use this shared header so home, auth fallback pages, QR auth pages, and public menu use the same header baseline.
- Added shared header to business/admin routes (`apps/web/src/app/dashboard/page.tsx`, `apps/web/src/app/dashboard/menu/page.tsx`, `apps/web/src/app/dashboard/onboarding/page.tsx`, `apps/web/src/app/admin/page.tsx`) for consistent cross-page chrome.
- Verified web suite after rollout: `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 67: Added global header back button
- Added `Back` navigation control in shared header (`apps/web/src/components/layout/app-header.tsx`).
- Back button is visible on non-home routes, uses browser history for navigation, and falls back to `/home` when history is unavailable.
- Verified no regressions with `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 68: Moved back button to body top-left
- Removed back-navigation control from shared header and introduced shared body-level control (`apps/web/src/components/layout/body-back-button.tsx`).
- Added body back button at the top-left of main content in public shell and dashboard/admin/onboarding/menu pages.
- Kept navigation behavior intact (history back with `/home` fallback; hidden on `/home`).
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 69: Dashboard manage-menu action promoted to gradient card
- Removed the inline `Manage menu` button from the dashboard overview action row.
- Added a separate clickable quick-action card with bright gradient styling in `apps/web/src/app/dashboard/page.tsx` that navigates to `/dashboard/menu`.
- Kept archive/restore status actions unchanged and preserved blocked-state behavior.
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 70: Moved manage-menu card beside business cards
- Moved the gradient `Manage menu` quick-action card out of Active Business Overview into the `Your businesses` grid as the left/leading card.
- Preserved route behavior (`/dashboard/menu`) and visual emphasis styling.
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 71: Manage-menu card moved outside businesses card to right panel
- Updated dashboard layout to place the gradient `Manage menu` quick-action as a standalone right-side panel adjacent to `Your businesses` (not inside that card/grid).
- Preserved action routing to `/dashboard/menu` and archived-state conditional visibility.
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 72: Simplified quick-action copy + gradient-selected business card
- Shortened `Manage menu` quick-action text for a cleaner, less cluttered card.
- Updated selected non-archived business-card styling to use the same gradient family as the quick-action card for visual consistency.
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 73: Selection style revert with gradient border accent
- Reverted selected non-archived business-card background to previous neutral selected style (`bg-gray-100`).
- Kept gradient-family alignment by setting selected non-archived business-card border to `border-orange-300`.
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 74: Increased selected-card border thickness
- Increased selected business-card border width to `border-2` for stronger visual emphasis.
- Preserved previous selected-state color logic (`orange` for active, `red` for archived).
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 75: Archive action converted to right-panel card
- Moved `Archive business` out of Active Business Overview action row.
- Added `Archive business` as a second clickable card below `Manage menu` in the right-side quick-action panel beside `Your businesses`.
- Preserved archived-state restore behavior in overview.
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (29/29 passing).

### 2026-03-20 — Session 76: Added edit-details action and locked name in edit mode
- Added `Edit details` action adjacent to archive in right quick-action area; routes to onboarding edit URL with selected business id.
- Updated onboarding edit mode to lock `Business name` (disabled/read-only) while keeping slug immutable and editable scope limited to other fields.
- Extended onboarding tests with existing-profile lock assertions.
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (30/30 passing).

### 2026-03-20 — Session 77: Hide quick actions in archived-view mode
- Added explicit dashboard guard to hide quick actions when `Show archived` is active.
- Hidden actions in archived view: `Manage menu`, `Edit details`, `Archive business`.
- Updated dashboard tests to assert action absence in archived mode.
- Revalidated web suite: `pnpm --filter @scan2serve/web test` (30/30 passing).

### 2026-03-20 — Session 78: ADR-019 drafted for Layer 5 Table + QR
- Added `docs/adr/ADR-019-layer5-table-and-qr-management.md` with proposed Layer 5 contracts and test scope.
- ADR-019 covers table lifecycle endpoints, QR regenerate/history continuity, and single/batch QR download exports.
- No Layer 5 implementation code started yet; waiting for ADR approval before coding.

### 2026-03-20 — Session 79: ADR-020 accepted + Gemini REST image runtime implementation
- Added and accepted `docs/adr/ADR-020-gemini-image-runtime-for-non-banana-provider.md`.
- Implemented Gemini REST provider path in `apps/api/src/services/aiImageProvider.ts` behind `AI_IMAGE_PROVIDER=gemini`.
- Added Gemini env configuration to `apps/api/.env.example` (`GEMINI_API_KEY`, `GEMINI_API_URL`, `GEMINI_IMAGE_MODEL`).
- Added provider-level tests in `apps/api/tests/aiImageProvider.test.ts`.
- Verified API test suite: `pnpm --filter @scan2serve/api test` (50/50 passing).

### 2026-03-20 — Session 80: ADR-021 accepted + AI guardrails for text/image generation
- Added and accepted `docs/adr/ADR-021-ai-generation-guardrails.md`.
- Added shared guardrail service (`apps/api/src/services/aiGuardrails.ts`) for unsafe-content detection and generated-text sanitization.
- Enforced guardrails in `apps/api/src/routes/ai.ts` and `apps/api/src/routes/business.ts` for text and image generation endpoints.
- Added API tests covering blocked unsafe prompts and safe/sanitized text fallback behavior.
- Verified API test suite: `pnpm --filter @scan2serve/api test` (57/57 passing).

### 2026-03-20 — Session 81: ADR-022 accepted + Gemini-only image runtime
- Added and accepted `docs/adr/ADR-022-gemini-only-image-generation-runtime.md`; marked ADR-020 as superseded.
- Removed Nano-Banana/provider-switch logic from `apps/api/src/services/aiImageProvider.ts`; menu image generation now always uses Gemini REST.
- Cleaned runtime config in `apps/api/.env.example` and `docker-compose.yml` by removing `AI_IMAGE_PROVIDER` and `NANOBANANA_*` keys.
- Updated provider tests (`apps/api/tests/aiImageProvider.test.ts`) to assert Gemini-only behavior.
- Verified API test suite: `pnpm --filter @scan2serve/api test` (57/57 passing).

### 2026-03-20 — Session 82: Docker compose env precedence fix for Gemini key
- Diagnosed 503 image-generation failures as compose env precedence issue (`GEMINI_API_KEY` hardcoded empty in `docker-compose.yml`).
- Added API `env_file` loading from `./apps/api/.env` and removed hardcoded empty `GEMINI_API_KEY` override.
- Recreated API service and verified runtime env inside container includes non-empty `GEMINI_API_KEY`.

### 2026-03-20 — Session 83: ADR-019 accepted + Layer 5 API/web baseline implemented
- Marked `docs/adr/ADR-019-layer5-table-and-qr-management.md` as Accepted.
- Implemented Layer 5 API routes in `apps/api/src/routes/business.ts`: table list/bulk create/update and QR single/batch download contracts.
- Added QR batch ZIP utility `apps/api/src/utils/simpleZip.ts`.
- Added Layer 5 API tests in `apps/api/tests/tableRoutes.test.ts`.
- Implemented `/dashboard/tables` in web (`apps/web/src/app/dashboard/tables/page.tsx`) and added dashboard entry action in `apps/web/src/app/dashboard/page.tsx`.
- Added web tests in `apps/web/tests/tables-page.test.tsx`.
- Revalidated test/build gates for API and web after implementation.

### 2026-03-20 — Session 84: Customer-only header mode for QR/menu surfaces
- Added `audience="customer"` support to `apps/web/src/components/layout/app-header.tsx`.
- Extended `apps/web/src/components/public/public-site-shell.tsx` with `headerAudience` prop.
- Applied customer-only header audience to `/menu/[slug]`, `/qr/login`, and `/qr/register` pages.
- Added `apps/web/tests/app-header.test.tsx` to ensure dashboard CTA is hidden in customer audience mode.

### 2026-03-20 — Session 85: ADR-023 drafted thoroughly for mixed session scope isolation
- Created and expanded `docs/adr/ADR-023-mixed-session-scope-isolation.md` as `Proposed`.
- Updated ADR-023 to keep a single `/api/auth/*` namespace and resolve customer vs business scope from `qrToken` validity, including refresh/me/logout behavior and mixed-session guardrails.
- Synced ADR metadata into `docs/CLAUDE.md` and root `CLAUDE.md`.

### 2026-03-20 — Session 86: ADR-023 accepted + unified auth scope implementation
- Marked ADR-023 as `Accepted` and implemented unified scope behavior in `apps/api/src/routes/auth.ts` using qrToken validity.
- Updated `/api/auth/*` handlers (register/login/refresh/logout/me) to use scoped cookie ownership without route splitting.
- Updated web auth bootstrap/retry/logout scope propagation (`apps/web/src/lib/auth-context.tsx`, `apps/web/src/lib/api.ts`) to forward `x-qr-token` in QR/menu contexts.
- Updated `apps/api/tests/authRoutes.test.ts` for new scope behavior and revalidated API/web tests + builds.

### 2026-03-20 — Session 87: Customer token-path bug fix for mixed sessions
- Fixed customer access-cookie path in `apps/api/src/routes/auth.ts` from `/qr` to `/` so `/api/auth/me` receives `qr_customer_access` in customer scope.
- Preserved token separation by cookie names for business and customer auth (`access_token`/`refresh_token` vs `qr_customer_access`/`qr_customer_refresh`).
- Revalidated API suite and build after fix (`62/62` tests passing).

### 2026-03-20 — Session 88: ADR-024 accepted + dual-session visibility/scoped logout
- Marked ADR-024 as `Accepted` and implemented `GET /api/auth/sessions` plus scoped `POST /api/auth/logout` body contract (`business|customer|all`) in `apps/api/src/routes/auth.ts`.
- Updated auth context and header UI in web to surface both active session identities and allow scoped logout with cross-scope login actions.
- Added/updated API and web tests for dual-session and scoped actions; revalidated API/web test and build pipelines.

### 2026-03-20 — Session 89: Header actions grouped into Login/Logout dropdowns
- Updated header action UX in `apps/web/src/components/layout/app-header.tsx` to provide two parent dropdown-style controls (`Login`, `Logout`) with both scope options under each.
- Kept ADR-024 scoped behavior intact while reducing header clutter from multiple flat action buttons.
- Updated header tests and revalidated web tests/build and API build.

### 2026-03-20 — Session 90: Header-only login/logout action enforcement
- Removed remaining non-header login/logout buttons from home and dashboard fallback UIs to enforce two-dropdown-only auth action model in headers.
- Kept registration and non-auth CTAs intact while constraining login/logout to header controls.
- Updated home/header tests and revalidated web tests/build.

### 2026-03-20 — Session 91: Menu page auth-control cleanup + customer-only header actions
- Removed duplicate QR login/register controls from menu page body so auth controls are not repeated outside header dropdowns.
- Updated customer-audience header to hide business-scope login/logout options specifically on customer/menu surfaces.
- Revalidated web tests and build after customer-header/menu refinements.

### 2026-03-20 — Session 92: ADR-025 accepted + auth-entry guard and dialog close controls
- Marked ADR-025 as `Accepted`.
- Added auth-context pre-submit guards to prevent login/register auth API calls when the target scope is already logged in.
- Updated business and QR auth routes to display `Already logged in` state with continue CTAs, and added close buttons to all auth dialogs.
- Added dialog and guard test coverage; revalidated web tests/build.

### 2026-03-20 — Session 93: Live mixed-session API runtime matrix verification
- Ran live API checks against local running stack with one cookie jar simulating same-browser mixed sessions.
- Confirmed dual-session visibility, active-scope switching by QR context header, and scoped logout behavior (`business`/`customer`) work as expected.
- Noted current `activeScope` semantics: defaults to `business` when QR context is absent, independent of whether `customerUser` is present.

### 2026-03-20 — Session 94: Auth-page dialog-only cleanup + login-surface scoping
- Updated `apps/web/src/components/layout/app-header.tsx` so default audience login dropdown exposes only business login; customer login remains customer-audience only.
- Removed non-dialog content blocks from auth routes:
  - `apps/web/src/app/(auth)/login/page.tsx`
  - `apps/web/src/app/(auth)/register/business/page.tsx`
  - `apps/web/src/app/qr/login/page.tsx`
  - `apps/web/src/app/qr/register/page.tsx`
- Removed direct QR auth preview links from `apps/web/src/app/home/page.tsx` to keep customer auth entry in QR/menu flow.
- Extended `apps/web/tests/app-header.test.tsx` to assert default-vs-customer auth option visibility.
- Revalidated web test and build pipelines successfully.

### 2026-03-20 — Session 95: Auth dialog close uses browser history first
- Investigated continued redirect complaints on auth dialog pages and identified forced close navigation (`router.push`) as root cause.
- Updated close handlers to use `router.back()` when possible, with fallback only for no-history cases:
  - `apps/web/src/app/(auth)/login/page.tsx`
  - `apps/web/src/app/(auth)/register/business/page.tsx`
  - `apps/web/src/app/qr/login/page.tsx`
  - `apps/web/src/app/qr/register/page.tsx`
- Revalidated web tests after close-navigation changes (full suite passing).

### 2026-03-24 — Session 96: ADR-026 rejected
- Marked ADR-026 as superseded and explicitly dropped the proposed global in-place auth dialog controller.
- Updated docs and web context notes to preserve route-based auth redirects plus history-first close behavior as the supported auth UX direction.
- No product code changed in this session; this was decision-record and handoff cleanup only.

### 2026-03-24 — Session 97: Web auth regression check + ADR-027 drafted
- Re-ran `pnpm --filter @scan2serve/web test -- --runInBand`; all suites passed including auth dialog close coverage.
- Auth live-browser validation remains outstanding (test-only this session).
- Added proposed ADR-027 for Layer 6 public menu + client-side cart scope.

### 2026-03-24 — Session 98: ADR-027 accepted + Layer 6 public menu/cart implementation
- Marked ADR-027 as Accepted and implemented public menu delivery: new API `GET /api/public/menu/:slug` enforcing approved+active business/table/QR context and returning categories/items with derived image URLs.
- Built SSR public menu page with client-side cart persisted per business/table/QR token and availability-aware quantity controls.
- Added regression coverage: `apps/api/tests/publicRoutes.test.ts` for public menu endpoint and `apps/web/tests/public-menu.test.tsx` for cart isolation and quantity behaviors.
- Full API and web test suites pass after changes.

### 2026-03-24 — Session 99: Public menu UI compact + sliding description
- Compacted public menu item cards into boxier layout and reduced padding/thumb size.
- Item descriptions now slide in from the right when a card is selected; hidden otherwise.
- Cart drawer close label fixed (“Hide cart”); floating cart toggle stays in sync.
- Updated `apps/web/tests/public-menu.test.tsx`; full web suite (11 files, 42 tests) passes.

### 2026-03-24 — Session 100: Row-style menu cards + single cart toggle
- Converted public menu cards to full-width rows with inline descriptions and simplified layout.
- Cart drawer now uses only the floating toggle to open/close (removed inner hide button).
- Updated `apps/web/tests/public-menu.test.tsx`; web suite still passing (11 files, 42 tests).

### 2026-03-24 — Session 101: Quantity strip + label placement
- Restyled public menu row actions with rose quantity strip (− qty +) and moved “In cart/Add to cart” under price/controls.
- Web tests refreshed; suite remains green (11 files, 42 tests).

### 2026-03-24 — Session 102: Dashboard menu currency formatting
- Dashboard menu item list now uses business currency for price display (Intl.NumberFormat with `selectedBusiness.currencyCode`).
- Web test suite re-run (11 files, 42 tests) passes.

### 2026-03-24 — Session 103: Currency symbol in menu item form
- Added business currency symbol to the dashboard menu item price input (derived from `selectedBusiness.currencyCode`). Web test suite re-run (11 files, 42 tests) passes.

### 2026-03-24 — Session 104: Business edits require re-approval
- Earlier interim change (flip approved to pending on edit) now superseded by queued-updates approach in Session 106.

### 2026-03-24 — Session 105: ADR-028 drafted
- Proposed queued updates + blocked flag.

### 2026-03-24 — Session 106: ADR-028 accepted + backend queue/block implemented
- Added business update request queue, blocked flag, middleware guard, admin list/approve/reject endpoints, and block/unblock endpoint. API tests (13 files, 66 tests) pass.

### 2026-03-24 — Session 107: Notifications backend
- Added business notifications table and owner listing endpoint; admin moderation/block actions now emit notifications. API tests still passing.

### 2026-03-24 — Session 108: Owner notifications page
- Added `/dashboard/notifications` listing latest business notifications (type/message/business/time). Shared types updated; web tests still pass.

### 2026-03-24 — Session 109: Admin pending-updates UI
- Admin moderation page now includes block/unblock toggle and inline pending update list with approve/reject actions (fetches `/api/admin/businesses/:id/updates`).
- Web tests remain green (11 files, 42 tests).

### 2026-03-24 — Session 110: Blocked-state guard in owner dashboards
- Menu and tables dashboards now gate actions when business is blocked (aligned with pending/rejected/archived gating). Web tests remain green (11 files, 42 tests).

### 2026-03-24 — Session 111: Layer 7 ordering & payments
- Accepted ADR-033 and enforced server-side item lookup/pricing for order creation.
- Added public order create/checkout/status endpoints, Stripe webhook processing, and Stripe env keys.
- Public menu cart now captures customer details and initiates checkout; added `/order/[id]` status page.
- Added API/web test coverage for order creation, payments webhook, public menu checkout, and order page; API + web suites green.

### 2026-03-24 — Session 112: Auth scope refresh on navigation
- Auth context now refreshes when QR token scope changes (menu/QR to non-QR) to prevent dashboard redirects on client navigation.
- Web tests re-run and passing.

### 2026-03-24 — Session 113: Menu currency input layout fix
- Reworked menu price inputs to use a flex currency prefix (prevents overlap for long codes like AED).

### 2026-03-24 — Session 114: Header login visibility tweak
- Suppressed login controls when a business/customer session exists; logout remains visible.

### 2026-03-24 — Session 115: Header logout dropdowns
- Moved logout actions into business/customer user cards as dropdown menus; removed standalone logout dropdown.

### 2026-03-24 — Session 116: Header dropdown alignment
- Aligned user-card dropdown menus to the card width to avoid detached button-like visuals.

### 2026-03-24 — Session 117: Header dropdown close behavior
- Added outside-click handling to close header dropdown menus.

### 2026-03-24 — Session 118: Dropdown close scope tweak
- Refined dropdown close behavior to close when clicking outside any open dropdown menu (including notifications).

### 2026-03-24 — Session 119: Notification header cleanup
- Removed redundant scope tag from notifications dropdown header (kept selector buttons only).

### 2026-03-24 — Session 120: Razorpay payments
- Accepted ADR-034 and replaced Stripe with Razorpay order create + signature verification.
- Updated API/public menu checkout flow, schema fields, shared types, and tests; removed Stripe service/router.

### 2026-03-26 — Session 121: ADR-035 auth refresh + CSRF strategy
- Drafted ADR-035 to capture decisions around access-token refresh handling and CSRF posture.
- ADR scope narrowed to CSRF only; refresh-token implementation stays unchanged.
- ADR accepted: implement CSRF tokens for mutating routes.

### 2026-03-26 — Session 122: CSRF token implementation
- Added CSRF token issuance endpoint `GET /api/auth/csrf` and global CSRF middleware for mutating routes.
- Web `apiFetch` now fetches/attaches `x-csrf-token` and includes it in refresh retries.
- Added API test coverage for CSRF middleware behavior.

### 2026-03-26 — Session 123: Toast close button
- Added a dismiss button to the toast viewport so users can manually close notifications.

### 2026-03-26 — Session 124: Compose env + seed wiring
- Added `db:seed` to API compose startup and wired common env vars (Razorpay, LLM, admin seed, QR auth).
- Added web `env_file` to load `apps/web/.env.local` in compose.

### 2026-03-26 — Session 125: Toast offset below header
- Toast viewport now computes header height and positions below it to avoid covering the header.

### 2026-03-26 — Session 126: Colored API logs
- API logger now colorizes log lines by level in non-production TTY sessions (disable via `LOG_COLOR=false`).

### 2026-03-26 — Session 127: Force colored logs
- Logger now colorizes logs in all environments by default; set `LOG_COLOR=false` to disable.

### 2026-03-26 — Session 128: Compose env trimming
- Removed env overrides from compose for values already defined in `apps/api/.env.local` and `apps/web/.env.local`, keeping only Docker-specific DB/S3/internal URLs.

### 2026-03-27 — Session 129: Layer 8 ADR expansion (retention + warehouse)
- Updated ADR-036 to cover 6-month Postgres retention with monthly partitions and an order-event queue feeding a data warehouse for historical dashboards.
- Captured open questions for retention scope, partitioning method, warehouse target, and event schema/idempotency.
- Logged initial ADR-036 answers: ClickHouse target and full-snapshot events with `eventId` dedupe + event-time gated upserts.
- Confirmed hard-delete retention policy after 6 months.
- ADR-036 accepted with final status flow ending at Completed and no separate Served status.
- Clarified ADR-036 MVP filtering to status-only and updated Decision header.

### 2026-03-27 — Session 130: Layer 8 API + order events
- Implemented business order management endpoints (list/detail/status update) with status transition validation.
- Added order-event publisher service and wired best-effort event emission for order create, payment verify, and status updates.
- Added Layer 8 API test coverage for order management routes.
- Marked ADR-036 as Paused pending ADR-037 (RBAC scope + invites).

### 2026-03-27 — Session 131: ADR-037 draft
- Drafted ADR-037 to define scoped business memberships, invitation flow, and RBAC enforcement rules.
- Updated ADR-037 with org-level membership model and one-org-per-user constraint.
- Updated ADR-037 answers: existing-user-only org invites, in-app notifications, and role permission matrix.
- Accepted ADR-037 with org-invite accept/decline flow via blurred org preview page.
- Updated ADR-037 to require static sample org preview (no real org data) for invite acceptance UX.

### 2026-03-27 — Session 132: ADR-037 implementation start
- Added org/org-invite/business membership models in Prisma and migration.
- Implemented org invite APIs, org leave, business membership assignment, and RBAC gating for menu/tables/profile routes.
- Added static org-invite preview page and notification deep-link.
- Added API and web tests covering org invite flows and role gating.

### 2026-03-27 — Session 133: Org intro + invite UI
- Added org intro page and rerouted zero-business dashboard CTA to it.
- Added dashboard invite modal UI and tests for invite actions and org intro page.

### 2026-03-27 — Session 134: Explore page
- Replaced org intro page with `/explore` use-case overview page; updated dashboard CTA and tests.

### 2026-03-27 — Session 135: Org create test coverage
- Added org membership lookup + org creation API tests in `apps/api/tests/orgInviteRoutes.test.ts`.
- Added web tests for org create page and redirect behavior when no org exists (`apps/web/tests/org-create-page.test.tsx`, updated dashboard/onboarding tests).

### 2026-03-27 — Session 136: Full test run + fixes
- Ran `pnpm install` with network access to fetch dependencies.
- Fixed API test mocks (org invite hoisting, AI route membership mock, Decimal fallback) and verified `pnpm --filter @scan2serve/api test` passes.
- Updated web tests for CSRF retry flow, explore auth mocking, and async expectations; verified `pnpm --filter @scan2serve/web test` passes (act warnings remain).

### 2026-03-27 — Session 137: Docker test service
- Added a dedicated `tests` service in `docker-compose.yml` to run `pnpm --filter @scan2serve/api test` and `pnpm --filter @scan2serve/web test`.

### 2026-03-27 — Session 138: Root CLAUDE sync
- Updated root `CLAUDE.md` to reflect org/membership endpoints, order-management APIs, and current frontend routes.

### 2026-03-27 — Session 139: Org-create toast fix
- Fixed org-create API call to send JSON string body and updated org-create test expectation.

### 2026-03-27 — Session 140: Dashboard empty state
- Switched org-without-business dashboard empty state to “Create your first business” CTA and updated dashboard tests.

### 2026-03-27 — Session 141: Owner onboarding redirect
- Updated dashboard to auto-redirect org owners with zero businesses to onboarding and refreshed dashboard tests.

### 2026-03-27 — Session 142: Order management RBAC gating
- Added business-role gating for order management endpoints (list/detail/status) so only `owner`/`manager`/`staff` can access them.
- Updated root and API CLAUDE notes with the RBAC gating change.

### 2026-03-29 — Session 143: RBAC assignment UI + staff gating
- Added org-member and business-membership listing endpoints and exposed `businessRole` in business profiles.
- Built dashboard “Manage business access” modal to grant business memberships to org members.
- Redirected staff away from menu/tables pages with toast guidance.
- Extended org-invite API tests for membership listing.

### 2026-03-29 — Session 144: Test mock stabilization
- Mocked Prisma client in `apps/api/tests/publicRoutes.test.ts` to avoid missing generated client errors.
- Fixed org-invite test mocks to include business owner ids for membership listing.
- Moved Decimal mock into `vi.hoisted` to satisfy Vitest module hoisting constraints.

### 2026-03-29 — Session 145: Dashboard hook order fix
- Moved business-member `useMemo` above early-return branches to avoid hook-order runtime errors in web tests.

### 2026-03-29 — Session 146: Org invite params fix
- Updated org-invite preview page to use `useParams` for `inviteId` to avoid Next.js Promise params warning.

### 2026-03-29 — Session 147: Non-owner empty-state
- Dashboard now shows waiting-for-access messaging for non-owners with zero assigned businesses.

### 2026-03-29 — Session 148: Invite role removal
- Org invite creation no longer accepts a role; invites default to staff and business roles are assigned per-business.

### 2026-03-29 — Session 149: Org invite test mock update
- Updated org-invite page tests to mock `useParams` after switching invite page to hook-based params access.

### 2026-03-29 — Session 150: Remove business access
- Added `DELETE /api/business/memberships` to revoke business access and wired remove-access controls in the dashboard modal.

### 2026-03-29 — Session 151: Staff access UI guard
- Manage-business-access modal now prevents self-removal and hides controls for non-owner/manager users.

### 2026-03-29 — Session 152: Staff dashboard lock-down
- Staff-facing dashboard now hides management actions, leaving only order visibility.

### 2026-03-29 — Session 153: Staff quick-action guard
- Staff-facing dashboard now hides the quick-action panel (invite/manage access cards).

### 2026-03-29 — Session 154: Dashboard action validation
- Added role/status guard checks before dashboard actions to prevent invalid operations.

### 2026-03-29 — Session 155: ADR-038 drafted
- Drafted ADR-038 to remove org roles and rely on business-level roles for permissions.

### 2026-03-29 — Session 156: ADR-038 implemented
- Removed org roles from Prisma schema and added migration `20260329120000_roleless_org_memberships`.
- Updated org permission checks to use org owner + business roles; business access management is now scoped to selected-business roles only.
- Updated shared types and dashboard UI/guards for roleless org membership; updated API/web tests to use `isOwner` membership shape.

### 2026-03-29 — Session 157: Tables download CSRF fix
- Exported CSRF helpers for client use and attached `x-csrf-token` to binary download POSTs in the tables dashboard, fixing INVALID_CSRF on QR ZIP downloads.

### 2026-03-29 — Session 158: API tests + migration attempt
- Fixed org-invite test mocks for new org-owner notification lookup and re-ran `pnpm --filter @scan2serve/api test` (passing).
- `pnpm --filter @scan2serve/api db:migrate` failed due to missing `DATABASE_URL` env.

### 2026-03-29 — Session 159: Layer 8 orders UI start
- Unpaused ADR-036 and added order management page with status filtering, polling, detail modal, and status transitions.
- Added dashboard entry point for orders and a new web test for the orders page.

### 2026-04-04 — Session 160: Web test triage kickoff
- Attempted to run `pnpm --filter @scan2serve/web test` but Node/pnpm are not available in this environment.
- Requested failing test output or approval to install toolchain before proceeding.
- Updated `apps/web/tests/app-header.test.tsx` to set `NODE_ENV=production` in notification-fetch test cases so the test-env guard no longer blocks mocked calls.
- Hardened docker-compose mounts with per-app `node_modules` volumes to prevent stale host dependencies breaking container installs (`docker-compose.yml`).
- Added guard to skip partition maintenance when base tables are not partitioned, avoiding `orders` partition errors on fresh DBs (`apps/api/src/services/orderPartitionMaintenance.ts`).
- Updated docker compose API boot command to run `db:migrate` instead of `db:push`, ensuring raw SQL migrations (partitioning) run in fresh DBs (`docker-compose.yml`).
- Fixed migration `20260404125024` by removing invalid `RENAME CONSTRAINT` clauses that caused `db:migrate` to fail on fresh DBs (`apps/api/prisma/migrations/20260404125024/migration.sql`).
- Removed partition-key `ALTER COLUMN ... SET DATA TYPE` clauses from migration `20260404125024` to fix `cannot alter column ... because it is part of the partition key` errors.
- Updated partitioning migration to create partition-key columns as `TIMESTAMP(3)` and deleted the auto-generated migration that attempted forbidden type changes (`apps/api/prisma/migrations/20260330170000_order_partitions/migration.sql`).
- Added per-service pnpm store volumes in compose (`PNPM_STORE_PATH=/pnpm-store`) to prevent concurrent install failures across containers.
- Rebuilt compose from fresh volumes; migrations applied cleanly and both API + web tests passed via the `tests` service.
- Fixed dashboard org-owner onboarding redirect to run inside a `useEffect`, preventing React router updates during render (`apps/web/src/app/dashboard/page.tsx`).
- Moved the org-owner onboarding redirect effect above early returns to keep hook order stable in `DashboardPage` (`apps/web/src/app/dashboard/page.tsx`).
- Re-ran compose tests: API (99 tests) and web (55 tests) passed after the dashboard hook-order fix.
- Updated compose install commands to force pnpm store dir (`--store-dir /pnpm-store`) to avoid copyfile errors during install.
- Re-ran compose after the store-dir change; API (99 tests) and web (55 tests) passed without pnpm install failures.
- Updated web compose command to `cd /app/apps/web` before running `next dev` so `.next` manifests resolve correctly.
- Rebuilt compose; web healthcheck now returns 200 and all services are healthy.

---

### 2026-04-04 — Session 162: ADR-044 draft (order notifications)
- Drafted ADR-044 for order dashboard toast + sound notifications and captured open questions for triggering, mute behavior, and sound asset choice.
- Noted live confirmation that orders dashboard polling is working.

### 2026-04-04 — Session 163: Analytics endpoints (ADR-045)
- Accepted ADR-045 for dashboard-scoped analytics endpoints with Postgres (today/yesterday/current week) + ClickHouse (last week/month/quarter/year).
- Added business `countryCode` + `timezone` fields (schema + migration) and onboarding UI selection for country/timezone.
- Added Redis client helper + analytics cache wrapper for non-today windows.
- Implemented `/api/business/analytics/overview` with source-specific requests and per-window cache.
- Added analytics overview UI cards to dashboard + orders pages with partial-load tolerance.
### 2026-04-09 — Session 178: ADR-047 drafted
- Drafted ADR-047 to store order status actors as `{ userId, email }` objects per status key in `status_actors`.
### 2026-04-09 — Session 179: Status actor identity
- Accepted ADR-047 and updated order status actor storage to `{ userId, email }` objects with API/UI/shared type updates.
### 2026-04-09 — Session 180: Orders status actor UI refresh
- Fixed status update handler to merge the full order payload so status actor labels update immediately in the dashboard UI.


## Decisions Log

| # | Decision | Why | Date |
|---|----------|-----|------|
| ADR-001 | pnpm workspaces (not npm/Nx) | Strict dep isolation without overhead; Nx overkill for 2 apps at MVP | 2026-03-14 |
| ADR-003 | Testing strategy (Vitest, supertest, testing-library; status field enforcement) | Establish unified test stack and coverage expectations across API & web | 2026-03-19 |
| ADR-004 | Business onboarding flow and admin approval gate | Define Layer 3 boundaries before implementation (business profile lifecycle + admin moderation) | 2026-03-19 |
| ADR-006 | QR-scoped customer auth with business-only website auth | Remove non-QR customer pathways, keep shared auth endpoints, and enforce QR token context for customer auth | 2026-03-19 |
| ADR-007 | Layer 4 menu management contracts | Define category/menu-item CRUD/reorder/availability scope and quality bars before Layer 4 coding | 2026-03-19 |
| ADR-008 | Root route redirect and `/home` landing split | Ensure `/` sends authenticated users into app areas and keeps explicit unauthenticated landing at `/home` | 2026-03-20 |
| ADR-009 | API singleton logger and structured request logs | Centralize backend logs in one logger and improve endpoint diagnostics with request lifecycle context | 2026-03-20 |
| ADR-010 | AI-assisted menu suggestions and dietary auto-fill | Introduce subtle assistive suggestions for category/item authoring and improve dietary-tag visibility | 2026-03-20 |
| ADR-011 | LLM-driven menu suggestions with typed autocomplete | Improve relevance of top-5 suggestions using category context + typed text while preserving deterministic fallback | 2026-03-20 |
| ADR-012 | Menu UI color refresh + item image entry points | Improve dashboard menu aesthetics and add item image placeholder plus Upload/Generate AI entry controls via UI-first incremental rollout | 2026-03-20 |
| ADR-013 | Item description authoring + AI description generation | Support manual item descriptions and add AI-generated copy with fallback via `/api/ai/menu/item-description` | 2026-03-20 |
| ADR-014 | Menu item image persistence via local S3 + DB file path | Persist only S3 object path (`image_path`) for menu items, add MinIO local storage flow, and wire upload/AI image generation endpoints into dashboard actions | 2026-03-20 |
| ADR-015 | S3 deletion queue + periodic cleanup worker | Track deleted/replaced image paths in DB and run scheduled retryable cleanup to remove orphaned S3 objects safely | 2026-03-20 |
| ADR-016 | Onboarding auto-slug, currency input, and drag-drop logo upload | Remove manual slug edits, enforce server-side unique slug generation, collect currency, and replace logo URL field with uploaded image flow | 2026-03-20 |
| ADR-017 | Dashboard logos + business archive lifecycle with 30-day retention delete | Improve dashboard identity using logos, replace destructive delete with reversible archive window, and enforce eventual hard delete with audit trail | 2026-03-20 |
| ADR-018 | Sitewide public UI redesign with home/QR auth dialogs | Introduce structured public shell, home hero/profile sections, light visual system, and dialog-based auth UX while retaining fallback auth routes | 2026-03-20 |
| ADR-019 | Layer 5 table + QR management contracts | Define implementation scope for table lifecycle, QR regeneration/history continuity, and QR download/export before Layer 5 coding | 2026-03-20 |
| ADR-020 | Gemini REST runtime for non-banana image provider | Add production-grade non-banana image generation path using Gemini REST APIs while preserving provider-switch compatibility and graceful fallbacks | 2026-03-20 |
| ADR-021 | Guardrails for text and image generation | Add shared backend AI guardrails to block unsafe prompts and sanitize generated menu text across generation endpoints | 2026-03-20 |
| ADR-022 | Gemini-only image generation runtime | Simplify menu image generation by removing Nano-Banana/provider switching and standardizing on Gemini REST only | 2026-03-20 |
| ADR-023 | Unified auth routes with QR-token scope resolution | Keep a single `/api/auth/*` surface and prevent cross-scope bleed by resolving customer scope from valid `qrToken` while maintaining strict cookie isolation | 2026-03-20 |
| ADR-024 | Dual-session visibility and scoped logout in unified auth | Show both valid business/customer sessions concurrently and allow explicit scoped logout/login actions without splitting auth route namespaces | 2026-03-20 |
| ADR-025 | Auth entry already-logged-in guard + dialog close controls | Prevent redundant auth writes when scope session already exists and ensure all auth dialogs expose explicit close actions with safe navigation | 2026-03-20 |
| ADR-026 | Reject in-place/global auth dialog controller; keep route-based auth redirects | Route-based auth pages are the preferred UX, and history-first close behavior is sufficient without shared global auth-dialog state | 2026-03-24 |
| ADR-027 | Public menu + client-side cart (Layer 6) — Accepted | Define public menu SSR + read-only API and local cart keyed by business/table/QR token; defer ordering/payments to Layer 7 | 2026-03-24 |
| ADR-029 | Notification read-state split (inbox + history) — Accepted | Durable unread tracking via `notification_inbox`, immutable history via `notification_events`, mark-read endpoints, and unread badge accuracy | 2026-03-24 |
| ADR-030 | Remove legacy `business_notifications` table — Accepted | Avoid duplicate notification storage and rely solely on inbox + history tables | 2026-03-24 |
| ADR-031 | Admin notification inbox — Accepted | Provide admin notifications for submissions/updates using existing inbox+history tables | 2026-03-24 |
| ADR-032 | Notification UX polish + blocked banner consistency — Accepted | Improve readability of notifications and standardize blocked-state messaging | 2026-03-24 |
| ADR-033 | Ordering & payments (Layer 7) — Accepted | Define order creation, Stripe checkout, webhook handling, and order status surfaces | 2026-03-24 |
| ADR-034 | Razorpay payments (replace Stripe) — Accepted | Support UPI by replacing Stripe with Razorpay order + signature verification flow | 2026-03-24 |
| ADR-035 | CSRF strategy for cookie-based auth — Accepted | Implement CSRF tokens for mutating routes | 2026-03-26 |
| ADR-036 | Layer 8 order management + retention + warehouse feed — Accepted | Define order status flow, dashboard scope, 6-month retention/partitioning, and event queue → ClickHouse warehouse | 2026-03-27 |
| ADR-037 | RBAC scope + org/business invites — Accepted | Add org model, scoped roles, invite accept/decline, and membership-gated business access | 2026-03-27 |
| ADR-038 | Roleless org membership (business roles only) — Accepted | Remove org roles; org ownership tracked on org; permissions derive from business roles | 2026-03-29 |
| ADR-039 | Cash payments + payment-gated order creation — Accepted | Require payment method at order creation, block Razorpay when unconfigured, and show paid/unpaid state with cash mark-paid action | 2026-03-29 |
| ADR-040 | Server-side order date filtering — Accepted | Move date filtering to DB queries using browser timezone and `updatedAt` window | 2026-03-30 |
| ADR-042 | Separate customer accounts + require login before orders — Accepted | Allow same-email business/customer accounts, enforce customer login, and restrict order access to owner | 2026-03-30 |
| ADR-043 | Customer orders hub page — Accepted | Add `/orders` hub with paginated customer orders list API and remove `/order/:id` deep links | 2026-03-30 |
| ADR-044 | Order dashboard notifications (toast + sound) — Accepted | Notify operators of new orders with toast + sound while dashboard is open | 2026-04-04 |
| ADR-045 | Business analytics endpoints (dashboard-scoped) — Accepted | Add Postgres + ClickHouse analytics endpoints with Redis caching and business timezone | 2026-04-04 |
| ADR-046 | API gateway layer | Front gateway all traffic and require internal API key for non-public API routes | 2026-04-09 |
| ADR-047 | Order status actors store user identity | Store `{ userId, email }` objects per status key in `status_actors` | 2026-04-09 |

---

## Key Commands

```bash
pnpm install              # install all deps
pnpm dev                  # start both frontend (:3000) and backend (:4000)
pnpm dev:api              # start backend only
pnpm dev:web              # start frontend only
pnpm --filter @scan2serve/api db:migrate   # run Prisma migrations
pnpm --filter @scan2serve/api db:seed      # seed admin user
```

### 2026-03-29 — Session 160: Web test fix
- Fixed orders page test mock to include `usePathname` and re-ran web tests.
- Web test suite now passes; React `act(...)` warnings still reported in header/menu tests.

### 2026-03-29 — Session 161: CLAUDE sync
- Synced root/API/web CLAUDE docs to reflect roleless org membership endpoints and the `/dashboard/orders` route.

### 2026-03-29 — Session 162: Orders UI refresh
- Reworked orders dashboard to a single list with hue-based status cards and a right-side filter/sort panel.

### 2026-03-29 — Session 163: ADR-039 drafted
- Drafted ADR-039 for cash payments + payment-gated order creation and payment-status tags.

### 2026-03-29 — Session 164: Cash payments + payment tags
- Accepted ADR-039 and implemented cash payment method + payment-gated order creation in public order flow.
- Added `payment_method` + `unpaid` payment status in Prisma and order APIs, plus mark-paid endpoint for cash orders.
- Updated public menu checkout and orders dashboard UI to show payment tags and allow marking cash orders paid.

### 2026-03-30 — Session 165: Orders hydration fix
- Replaced order card button with a div + keyboard handling to avoid nested button hydration errors.

### 2026-03-30 — Session 166: Order tag layout
- Repositioned order status/payment tags into a single horizontal row to avoid overlapping card content.

### 2026-03-30 — Session 167: Orders date filter + status sort
- Added today/yesterday date filter and status-based sort option on orders dashboard.

### 2026-03-30 — Session 168: ADR-040 drafted
- Drafted ADR-040 for server-side order date filtering (timezone + date basis pending).

### 2026-03-30 — Session 169: Server-side order date filter
- Implemented server-side order date filtering using browser timezone and `updatedAt` window; orders page now passes `date` + `tzOffset`.

### 2026-03-30 — Session 170: Order completion guard
- Added ORDER_NOT_PAID guard to block completing orders until payment is paid.

### 2026-03-30 — Session 171: ADR-041 drafted
- Drafted ADR-041 for requiring customer login before order placement.

### 2026-03-30 — Session 172: ADR-042 drafted
- Drafted ADR-042 for separating customer accounts and requiring login before order placement.

### 2026-03-30 — Session 173: Customer account separation
- Added customer user model + refresh tokens, required customer login before orders, and enforced order ownership for `/order/:id`.

### 2026-03-30 — Session 174: QR auth single identifier field
- Simplified QR customer login/register forms to a single email-or-phone input with identifier inference before submit.

### 2026-03-30 — Session 175: Customer orders hub ADR draft
- Drafted ADR-043 proposing a customer orders hub page and customer-scoped orders list API; awaiting answers.

### 2026-03-30 — Session 176: ADR-043 verification
- Accepted ADR-043 and aligned decisions: `/orders` hub, remove `/order/:id`, 10-item pagination, and active-order default selection rule.
- Added ADR-043 implementation task checklist for redirects, route removal, API, tests, and doc updates.

### 2026-03-30 — Session 177: ADR-043 implementation
- Added `/orders` customer hub UI with list + detail selection and removed `/order/[id]`.
- Added `GET /api/public/orders` list endpoint with cursor pagination and updated shared order list types.
- Updated redirects, tests, and docs to reflect `/orders` hub.

### 2026-03-30 — Session 178: Orders link in navbar
- Added a `View orders` link inside the customer profile dropdown in the navbar.

### 2026-03-30 — Session 179: Orders hub sizing
- Enlarged current-order cards and collapsed history orders into a smaller toggled list.

### 2026-03-30 — Session 180: Public routes test fix
- Added `prisma.order.findFirst` to public route test mocks to unblock customer order pagination tests.

### 2026-03-30 — Session 181: API tests run
- Ran `pnpm --filter @scan2serve/api test` (16 files, 99 tests passed; warnings for missing AI keys).

### 2026-03-30 — Session 182: Web tests run
- Updated orders hub test assertions and re-ran `pnpm --filter @scan2serve/web test` (17 files, 55 tests passed; act warnings remain).

### 2026-03-30 — Session 183: ADR-036 Task 1 foundation
- Added `OrderEventOutbox` schema + migration to persist order events for warehouse ingestion.
- Implemented outbox worker to ship events to ClickHouse with retry/backoff and database/table auto-creation.
- Enqueued order events into outbox from order create/payment/status flows and started worker in API bootstrap.
- Added ClickHouse service and env wiring to `docker-compose.yml`.
- Documented ClickHouse/outbox env settings in `apps/api/.env.example`.

### 2026-03-30 — Session 184: Redis Streams queue for warehouse feed
- Updated ADR-036 to route order events through outbox → Redis Streams → ClickHouse.
- Added Redis Streams publisher + consumer workers and wired the consumer into API bootstrap.
- Added Redis service/env wiring in `docker-compose.yml` and queue env settings in `apps/api/.env.example`.
- Resolved compose port collision by mapping ClickHouse native port to host `9002`.

### 2026-03-30 — Session 185: ADR-036 partitioning + retention
- Added composite primary keys for partitioned `orders` and `order_items` and introduced `order_created_at` on order items.
- Added migration to convert existing order tables into native monthly partitions.
- Implemented partition maintenance worker to create/drop monthly partitions and wired it into API bootstrap.
- Updated ADR-036 and env configs to document partitioning/retention settings.

### 2026-03-30 — Session 186: API tests after partitioning
- Installed local deps and re-ran `pnpm --filter @scan2serve/api test` (16 files, 99 tests passed; expected warnings for missing AI keys/outbox mocks).

### 2026-03-30 — Session 187: Layer 8 UI polish
- Enhanced orders dashboard with summary metrics, refresh control, and loading skeletons.
- Added test-env guard to skip notification fetches in header to reduce act warnings in web tests.

### 2026-03-30 — Session 188: Order status accountability
- Added `status_actors` JSONB field on orders with migration and status-actor updates on order status transitions.
- Surfaced status-actor accountability in the orders detail UI.

### 2026-03-30 — Session 190: Status actor flow UI
- Replaced per-status actor list with a horizontal flow timeline in the orders detail modal.

### 2026-03-30 — Session 191: Status actor arrow highlight
- Highlighted the active pending→confirmed arrow and moved actor labels to the connectors between statuses.

### 2026-03-30 — Session 192: Vertical workflow timeline
- Reworked order status activity to a vertical workflow timeline for responsive layouts.

### 2026-03-30 — Session 193: Workflow side pane
- Moved the order activity workflow into a side pane inside the order detail modal.

### 2026-03-30 — Session 194: Mobile workflow toggle
- Added a mobile collapsible toggle for the workflow and refactored the activity timeline into a reusable component.

### 2026-03-30 — Session 195: Order modal layout
- Widened the orders detail modal and made modal width configurable to support side-pane layouts.

### 2026-03-30 — Session 196: Modal mobile overflow fix
- Constrained modal height and enabled scrolling to avoid mobile overflow.

### 2026-03-30 — Session 197: Workflow connector actors
- Updated workflow timeline to show completed/current/upcoming states and display actor labels on connectors between steps.

### 2026-03-30 — Session 198: Workflow UI simplification
- Simplified the workflow timeline to a minimal vertical list with actor labels on connectors.

### 2026-03-30 — Session 199: Workflow connector labels
- Adjusted connector labels to use the next step actor and removed the "handled by" prefix.

### 2026-03-30 — Session 201: Remove placeholder analytics
- Removed placeholder analytics cards from dashboard orders and overview pages pending analytics endpoints.

### 2026-03-30 — Session 200: Order summary metrics
- Excluded cancelled orders from summary metrics and limited revenue to paid orders.

### 2026-03-30 — Session 189: Local dev scripts
- Added `scripts/setup-local.sh` and `scripts/run-local.sh` for local (non-container) setup and service startup.

### 2026-03-30 — Session 202: ADR-043 checklist complete
- Marked ADR-043 implementation task checklist as completed in `docs/adr/ADR-043-customer-orders-hub.md`.

### 2026-03-30 — Session 203: Reordered post-ADR TODOs
- Reordered the post ADR-036 TODO list in `STATUS.md` so analytics endpoints are listed first, followed by private networking and Grafana.

### 2026-04-04 — Session 161: Orders polling freshness
- Set client GET requests to use `cache: "no-store"` in `apiFetch` to prevent stale polling responses.
- Added focus/visibility refresh trigger for orders dashboard polling so new orders appear without manual refresh.

### 2026-04-04 — Session 163: Order notifications (toast + sound)
- Accepted ADR-044 and implemented new-order toast + sound notifications on the orders dashboard.
- Added bundled notification tone at `apps/web/public/sounds/order-notification.wav`.

### 2026-04-05 — Session 164: Compose migrate deploy
- Added non-interactive Prisma migration script, switched compose API startup to use it, and ensured Prisma client generation before seeding in containers.

### 2026-04-05 — Session 165: Compose tests profile
- Moved the `tests` compose service behind a `tests` profile so it does not run during default `docker compose up`.

### 2026-04-05 — Session 166: Compose tests script
- Added `scripts/test-compose.sh` and moved tests behind a `tests` profile so default compose no longer runs tests; updated README/dev script notes.

### 2026-04-05 — Session 167: Tests compose network fix
- Updated the tests compose script to use a dedicated project name and clean up stale networks before running.

### 2026-04-05 — Session 168: Compose container name cleanup
- Removed hardcoded container names in compose to avoid cross-project conflicts when running tests profile.

### 2026-04-08 — Session 169: ClickHouse bootstrap auth fix
- Aligned ClickHouse bootstrap credentials in `apps/api/.env` with `clickhouse-users/admin.xml` so `clickhouse:users` can authenticate as the admin user during compose startup.
### 2026-04-08 — Session 170: Healthcheck interval update
- Reverted orders dashboard polling interval to 15 seconds (`apps/web/src/app/dashboard/orders/page.tsx`).
- Set API and web `/healthz` docker-compose healthcheck interval to 1 minute (`docker-compose.yml`).
### 2026-04-08 — Session 171: ADR-046 drafted
- Drafted ADR-046 for an API gateway layer with open questions on gateway tech, scope, and initial rate limiting (`docs/adr/ADR-046-api-gateway-layer.md`).

### 2026-04-09 — Session 172: ADR-046 internal API key
- Updated ADR-046 to require an internal API key header from the gateway for API requests, never exposed to browsers (`docs/adr/ADR-046-api-gateway-layer.md`).

### 2026-04-09 — Session 173: ADR-046 accepted
- Accepted ADR-046 with gateway-fronts-both and internal API key required for non-public routes (`docs/adr/ADR-046-api-gateway-layer.md`).

### 2026-04-09 — Session 174: Gateway routing baseline
- Added Nginx gateway routing config and compose service (`gateway/nginx.conf`, `docker-compose.yml`).
- Added `gateway/CLAUDE.md` with gateway conventions and update notes.

### 2026-04-09 — Session 175: Internal API key enforcement
- Added internal API key middleware for non-public API routes and wired it into API bootstrap (`apps/api/src/middleware/internalApiKey.ts`, `apps/api/src/index.ts`).
- Updated gateway routing to use envsubst template and inject `X-Internal-Api-Key` (`gateway/nginx.conf.template`, `docker-compose.yml`).
- Added `INTERNAL_API_KEY` to API env sample and local env (`apps/api/.env.example`, `apps/api/.env`).

### 2026-04-09 — Session 176: Gateway primary entry
- Exposed the gateway on `:3000` and removed direct `web`/`api` ports; updated `NEXT_PUBLIC_API_URL` to `http://localhost:3000` (`docker-compose.yml`, `apps/web/.env`, `apps/web/.env.example`).
### 2026-04-09 — Session 177: Gateway internal key fix
- Replaced hardcoded internal API key in the gateway template with envsubst variable (`gateway/nginx.conf.template`).
