# Project Status

> **How this file works:**
> - **Last Session** — overwritten each session. This is what a new Claude reads first for fast pickup.
> - **Timeline** — append-only log. Never delete or modify past entries. New entries go at the bottom.
> - **Decisions Log** — append-only. All ADRs recorded here.

---

## Last Session

**Date:** 2026-03-19
**What was done:**
- Hardened ADR-006 customer QR auth protections:
  - Added in-memory QR auth rate limiter middleware (`apps/api/src/middleware/qrAuthRateLimit.ts`).
  - Applied rate limit checks to customer register/login paths in `apps/api/src/routes/auth.ts`.
  - Added env controls in `apps/api/.env.example`: `QR_AUTH_RATE_LIMIT_WINDOW_SEC`, `QR_AUTH_RATE_LIMIT_MAX_ATTEMPTS`.
- Extended API test coverage:
  - Added repeated-attempt rate-limit test in `apps/api/tests/authRoutes.test.ts` (expects `429 QR_AUTH_RATE_LIMITED`).
  - Existing QR/public/auth tests still pass.
- Validation completed:
  - `pnpm --filter @scan2serve/api test` passes (14 tests).
  - `pnpm --filter @scan2serve/web test` passes.
  - `pnpm --filter @scan2serve/api build` passes.
  - `pnpm --filter @scan2serve/web build` passes.

**What's NOT done yet:**
- ADR-006 remains partial:
  - `/menu/[slug]` is still placeholder UI (Layer 6 real public menu not implemented).
  - QR token hardening lifecycle (rotation/revocation mechanics) is still pending.
  - More negative/tamper cases are still pending around refresh and mixed-role cookie edge cases.
- Layer 4+ features (menu/table/order/payment flows) are still pending implementation.
- Production cookie/CORS hardening review still pending once deploy targets are fixed.

**Next step:** Complete ADR-006 enforcement before Layer 4
1. Expand auth negative tests (especially refresh + cookie-mixing edge cases).
2. Finalize QR token lifecycle policy implementation (rotation/revocation mechanics).
3. After ADR-006 hardening, start Layer 4 ADR and menu-management implementation.

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

---

## Decisions Log

| # | Decision | Why | Date |
|---|----------|-----|------|
| ADR-001 | pnpm workspaces (not npm/Nx) | Strict dep isolation without overhead; Nx overkill for 2 apps at MVP | 2026-03-14 |
| ADR-003 | Testing strategy (Vitest, supertest, testing-library; status field enforcement) | Establish unified test stack and coverage expectations across API & web | 2026-03-19 |
| ADR-004 | Business onboarding flow and admin approval gate | Define Layer 3 boundaries before implementation (business profile lifecycle + admin moderation) | 2026-03-19 |
| ADR-006 | QR-scoped customer auth with business-only website auth | Remove non-QR customer pathways, keep shared auth endpoints, and enforce QR token context for customer auth | 2026-03-19 |

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
