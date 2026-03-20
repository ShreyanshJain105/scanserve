# Project Status

> **How this file works:**
> - **Last Session** — overwritten each session. This is what a new Claude reads first for fast pickup.
> - **Timeline** — append-only log. Never delete or modify past entries. New entries go at the bottom.
> - **Decisions Log** — append-only. All ADRs recorded here.

---

## Last Session

**Date:** 2026-03-20
**What was done:**
- Marked ADR-018 as accepted and implemented a public-site UI redesign in web.
- Added reusable public shell with clear `header` + `main` sections/subsections + `footer` (`apps/web/src/components/public/public-site-shell.tsx`).
- Redesigned home page (`apps/web/src/app/home/page.tsx`) with hero section, structured content sections, light visual direction, and authenticated profile section with a single role CTA.
- Added reusable dialog surface (`apps/web/src/components/ui/modal-dialog.tsx`) and shared business auth forms (`apps/web/src/components/auth/business-auth-forms.tsx`).
- Converted auth UX:
  - `/home` now uses dialog-based login/register flows,
  - `/login` and `/register/business` remain functional fallback routes and render dialog-style auth surfaces,
  - `/qr/login` and `/qr/register` now use dialog-style QR auth experiences.
- Updated public menu placeholder to use the same shell and section structure (`apps/web/src/app/menu/[slug]/page.tsx`).
- Added home-page coverage (`apps/web/tests/home-page.test.tsx`) and revalidated web quality gates:
  - `pnpm --filter @scan2serve/web test` passes (`29/29`),
  - `pnpm --filter @scan2serve/web build` passes.

**What's NOT done yet:**
- Local runtime validation with real Nano-Banana credentials is still pending (env placeholders are set, provider key/url not configured).
- Image moderation/quality guardrails for generated images are still minimal and should be hardened.
- Cleanup queue monitoring endpoint/dashboard is not implemented yet (logs-only observability).
- Layer 5+ features (tables/QR advanced flows, ordering/payments, dashboards) remain pending.
- Production cookie/CORS hardening review still pending once deploy targets are fixed.
- UI professionalism polish pass is deferred until QR scanning and end-to-end customer flows are fully in place (current redesign kept as interim baseline).

**Next step:** Archive lifecycle observability + migration/runbook hardening
1. Add admin/debug endpoint for archive cleanup worker health and recent archived-delete audit entries.
2. Consider persisting explicit `logo_path` for businesses to avoid URL parsing when enqueuing logo cleanup.
3. Add startup/runbook guard to ensure schema sync (`db:push`/migrate) is always re-run after enum/status model changes.
4. Add targeted dashboard regression test for loading-to-ready rerender path to catch future hook-order regressions earlier.
5. After QR scan + customer flow completion, run a dedicated UI professional-polish iteration (visual system, detail consistency, interaction/accessibility QA).

**Build progress:**
```
Layer 1:  Foundation          ✅ DONE
Layer 2:  Authentication      ✅ DONE
Layer 3:  Business Onboarding ✅ DONE
Layer 4:  Menu Management     ← NEXT
Layer 5:  Table & QR Codes
Layer 6:  Public Menu & Cart
Layer 7:  Ordering & Payments
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

---

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
