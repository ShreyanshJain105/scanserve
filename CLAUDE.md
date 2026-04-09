# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Startup

**Every new session MUST start by:**
1. Read the **"Last Session"** section of `STATUS.md` — this tells you exactly where to pick up
2. Read the relevant CLAUDE.md files in the folders you'll be working in (e.g., `apps/api/CLAUDE.md`)
3. If you need deeper history, read the **"Timeline"** section of `STATUS.md`

**Every session MUST end by updating `STATUS.md`:**
1. **Overwrite** the "Last Session" section with: what you did, what's not done, next step, build progress
2. **Append** a new entry to the "Timeline" section (never delete or modify past entries)
3. **Append** any new ADRs to the "Decisions Log" (never delete past entries)

## Workflow Rules

- **ADR First:** Before implementing any feature or creating any PR, always create an Architecture Decision Record (ADR) documenting context, decision, and consequences. Present the ADR to the user and get explicit approval before writing any code.
- **Explain Decisions:** When building features or making structural choices, explain the reasoning, technical cost, and technical debt trade-offs.
- **Update STATUS.md:** At the end of every work session, update `STATUS.md` with current state, next steps, and any ADRs made.
- **Local CLAUDE.md:** Create a CLAUDE.md in each major feature folder for local context.
- **UX Messaging Rule:** User notifications/errors must be shown as toast notifications, not persistent inline page text banners/messages.

## Project Overview

**Scan2Serve** — A platform where restaurants/cafés create digital menus accessible via QR codes. Customers scan QR codes at tables to view menus, place orders, and pay online (Razorpay). Business owners manage menus, tables, and orders through a dashboard. Admins approve businesses and oversee the platform.

## Tech Stack

- **Frontend:** Next.js (App Router) + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express REST API
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** JWT-based, three roles: customer, business, admin
- **Payments:** Razorpay (Checkout)
- **QR Generation:** `qrcode` npm package (server-side)
- **File Storage:** Local/S3 for menu item images

## Architecture

```
Next.js Frontend (apps/web/)
  ├── Public Menu + Ordering (customer-facing, mobile-first)
  ├── Business Dashboard (protected, business role)
  └── Admin Panel (protected, admin role)
        │
        │ REST API calls
        ▼
Nginx Gateway (gateway/)
        │
        ▼
Express.js Backend (apps/api/)
  ├── Auth (register, login, JWT, role middleware)
  ├── Menu CRUD (categories, items, images)
  ├── Table & QR Management (bulk create, download)
  ├── Order Management (create, status updates, filtering)
  └── Payments (Razorpay checkout + signature verification)
        │               ▲
        ▼               │
PostgreSQL DB    packages/shared/
(Prisma ORM)    (types, validators, constants)
```

## Project Structure (Monorepo)

Uses npm/pnpm workspaces. Backend and frontend are separate apps under `apps/`. Shared code lives in `packages/`.

```
scan2serve/
├── package.json             # root workspace config
├── turbo.json               # Turborepo config (optional)
├── CLAUDE.md
├── apps/
│   ├── web/                 # Next.js frontend (App Router)
│   │   ├── package.json
│   │   ├── app/
│   │   │   ├── (auth)/      # login, register pages
│   │   │   ├── (public)/    # public menu, order status
│   │   │   ├── dashboard/   # business owner dashboard
│   │   │   └── admin/       # admin panel
│   │   ├── components/
│   │   │   ├── ui/          # shadcn/ui components
│   │   │   ├── menu/        # menu display components
│   │   │   ├── cart/        # cart components
│   │   │   ├── dashboard/   # dashboard components
│   │   │   └── admin/       # admin components
│   │   ├── lib/             # API client, utils, auth helpers
│   │   └── hooks/           # custom React hooks
│   └── api/                 # Express backend
│       ├── package.json
│       ├── src/
│       │   ├── routes/      # auth, business, menu, orders, admin, payments
│       │   ├── middleware/   # auth, validation, error handling
│       │   ├── services/    # business logic layer
│       │   └── utils/       # helpers (QR generation, etc.)
│       └── prisma/
│           ├── schema.prisma
│           └── seed.ts
└── packages/
    └── shared/              # shared TypeScript types, constants, validators
        ├── package.json
        └── src/
```

### Monorepo Commands (from root)
- `pnpm dev` — starts both web and api in parallel
- `pnpm dev:web` — start frontend only
- `pnpm dev:api` — start backend only
- `pnpm build` — build all apps
- `pnpm lint` — lint all apps
- `pnpm --filter @scan2serve/api test` — run API tests
- `pnpm --filter @scan2serve/web test` — run web tests
- Shared package imported as `@scan2serve/shared` in both apps

## Database Schema

- `users` — id, email, password_hash, role (business|admin), created_at, updated_at
- `customer_users` — id, email?, phone?, password_hash, created_at, updated_at
- `businesses` — id, user_id (FK), name, slug, currency_code, country_code, timezone, description, logo_url, address, phone, status (pending|approved|rejected|archived), archived_at, archived_previous_status, created_at, updated_at
- `business_rejections` — rejection history for businesses (reason + created_at)
- `categories` — id, business_id (FK), name, sort_order
- `menu_items` — id, category_id (FK), business_id (FK), name, description, price, image_path, is_available, dietary_tags[], sort_order
- `tables` — id, business_id (FK), table_number (int, unique per business), label (optional), is_active, created_at
- `qr_codes` — id, business_id (FK), table_id (FK), unique_code, qr_image_url, created_at
- `qr_code_rotations` — tracks QR token regeneration with optional grace expiry
- `orders` — id, business_id (FK), table_id (FK), customer_user_id (FK), status (pending|confirmed|preparing|ready|completed|cancelled), total_amount, payment_status, payment_method, razorpay_order_id, razorpay_payment_id, customer_name, customer_phone, created_at (partition key; composite PK with id)
- `order_items` — id, order_id (FK), order_created_at (partition/FK key), menu_item_id (FK), quantity, unit_price, special_instructions
- `refresh_tokens` — hashed refresh token records for business/admin
- `customer_refresh_tokens` — hashed refresh token records for customers
- `deleted_asset_cleanups` — retryable queue for deferred S3 object deletions
- `archived_business_deletion_audits` — immutable audit records for retention-triggered archived business deletions

## API Endpoints

Current API implementation (selected, high-signal routes):

### Auth
- `POST /api/auth/register` — register business or QR-scoped customer
- `POST /api/auth/login` — login with business/admin or QR-scoped customer constraints
- `POST /api/auth/refresh` — rotate refresh token and re-issue cookies
- `POST /api/auth/logout` — revoke refresh token and clear auth cookies
- `GET  /api/auth/me` — current user profile
- `GET  /api/auth/sessions` — dual-session snapshot for business + customer scopes
- `GET  /api/auth/csrf` — issue CSRF token for mutating requests

### Business Onboarding
- `POST /api/business/profile` — create profile (slug auto-generated server-side)
- `GET /api/business/profiles` — list current user business profiles
- `GET /api/business/profile` — get resolved active profile
- `PATCH /api/business/profile` — update profile (slug immutable)
- `POST /api/business/profile/logo` — upload onboarding logo (multipart)
- `PATCH /api/business/profile/archive` — archive a business profile (owner action)
- `PATCH /api/business/profile/restore` — restore archived business within retention window

### Business Menu + Images
- `GET/POST/PATCH/DELETE /api/business/categories...` — category CRUD + reorder
- `GET/POST/PATCH/DELETE /api/business/menu-items...` — menu item CRUD + reorder + availability
- `POST /api/business/menu-items/:id/image/upload` — upload menu image
- `POST /api/business/menu-items/:id/image/generate` — generate menu image via provider
- `GET /api/business/menu-suggestions/categories`
- `GET /api/business/menu-suggestions/items`

### Org + Memberships
- `POST /api/business/org` — create org (owner membership)
- `GET /api/business/org/membership` — current user org membership (or null)
- `GET /api/business/org/members` — list org members (roleless, includes `isOwner`)
- `GET /api/business/org/invites/check`
- `POST /api/business/org/invites`
- `POST /api/business/org/invites/:id/accept`
- `POST /api/business/org/invites/:id/decline`
- `POST /api/business/org/leave`
- `POST /api/business/memberships` — assign business membership (owner/manager)
- `GET /api/business/memberships` — list business memberships for a business
- `DELETE /api/business/memberships` — revoke business membership (owner/manager)

### Order Management (Business)
- `GET /api/business/orders` — status/date filter + cursor pagination (`date=today|yesterday|all`, `tzOffset` minutes)
- `GET /api/business/orders/:id` — order detail
- `PATCH /api/business/orders/:id/status` — status transition
- `PATCH /api/business/orders/:id/mark-paid` — mark cash orders as paid

### AI
- `GET /api/ai/menu/item-suggestions`
- `POST /api/ai/menu/item-description`

### QR / Public
- `GET /api/public/qr/:qrToken` — resolve QR token to business/table context
- `GET /api/public/orders` — list customer orders (cursor pagination)
- `POST /api/public/orders` — create order (server computes totals)
- `POST /api/public/orders/:id/checkout` — create Razorpay checkout
- `POST /api/public/orders/:id/verify-payment` — verify Razorpay payment
- `GET /api/public/orders/:id` — order detail for customer
- `GET /api/business/tables` — list tables (pagination/filter) with QR metadata
- `POST /api/business/tables/bulk` — bulk create tables with QR issuance
- `PATCH /api/business/tables/:tableId` — update table label/active state
- `POST /api/business/tables/:tableId/qr/regenerate`
- `GET /api/business/tables/:tableId/qr/rotations`
- `GET /api/business/tables/:tableId/qr/download?format=png|svg`
- `POST /api/business/tables/qr/download` — batch QR ZIP export

### Admin
- `GET    /api/admin/businesses` — list (filter by status)
- `PATCH  /api/admin/businesses/:id/approve`
- `PATCH  /api/admin/businesses/:id/reject`

### Placeholders / Not fully implemented yet
- `GET /api/business/menu` currently returns placeholder payload.

## Feature Dependency Pyramid

Build features in this order. Each layer depends on the layers above it.

```
═══════════════════════════════════════════════════════════════════════════════
                            LAYER 1: FOUNDATION
═══════════════════════════════════════════════════════════════════════════════
 • Project scaffolding (Next.js + Express + PostgreSQL + Prisma)
 • Database schema & migrations
 • Environment config & dev tooling (ESLint, Prettier, Tailwind)
═══════════════════════════════════════════════════════════════════════════════

       ┌──────────────────────────────────────────────────────┐
       │              LAYER 2: AUTHENTICATION                 │
       ├──────────────────────────────────────────────────────┤
       │ • User registration (customer / business)           │
       │ • Login / JWT token issuance                        │
       │ • Role-based middleware (customer, business, admin)  │
       │ • Auth context & protected routes (frontend)        │
       └──────────────────────────────────────────────────────┘

      ┌────────────────────────────────────────────────────────┐
      │            LAYER 3: BUSINESS ONBOARDING                │
      ├────────────────────────────────────────────────────────┤
      │ • Business registration form (name, address, phone,   │
      │   logo)                                                │
      │ • Business profile stored with status=pending          │
      │ • Admin approval / rejection of businesses             │
      │ • Business status notifications                        │
      └────────────────────────────────────────────────────────┘

     ┌──────────────────────────────────────────────────────────┐
     │              LAYER 4: MENU MANAGEMENT                    │
     ├──────────────────────────────────────────────────────────┤
     │ • Category CRUD (create, rename, reorder, delete)       │
     │ • Menu item CRUD (name, desc, price, image, dietary     │
     │   tags, availability)                                   │
     │ • Image upload & storage                                │
     │ • Drag-and-drop reordering                              │
     │ • Bulk availability toggle (sold out)                   │
     └──────────────────────────────────────────────────────────┘

    ┌────────────────────────────────────────────────────────────┐
    │         LAYER 5: TABLE MANAGEMENT & QR CODES               │
    ├────────────────────────────────────────────────────────────┤
    │ • Bulk table creation (owner specifies count → 1..N)      │
    │ • Table label editing (e.g. "Table 5" → "Patio 3")       │
    │ • Table active / inactive toggle                          │
    │ • Auto QR code generation per table                       │
    │ • QR encodes: /menu/{slug}?table={number}                 │
    │ • Individual QR download (PNG/SVG)                        │
    │ • Batch QR download (ZIP/PDF) with table numbers printed  │
    │ • Add more tables incrementally                           │
    └────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────┐
   │              LAYER 6: PUBLIC MENU & CART                      │
   ├──────────────────────────────────────────────────────────────┤
   │ • Public menu page /menu/[slug]?table=N (SSR, mobile-first) │
   │ • Categories as tabs/sections, items with images & prices   │
   │ • Dietary tag filters                                       │
   │ • Client-side cart (add, remove, update qty, special notes) │
   │ • Cart drawer/sidebar with order summary                    │
   │ • Table number auto-detected from QR scan URL               │
   └──────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────┐
  │              LAYER 7: ORDERING & PAYMENTS                      │
  ├────────────────────────────────────────────────────────────────┤
  │ • Order submission API (items, table_id, customer name/phone) │
  │ • Razorpay order creation                                     │
  │ • Razorpay signature verification                             │
  │ • Payment flow: cart → Razorpay Checkout → status page        │
  │ • Order confirmation with order number                        │
  │ • Customer orders hub /orders (list + selected order detail)  │
  └────────────────────────────────────────────────────────────────┘

 ┌──────────────────────────────────────────────────────────────────┐
 │          LAYER 8: ORDER MANAGEMENT (BUSINESS SIDE)               │
 ├──────────────────────────────────────────────────────────────────┤
 │ • Order list API (filter by status, date, table number)         │
 │ • Order status update API                                       │
 │   (pending → confirmed → preparing → ready → completed)         │
 │ • Live order board UI (Kanban or list view)                     │
 │ • Order detail modal (items, table #, customer info, notes)     │
 │ • Quick action buttons to advance status                        │
 │ • Audio / browser notification on new orders                    │
 │ • Auto-polling every 15s for new orders                         │
 └──────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│          LAYER 9: BUSINESS DASHBOARD & ANALYTICS                   │
├────────────────────────────────────────────────────────────────────┤
│ • Dashboard overview (today's orders, pending count, revenue)     │
│ • Sidebar navigation (Overview, Menu, Tables & QR, Orders)        │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     LAYER 10: ADMIN PANEL                            │
├──────────────────────────────────────────────────────────────────────┤
│ • Business approval queue (pending list, approve/reject actions)    │
│ • Business directory (all businesses, search, filter by status)     │
│ • User management (list, search, disable accounts)                  │
│ • Platform-wide stats (total businesses, orders, revenue)           │
└──────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                   LAYER 11: POLISH & DEPLOYMENT                        │
├────────────────────────────────────────────────────────────────────────┤
│ • Loading skeletons & empty states                                    │
│ • Toast notifications & error handling                                │
│ • Client + server form validation                                     │
│ • Mobile responsiveness audit                                         │
│ • Rate limiting & input sanitization                                  │
│ • Deploy: Vercel (frontend) + Railway/Render (API) + managed Postgres │
│ • Domain, SSL, CORS, production Razorpay keys                         │
│ • Seed admin account                                                  │
│ • End-to-end flow testing                                             │
└────────────────────────────────────────────────────────────────────────┘
```

## Updates 2026-03-27
- Added `tests` service in `docker-compose.yml` to run `pnpm --filter @scan2serve/api test` and `pnpm --filter @scan2serve/web test` inside Docker.
- Synced root spec with org/membership and order-management API routes plus new dashboard/explore/org pages.
- Fixed org-create submission payload to JSON.stringify (avoids `[object Object]` JSON parse errors).
- Dashboard now auto-redirects org owners with zero businesses to `/dashboard/onboarding`.

## Key Frontend Routes

| Route | Role | Purpose |
|-------|------|---------|
| `/` | dynamic | Root redirect entrypoint (routes by auth role/state) |
| `/home` | public | Public landing page |
| `/explore` | public | Use-case overview + org entry point |
| `/login` | public | Login form |
| `/register` | public | Business registration redirect page |
| `/dashboard` | business | Dashboard overview + approval gating |
| `/dashboard/onboarding` | business | Business onboarding/edit flow |
| `/dashboard/org/create` | business | Org creation form |
| `/dashboard/org-invite/[inviteId]` | business | Org invite preview + accept/decline |
| `/dashboard/menu` | business | Menu/category management + image + AI assist |
| `/dashboard/tables` | business | Tables + QR management |
| `/dashboard/orders` | business | Order management (polling list + status transitions) |
| `/admin` | admin | Moderation panel (approve/reject businesses) |
| `/qr/[qrToken]` | public | QR entry route (resolve + redirect) |
| `/qr/login` | public | QR-scoped customer login |
| `/qr/register` | public | QR-scoped customer registration |
| `/menu/[slug]` | public | Public menu placeholder route |
| `/orders` | public | Customer orders hub (list + detail) |

Planned but not yet present in web app routes:
- (none for Layer 8 UI; `/dashboard/orders` is now implemented)

## Key Design Decisions

- **Polling over WebSockets** for order updates (15s interval). Simpler for MVP; WebSocket upgrade planned post-MVP.
- **Table mapping included** — businesses specify table count, each gets a numbered QR. No visual floor plan in MVP.
- **Payments required** — all orders go through Razorpay. No cash/pay-at-counter in MVP.
- **Admin-approved onboarding** — businesses register → pending → admin approves before they can create menus.
- **English only** for MVP; currency is selected per business profile (`currency_code`).
- **Mobile-first** public menu — most customers scan QR from phones.

## Implemented Scope Snapshot (Current)

This section is the high-level source of truth for what is already implemented across features.

- **Layer 1 Foundation**
  - Monorepo setup with `apps/api`, `apps/web`, and `packages/shared`.
  - Prisma/PostgreSQL baseline schema and migrations.
  - Docker Compose local runtime with healthchecks for db/api/web/minio.

- **Layer 2 Authentication**
  - Access + refresh cookie auth with refresh rotation.
  - Role-aware routing (`business`, `admin`, QR-scoped `customer`).
  - Main-site registration/login constrained to business/admin paths; customer auth is QR-scoped only (ADR-006).
  - Auth status/refresh fallback flow used by root route redirect logic.

- **Layer 3 Business Onboarding + Approval**
  - Business profile create/update + admin approve/reject flow.
  - Onboarding lock states in dashboard for pending/rejected businesses.
  - Auto-generated immutable business slug (server-side uniqueness handling).
  - Currency code persistence on business profile.
  - Onboarding logo upload via multipart (S3-compatible storage path behind API).
  - Business archive lifecycle is active:
    - owner can archive with confirm flow,
    - archived businesses are restorable within retention window,
    - retained archives are auto-deleted after 30 days via worker + audit record.
  - Onboarding currency selector uses app-styled searchable combobox with:
    - single-row search/display input,
    - selection-only commit behavior,
    - close-on-select and anti-refocus guard (`label htmlFor`, not wrapper label).

- **Layer 4 Menu Management**
  - Category CRUD/reorder and menu item CRUD/edit/delete/availability controls.
  - Dashboard menu page with pagination and business-status-aware behavior.
  - Menu item dietary tags and UI badges.
  - Item description support: manual input + AI generation endpoint (ADR-013).

- **Layer 5 Table + QR Management**
  - Business table lifecycle endpoints (list, bulk create, label edit, active toggle).
  - QR token regeneration/history plus table-scoped single QR downloads (PNG/SVG).
  - Batch QR ZIP export endpoint for active/selected tables.
  - `/dashboard/tables` UI for table operations and QR download workflows.

- **Layer 8 Order Management**
  - Business order list/detail/status endpoints with cursor pagination and status transitions.
  - `/dashboard/orders` UI with polling list, detail modal, and action buttons.

- **AI Assistance (ADR-010 / ADR-011 / ADR-013)**
  - Category/item suggestion endpoints with deterministic fallback behavior.
  - Dedicated AI API namespace (`/api/ai/*`).
  - Singleton LLM client/model-handle initialization pattern in API.
  - Timeout-aware fallback behavior and suggestion-quality guardrails.

- **Image Storage + Lifecycle (ADR-014 / ADR-015)**
  - Menu item image persistence stores object path (`image_path`) in DB, not raw image URL.
  - S3-compatible object storage service with MinIO local defaults.
  - Image upload and AI-image generation endpoints for menu items.
  - Deleted asset cleanup queue + periodic retryable cleanup worker for deferred S3 deletion.

- **Infra + Observability Highlights**
  - Structured API request logging via singleton logger.
  - `/healthz` endpoints for API and web; compose probes target `/healthz`.
  - Docker runtime note: web server-side fetches should use `API_INTERNAL_URL` in containers.

- **UI/UX Policy**
  - User-facing notifications/errors must use toasts (not inline banner/status text).

## Updates 2026-03-19
- Added `skills/claude-context-programmer` and enabled UI metadata; auth phase ADR approved (refresh tokens + httpOnly cookies + status field responses).
- Testing mandate: Every new feature or app change must include/extend unit tests and integration/e2e coverage to verify flows work end-to-end.
- Future work logging: Any deferred/next-step items (e.g., CI, perf) must be explicitly noted in relevant CLAUDE.md sections so they aren’t missed later.
- TODO: Add GitHub Actions to run backend/frontend test suites with coverage gates once repo is ready for CI.
- Note: API route-level tests are present but skipped in this sandbox (Express router mock hangs without sockets). Re-enable or adapt when running in a permissive env.
- STATUS alignment completed: Layer 2 marked done, Layer 3 set as next, and ADR-004 drafted for business onboarding/approval flow pending acceptance.
- ADR-004 regenerated with implementation-ready detail (endpoint contracts, approval gating behavior, alternatives) for user review before Layer 3 coding.
- ADR-004 updated with an explicit ambiguity-resolution checklist (10 open questions) that must be answered in the ADR before acceptance and coding.
- API auth route-level tests were adapted to run in this sandbox without opening sockets; `apps/api` tests now pass fully (6/6) with no static skips.
- ADR-004 now contains resolved answers for all 10 open questions, including explicit defaults for admin listing, middleware failure contract, dashboard lock UX, login-time status refresh strategy, and a multi-business-per-user direction.
- ADR-004 has been accepted and Layer 3 implementation has started: business/admin onboarding routes, approval-gate middleware, dashboard onboarding/status UX, and new API/web tests.
- Docker compose runbook note: current `docker-compose up --build` is blocked by non-TTY `pnpm install` behavior unless `CI=true` is set in service env; after that, web service command still fails due incorrect `next dev` argument forwarding in compose command.
- Docker compose stabilization completed: removed obsolete compose `version`, added service healthchecks/depends_on conditions, added container-safe pnpm env (`CI=true`), fixed web startup command, and verified `db`/`api`/`web` boot from clean `down -v && up --build`.
- Stabilization follow-up completed: added Prisma migration baseline, resolved remaining API/web build blockers, and verified both app test suites + build pipelines pass.
- Compose healthcheck fix: use `127.0.0.1` (not `localhost`) for API/web probes to avoid IPv6 loopback false negatives; `docker-compose ps` now reports all services healthy.
- ADR-006 is now the accepted auth-scope policy: main website auth is business-only; customer auth is QR-scoped and must carry `qrToken` context.
- Non-QR customer auth paths are frozen by policy; do not add customer login/register pathways outside QR flows without a new ADR.
- Runtime docker note: if Next starts returning 500 with missing `.next/server/*` chunks in container, isolate `.next` using compose volume (`/app/apps/web/.next`) to avoid bind-mount artifact corruption.
- For server-side web fetches in docker, use `API_INTERNAL_URL` (e.g., `http://api:4000`) instead of browser-facing `NEXT_PUBLIC_API_URL` to avoid container-localhost routing failures.
- ADR-006 hardening update: QR customer-auth attempts are now rate-limited server-side; thresholds are env-configurable and covered by API tests.
- Additional ADR-006 auth hardening: mixed refresh-cookie requests are explicitly rejected and QR auth now enforces business/table availability before allowing customer auth.
- ADR-006 lifecycle step added: business-side QR token regeneration endpoint now rotates table QR tokens, invalidating previous tokens by replacement.
- ADR-006 optional lifecycle enhancements implemented: QR rotation audit records + table rotation-history endpoint + optional old-token grace-window resolution in public QR lookup.
- ADR-007 accepted and Layer 4 started with business menu/category endpoint implementation plus `/dashboard/menu` UI baseline.

## Updates 2026-03-20
- Added a queued infra follow-up in `STATUS.md` next-step list to move Docker/web health probes from `/` to `/healthz` to reduce noisy root endpoint request logs.
- Infra follow-up completed: API (`apps/api/src/index.ts`) and web (`apps/web/src/app/healthz/route.ts`) now expose `/healthz`, and `docker-compose.yml` healthchecks target those endpoints.
- Layer 4 dashboard menu parity moved forward: added category rename/delete/reorder, menu item edit/delete, and pagination controls in `apps/web/src/app/dashboard/menu/page.tsx`.
- Verification for this pass is green: `pnpm --filter @scan2serve/api test`, `pnpm --filter @scan2serve/web test`, and both app builds pass.
- Owner admin-access policy update: no dedicated public admin button/route on homepage; admin users must use standard login and are redirected to `/admin` by role.
- Admin seed credentials were made configurable through API env vars (`ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`) so they can be changed without code edits.
- Layer 4 test-depth pass completed: added API coverage for duplicate category + menu-item update validation errors and web coverage for menu item edit/delete + blocked-business behavior.
- Local env note: `apps/api/.env` should exist (copied from `.env.example`) for direct local seed/migration commands; otherwise pass `DATABASE_URL` inline.
- Root routing policy update: `/` is now a redirect-only entrypoint in web app, sending authenticated users by role (`/dashboard` for business, `/admin` for admin) and unauthenticated/invalid sessions to `/home`.
- Root redirect implementation uses `/api/auth/me` with `/api/auth/refresh` fallback when refresh cookie exists, reducing false unauthenticated redirects for valid sessions with expired access tokens.
- Public landing page content was moved from `/` to `/home`; keep future marketing/unauthenticated landing updates on `/home` and preserve root redirect semantics.
- Logout UX alignment: dashboard/admin protected pages now send unauthenticated users to `/home` (not `/login`) so logout consistently lands on public home.
- API logging policy update: backend logs should go through singleton `logger` (`apps/api/src/utils/logger.ts`) with structured lifecycle events (`http.request.start|finish|aborted|error`) instead of direct `console.*` calls.
- Business routing safeguard: when business context is not explicitly provided, API business resolution should prefer an `approved` business profile over pending/rejected profiles to keep menu operations functional.
- Web API client safeguard: always preserve `Content-Type: application/json` when sending requests with custom headers, otherwise Express JSON parsing may fail and category creation can return 400.
- AI-assist note: ADR-010 is now implemented with subtle menu-authoring assistance (top-5 category/item suggestions excluding existing entries, dietary-tag auto-fill on suggestion select, and visible dietary-tag badges in menu list).
- AI-assist roadmap: ADR-011 proposes upgrading menu suggestions to LLM-driven ranking with typed-input autocomplete (`q`), while retaining deterministic fallback for reliability.
- ADR-011 is now accepted and implemented in API with a singleton LLM client/model-handle pattern and dedicated AI route namespace (`/api/ai/*`) for ongoing AI task expansion.
- LLM timeout behavior is intentionally graceful: aborted calls should log as timeout metadata and continue via deterministic fallback (avoid noisy error-stack logs for expected timeout fallbacks).
- AI suggestion quality guard: generate a wider LLM candidate pool and trim after exclusion/ranking to avoid repeated top-5-only outputs drying up as menus grow.
- Dashboard UX guard: when fetching typed-query suggestions, clear stale chips during the request; category switches must trigger category-specific suggestion refresh.
- Dashboard menu visual polish: replace text-heavy action controls with icon-only accessible buttons and keep card styling intentionally structured (not utility-default UI).
- ADR-012 accepted and applied as UI-first scope: category cards use explicit color accents, and each menu item now exposes image placeholder/preview plus `Upload` and `Generate AI` entry points (without backend persistence yet).
- ADR-013 accepted and implemented: menu item descriptions are now authorable in dashboard (manual + AI-generated via `/api/ai/menu/item-description`) with deterministic fallback on AI failures.
- UX policy update: all user-facing notifications/errors should be delivered as toasts (not inline text messages on pages/components).
- ADR-014 accepted: menu-item images now persist S3 object paths (`image_path`) in DB; do not persist raw image URLs in database records.
- Local storage baseline now includes MinIO in `docker-compose.yml`; API uses S3-compatible envs (`S3_*`) and returns derived `imageUrl` for rendering from stored path.
- Dashboard image actions are now live-backed (`/api/business/menu-items/:id/image/upload` and `/api/business/menu-items/:id/image/generate`) rather than placeholder toasts.
- Compose runtime fix: MinIO image does not ship with `wget`/`curl`; use file-based healthcheck (`[ -f /data/.minio.sys/format.json ]`) instead of HTTP probe commands to avoid false-unhealthy startup blocks.
- ADR-015 accepted and implemented: image-path cleanup now uses DB-backed queue (`deleted_asset_cleanups`) plus periodic worker; delete/replace flows enqueue old image paths for deferred S3 deletion.
- ADR-016 accepted and implemented: onboarding slugs are now server-generated/immutable, currency is collected and persisted, and onboarding logo input is now drag-drop upload instead of raw URL entry.
- Onboarding stability fix: avoid repeated `/api/business/profiles` activity by keying onboarding refresh effect to stable user identity fields (`user.id`, `user.role`) instead of callback reference churn.
- Onboarding currency UX update: use searchable dropdown-style entry (`input + datalist`) for currency codes while preserving strict uppercase 3-letter normalization.
- Onboarding currency control follow-up: avoid native `datalist` for this field (inconsistent browser rendering); use app-styled searchable combobox interaction for consistent UX.
- Onboarding currency UX requirement: keep currency search and display in one input row; typed query is temporary and must only commit to saved value on explicit option selection.
- Onboarding currency interaction requirement: on option selection, close the dropdown immediately and render committed value in the input.
- Currency combobox implementation guard: do not wrap dropdown trigger/input + options list inside a parent `<label>`; use `label htmlFor` to avoid implicit refocus reopening behavior.
- Root spec-sync pass completed: `Database Schema`, `API Endpoints`, `Key Frontend Routes`, and monorepo command guidance were reconciled against live code and `STATUS.md` so base CLAUDE reflects real current behavior.
- ADR-017 accepted and implemented: dashboard business cards render logos, businesses can be archived/restored via API/UI, archived entries are hidden by default in dashboard, and a scheduled worker permanently deletes >30-day archived businesses with audit logging.
- ADR-018 accepted and implemented: public web surfaces now use a structured light-theme shell (header/main/footer), home includes hero + authenticated profile section, and auth entry points are dialog-based on home plus QR auth pages while keeping `/login` and `/register/business` as functional fallback routes.
- Layer 4 completion pass finalized:
  - API menu-item listing now supports `categoryId` query filtering with ownership validation,
  - category/item reorder endpoints normalize persisted `sortOrder` values to contiguous `0..N-1`,
  - reorder payloads reject duplicate IDs.
- Dashboard menu now requests category-scoped item pages and reloads items on category switch; delete actions (category/item) use explicit confirm guards.
- Layer 4 validation status: `pnpm --filter @scan2serve/api test` (47/47) and `pnpm --filter @scan2serve/web test` (29/29) are passing after category-filter URL test alignment.
- Dashboard menu delete UX follow-up: category/item delete confirmations are now rendered as in-app modal dialogs (not browser `window.confirm`) for consistency with dashboard interaction patterns.
- Web UI shell consistency update: all UI pages now use a shared header pattern with home-link brand (`Scan2Serve`) and right-aligned profile info/actions; dashboard/admin/onboarding/menu pages render the same header component used by public shell routes.
- Shared header now includes a cross-page back-navigation control (`Back`, hidden on `/home`) using browser history with `/home` fallback.
- Back-navigation placement revised: `Back` now appears in body top-left (not header) through shared web component usage on public and dashboard/admin surfaces.
- Dashboard quick-action affordance update: `Manage menu` is now surfaced as a dedicated bright gradient clickable card in dashboard overview rather than a small inline button.
- Dashboard quick-action placement refinement: gradient `Manage menu` card is positioned with the business cards (`Your businesses` section), not inside Active Business Overview.
- Dashboard quick-action placement latest: gradient `Manage menu` card is a separate panel on the right side of the `Your businesses` area (outside that card container).
- Dashboard visual consistency update: selected business card highlight now matches the manage-menu gradient style, and manage-menu helper copy is intentionally shorter to reduce clutter.
- Dashboard style correction: selected business cards use prior neutral selected fill again, with gradient-family border color as accent.
- Dashboard selected-card emphasis: selected business cards now use thicker borders (`border-2`) for clearer selection pop.
- Dashboard action cards update: right-side quick-action panel now stacks `Manage menu` and `Archive business` cards; archive action is no longer an inline button in Active Business Overview.
- Dashboard action controls now include an `Edit details` action beside archive in the right quick-action area, routing to onboarding edit for selected business.
- Business profile edit policy in web UI now locks `name` alongside immutable slug; edit mode updates only non-name profile fields.
- Dashboard archived-view policy: enabling `Show archived` hides non-archived operational quick actions (menu/edit/archive) so archived browsing is read-only focused.
- ADR-019 drafted as Proposed for Layer 5: table lifecycle + QR management (bulk table creation, table updates/toggles, QR regenerate/history, and single/batch QR downloads) pending approval before implementation.
- ADR-019 accepted and implemented for Layer 5 baseline: table listing/bulk create/update endpoints are live, QR single/batch download exports are available, and `/dashboard/tables` is now implemented with action wiring.
- ADR-020 implemented Gemini provider-switch baseline; this decision is now superseded by ADR-022 (Gemini-only runtime).
- ADR-021 accepted and implemented: API now enforces shared AI guardrails across both text and image generation routes, blocking unsafe prompts with `AI_PROMPT_UNSAFE` and sanitizing generated descriptions before response/fallback.
- ADR-022 accepted and implemented: menu image generation is now Gemini-only; Nano-Banana/provider-switch paths were removed from backend runtime and env configuration.
- ADR-023 accepted and implemented: mixed business/customer browser sessions keep one `/api/auth/*` namespace and resolve scope by `qrToken` validity, with scoped cookie handling for login/register/refresh/me/logout and no separate customer auth route tree.
- ADR-024 accepted and implemented: auth now exposes dual-session visibility (`/api/auth/sessions`) and scoped logout controls, while web header/auth context can show both active identities and offer scope-specific login/logout actions.
- ADR-025 accepted and implemented: auth entry flows now short-circuit when corresponding scope is already logged in (using session-state introspection), and auth dialogs across business/QR routes include explicit close controls.

## Updates 2026-03-26
- Drafted ADR-035 (`docs/adr/ADR-035-csrf-strategy.md`) for CSRF strategy (proposed, awaiting answers).
- Decision: Pending user approval on auto-refresh vs 401+client refresh and CSRF posture.
- Impact: Auth/session security approach for upcoming work.
- Next: Collect answers and update ADR-035 status before implementation.
- Update: ADR-035 scope narrowed to CSRF strategy only; refresh-token implementation remains unchanged.
- Update: ADR-035 accepted; implement CSRF tokens for mutating routes.
- Implemented CSRF tokens: `GET /api/auth/csrf` issues token cookie + payload, API enforces `x-csrf-token` on mutating routes, and web `apiFetch` attaches token automatically.
- Added toast dismiss button in web toast viewport for manual close.
- Toast viewport now offsets below the sticky header based on header height.
- API logs now colorize by level in non-production TTY sessions (disable via `LOG_COLOR=false`).
- Update: colorized API logs are now on by default in all environments unless `LOG_COLOR=false`.
- Trimmed docker-compose env overrides to keep only Docker-specific DB/S3/internal URLs.
- Updated docker-compose to run `db:seed`, add common API envs (Razorpay/LLM/admin/QR), and load web `.env.local`.

## Updates 2026-03-27
- Expanded ADR-036 to include 6-month operational retention, monthly partitioning, and order-event queue → warehouse pipeline for Layer 8 dashboards.
- Decision: dashboards will use Postgres for realtime queries and the warehouse for historical analytics (pending ADR Q&A confirmation).
- Impact: `docs/adr/ADR-036-layer8-order-management.md` updated with new scope questions and consequences.
- Update: ADR-036 answers now include ClickHouse as warehouse target and full-snapshot order events with `eventId` dedupe and `eventCreatedAt` gating for upserts.
- Update: ADR-036 retention policy now confirmed as hard delete from Postgres after 6 months.
- Update: ADR-036 accepted; final status flow ends at Completed and removes separate Served status.
- Update: ADR-036 MVP filtering clarified to status-only; Decision header updated to Accepted.
- Implemented Layer 8 API endpoints for business order listing/detail/status updates and added order-event publishing hooks (order create, payment verify, status change) with tests.
- Update: ADR-036 is now Paused pending completion of ADR-037 (RBAC scope + invites).
- Update: drafted ADR-037 for RBAC scoped business memberships and invite flow.
- Update: ADR-037 now includes org-level membership model (owner creates org on first business; users belong to one org).
- Update: ADR-037 answers now specify existing-user-only org invites, in-app notifications, and role permissions matrix.
- Update: ADR-037 accepted with org-invite accept/decline flow via blurred org preview page.
- Update: org-invite preview must be a static sample page with no real org data to avoid leakage.
- Implemented ADR-037 backend schema + API scaffolding (orgs/memberships/invites, business memberships, RBAC gating) and added org invite UI preview route with tests.
- Added org intro page and dashboard invite modal UI for org invites; updated tests accordingly.
- Replaced dashboard org intro with `/explore` page explaining org/staff/menu/order use cases; updated tests.
- Added navigation CTAs between `/home` and `/explore`.
- Added a secondary navigation bar below the header with quick links (Home/Explore/Dashboard).
- Removed top-right dashboard CTA and centered the secondary navigation bar.
- Removed default header subtitle under Scan2Serve when no `leftMeta` is provided.
- Simplified header user tag to show only email; profile label now appears inside dropdown.
- Removed header subtitle entirely; product name now stands alone in header.
- Made `/explore` public and hid Dashboard nav link until login.
- Dashboard nav now appears only for business-role users.
- Root route now redirects any session with access/refresh tokens (business or QR) to `/explore`.
- Fix: added missing Prisma back-reference (`Business.memberships`) to resolve schema validation error.
- Added business-role gating on order management endpoints so only `owner`/`manager`/`staff` can list, view, or update orders.

## Updates 2026-03-29
- Added org-member and business-membership listing endpoints plus business-role annotations on `/api/business/profiles` for RBAC assignment UI.
- Dashboard now includes a “Manage business access” modal for owners/managers to grant business membership roles.
- Staff are redirected away from menu/tables pages with toast guidance to contact an owner/manager.
- Stabilized API tests: mocked Prisma client in `apps/api/tests/publicRoutes.test.ts` and fixed org-invite test mocks to include business owner ids in membership listings.
- Fixed Vitest mock hoisting in `apps/api/tests/publicRoutes.test.ts` by moving Decimal mock into `vi.hoisted`.
- Fixed dashboard hook order regression by moving member-map `useMemo` above early returns.
- Org-invite preview page now uses `useParams` to read `inviteId` instead of direct params prop access (Promise params warning fix).
- Dashboard now shows a waiting-for-access message for non-owners with no assigned businesses (instead of showing create-business CTA).
- Updated org-invite web tests to mock `useParams` after switching invite page to hook-based params access.
- Added business membership removal endpoint and UI controls to revoke access from the manage-business-access modal.
- Manage-business-access modal now hides removal controls for self and non-owner/manager users (staff get read-only view).
- Staff-facing dashboard now hides management actions (add business, archive/restore, edit/resubmit, archive toggle).
- Staff-facing dashboard now hides the quick-action panel (invite/manage access cards).
- Added dashboard action guards (role + business status) to block invalid actions with toasts before navigation.
- Drafted ADR-038 to remove org roles and drive all permissions from business-level roles only.
- Implemented ADR-038 roleless org membership: org membership now only stores orgId, org owner is defined by `orgs.owner_user_id`, and org invites are authorized by org owner or any business owner/manager in the org.
- Business access management and dashboard permissions now depend on the selected business role only (owner/manager), not org roles; org member summaries now expose `isOwner` instead of role.
- Added migration `20260329120000_roleless_org_memberships` dropping org role columns and updated shared types/tests accordingly.
- Fixed dashboard tables QR download CSRF failures by exporting CSRF helpers and attaching `x-csrf-token` to binary download POSTs (apps/web/src/lib/api.ts, apps/web/src/app/dashboard/tables/page.tsx).
- API test fix: mocked `prisma.org.findUnique` in org invite tests to align with roleless org invite notifications (apps/api/tests/orgInviteRoutes.test.ts).
- Layer 8 UI started: added orders management page with polling list, detail modal, and status transitions plus dashboard entry point (`apps/web/src/app/dashboard/orders/page.tsx`).
- Added web tests for orders dashboard (`apps/web/tests/orders-page.test.tsx`).
- Synced root CLAUDE endpoints/routes to roleless org membership and `/dashboard/orders`; removed outdated placeholders.
- ADR-039 accepted: orders now require `paymentMethod`, cash orders default to `paymentStatus="unpaid"`, Razorpay orders are blocked when not configured, and business can mark cash orders paid.

## Updates 2026-03-30
- ADR-042 accepted: customer accounts are separated into `customer_users`, orders require customer login, and order status access is restricted to the owning customer.
- QR customer auth UI now uses a single "Email or phone" field for login/registration, inferring identifier type before submit (`apps/web/src/app/qr/login/page.tsx`, `apps/web/src/app/qr/register/page.tsx`).
- Drafted ADR-043 for a customer orders hub page (list + selected order detail) with a customer-scoped orders list API.
- ADR-043 accepted: `/orders` hub replaces `/order/:id`, customer orders list API is paginated at 10 items, and default selection prefers most recently updated active orders.
- ADR-043 now includes an implementation task checklist (redirect updates, `/order/[id]` removal, API + tests, and doc updates).
- Implemented `/orders` customer hub UI, removed `/order/[id]`, and updated checkout redirects to `/orders?orderId=...`.
- Added `GET /api/public/orders` with cursor pagination and shared customer orders list types.
- Added `View orders` link in customer profile dropdown in the web navbar (`apps/web/src/components/layout/app-header.tsx`).
- Orders hub now renders larger current-order cards with a collapsed/smaller history section (`apps/web/src/components/public/customer-orders-hub.tsx`).
- Updated public routes test mock to include `prisma.order.findFirst` for customer order pagination (`apps/api/tests/publicRoutes.test.ts`).
- Ran API test suite: `pnpm --filter @scan2serve/api test` passed (16 files, 99 tests; missing AI key warnings expected).
- Fixed orders hub test assertions and re-ran web tests: `pnpm --filter @scan2serve/web test` passed (17 files, 55 tests; act warnings remain).
- Added order events outbox schema + migration and enqueue wiring for ADR-036 warehouse feed (`apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260330123000_order_event_outbox/migration.sql`, `apps/api/src/services/orderEvents.ts`).
- Added ClickHouse outbox worker and API boot wiring (`apps/api/src/services/orderEventOutbox.ts`, `apps/api/src/index.ts`), plus compose service + env knobs (`docker-compose.yml`, `apps/api/.env.example`).
- Updated ADR-036 warehouse feed to outbox → Redis Streams → ClickHouse; added Redis Streams publisher/consumer workers and Redis service/env wiring.
- Updated docker-compose ClickHouse port mapping to avoid MinIO conflict (host `9002` → container `9000`).
- Implemented ADR-036 partitioning with composite keys for `orders` + `order_items`, added `order_created_at`, and added a partition maintenance worker for monthly partitions/retention.
- Re-ran API tests after partitioning changes (16 files, 99 tests passed; warnings for missing AI keys/outbox mocks).
- Polished orders dashboard UI with summary stats + refresh controls and added a test-env guard for header notifications fetch to reduce act warnings.
- Added per-phase order status accountability via `statusActors` JSON on orders and surfaced it in the orders detail UI.
- Added local setup/run shell scripts for non-container dev workflows (`scripts/setup-local.sh`, `scripts/run-local.sh`).
- Adjusted order status accountability to render as a flow timeline in the orders detail view.
- Highlighted active order-status arrow and moved actor labels onto the connector between phases in the orders detail timeline.
- Switched the order activity timeline to a vertical workflow layout for better responsiveness.
- Moved the order activity workflow into a side pane within the order detail modal.
- Added a mobile collapsible toggle for the workflow side pane and refactored the activity timeline into a reusable component.
- Added configurable modal widths and widened the orders detail modal to avoid awkward side-pane overlap.
- Made modal dialogs scrollable and mobile-safe by constraining height and aligning to top on small screens.
- Updated order workflow timeline to show completed/current/upcoming states with actor labels on connectors.
- Simplified the workflow timeline to a minimal vertical list with connector actor labels.
- Adjusted workflow connector labels to use the next step actor and removed the "handled by" prefix.
- Removed placeholder analytics cards from dashboard orders and overview pages pending analytics endpoints.
- Updated orders summary metrics to exclude cancelled orders and count revenue from paid orders only.
- Marked ADR-043 implementation tasks as completed (`docs/adr/ADR-043-customer-orders-hub.md`).
- Reordered the post ADR-036 TODOs in `STATUS.md` so analytics endpoints appear first, followed by private networking and Grafana.

## Updates 2026-04-04
- Attempted web test triage; `pnpm`/`node` are unavailable in this environment so tests could not be executed.
- Next step is to get failing web test output or install the toolchain to run `pnpm --filter @scan2serve/web test`.
- Updated `AppHeader` tests to force `NODE_ENV=production` in notification-fetch cases so the test-env guard no longer blocks mocked notification calls (`apps/web/tests/app-header.test.tsx`).
- Accepted ADR-044 and added order dashboard new-order toast + sound notification logic with bundled sound asset (`apps/web/src/app/dashboard/orders/page.tsx`, `apps/web/public/sounds/order-notification.wav`).
- Drafted ADR-044 for order dashboard notifications using toast + sound (`docs/adr/ADR-044-order-notifications-toast-sound.md`).
- Docker compose hardening: added per-app `node_modules` volumes for `apps/web` and `apps/api` (and tests) to avoid stale host `node_modules` interfering with container installs (`docker-compose.yml`).
- Added partition guard to skip monthly partition maintenance when the base `orders` tables are not partitioned, preventing repeated `42P17` failures on fresh DBs (`apps/api/src/services/orderPartitionMaintenance.ts`).
- Updated docker compose API boot to run `pnpm --filter @scan2serve/api db:migrate` instead of `db:push` so raw SQL migrations (including partitioning) apply on fresh DBs (`docker-compose.yml`).
- Fixed migration `20260404125024` by removing invalid `RENAME CONSTRAINT` clauses inside `ALTER TABLE` statements (syntax error on fresh DBs) so `db:migrate` applies cleanly (`apps/api/prisma/migrations/20260404125024/migration.sql`).
- Further fixed migration `20260404125024` by removing `ALTER COLUMN ... SET DATA TYPE` for partition key columns, which fails on partitioned tables (`apps/api/prisma/migrations/20260404125024/migration.sql`).
- Updated partitioning migration to use `TIMESTAMP(3)` for partition key columns and removed the auto-generated migration that only attempted forbidden type changes (`apps/api/prisma/migrations/20260330170000_order_partitions/migration.sql`).
- Added per-service pnpm store volumes (`PNPM_STORE_PATH=/pnpm-store`) in compose to avoid concurrent install failures across `api`/`tests`/`web` containers (`docker-compose.yml`).
- Rebuilt compose with fresh volumes: `db:migrate` completed successfully, partitions were created, API and tests booted cleanly (API + web test suites passed).
- Moved the org-owner onboarding redirect in dashboard page into a `useEffect` to avoid router navigation during render (`apps/web/src/app/dashboard/page.tsx`).
- Moved the org-owner onboarding redirect effect above early returns to fix hook-order errors in `DashboardPage` (`apps/web/src/app/dashboard/page.tsx`).
- Re-ran compose tests: API suite (99 tests) and web suite (55 tests) both passed after the dashboard hook-order fix.
- Pinned pnpm install to `--store-dir /pnpm-store` in compose commands to enforce the isolated store and avoid `ERR_PNPM_Unknown system error -116` during installs (`docker-compose.yml`).
- Re-ran compose after the pnpm store-dir change; API and web tests pass and the web container no longer logs missing Next files.
- Adjusted web compose command to `cd /app/apps/web` before running `next dev` so Next writes manifests to the expected `.next` path, fixing missing `middleware-manifest.json`/`routes-manifest.json` errors (`docker-compose.yml`).
- Rebuilt compose; web healthcheck now returns 200 and all services show healthy in `docker compose ps`.
- Set client `apiFetch` GET requests to use `cache: "no-store"` to prevent stale polling responses (`apps/web/src/lib/api.ts`).
- Added focus/visibility refresh trigger for orders dashboard polling so new orders appear without manual refresh (`apps/web/src/app/dashboard/orders/page.tsx`).
- Added business `countryCode` + `timezone` fields and onboarding inputs for analytics windowing; default timezone is country-driven with browser fallback (`apps/api/prisma/schema.prisma`, `apps/web/src/app/dashboard/onboarding/page.tsx`).
- Added dashboard analytics overview endpoint (Postgres + ClickHouse with Redis caching) and UI cards on dashboard/orders pages (`apps/api/src/routes/analytics.ts`, `apps/api/src/services/analytics.ts`, `apps/web/src/components/dashboard/analytics-overview.tsx`).
- Fixed onboarding country/timezone selects to use explicit label bindings for accessibility + tests (`apps/web/src/app/dashboard/onboarding/page.tsx`).
- Added ClickHouse bootstrap script to create `scan2serve` database + `order_events` table (`apps/api/scripts/clickhouse-bootstrap.ts`).
- Wired ClickHouse bootstrap into compose API startup so ClickHouse is seeded before the API serves analytics (`docker-compose.yml`).
- Added optional ClickHouse credential split for bootstrap/ingest/query to support read-only analytics users (`apps/api/.env.example`, `apps/api/src/services/analytics.ts`, `apps/api/src/services/orderEventQueueConsumer.ts`, `apps/api/scripts/clickhouse-bootstrap.ts`).
- Added ClickHouse admin Docker user file and bootstrap script for ingest/query users; wired into compose startup (`clickhouse-users/admin.xml`, `apps/api/scripts/clickhouse-users-bootstrap.ts`, `docker-compose.yml`).

## Updates 2026-04-05
- Added `db:migrate:deploy` script for non-interactive Prisma migrations in containers (`apps/api/package.json`).
- Switched compose API startup to use `db:migrate:deploy` to avoid `prisma migrate dev` hanging in container startup (`docker-compose.yml`).
- Added `db:generate` before `db:seed` in compose startup so Prisma client is available in containers (`docker-compose.yml`).
- Moved the `tests` compose service behind a `tests` profile so it does not run on default `docker compose up` (`docker-compose.yml`).
- Added `scripts/test-compose.sh` to run the `tests` profile explicitly and updated `scripts/dev-compose.sh`/README to clarify tests are separate (`scripts/dev-compose.sh`, `scripts/test-compose.sh`, `README.md`).
- Updated `scripts/test-compose.sh` to run tests under a dedicated compose project name to avoid missing-network conflicts (`scripts/test-compose.sh`, `README.md`).
- Removed hardcoded `container_name` entries in compose to avoid cross-project name collisions (notably when running tests profile) (`docker-compose.yml`).

## Updates 2026-04-08
- Aligned ClickHouse bootstrap credentials in `apps/api/.env` with `clickhouse-users/admin.xml` to prevent admin auth failures during `clickhouse:users`.
- Reverted orders dashboard polling interval to 15 seconds (`apps/web/src/app/dashboard/orders/page.tsx`).
- Set API and web `/healthz` docker-compose healthcheck interval to 1 minute (`docker-compose.yml`).
- Drafted ADR-046 for introducing an API gateway layer as infrastructure (`docs/adr/ADR-046-api-gateway-layer.md`).

## Updates 2026-04-09
- Updated ADR-046 to require an internal API key header from the gateway for API requests, never exposed to browsers (`docs/adr/ADR-046-api-gateway-layer.md`).
- Accepted ADR-046 with gateway-fronts-both + internal API key for non-public routes (`docs/adr/ADR-046-api-gateway-layer.md`).
- Added initial Nginx gateway routing and compose service (`gateway/nginx.conf`, `docker-compose.yml`).
- Enforced internal API key on non-public API routes and injected header from the gateway (`apps/api/src/middleware/internalApiKey.ts`, `apps/api/src/index.ts`, `gateway/nginx.conf.template`, `docker-compose.yml`).
- Gateway routing now uses an envsubst template (`gateway/nginx.conf.template`) for internal API key injection.
- Routed local web/API traffic through the gateway by default (expose gateway on `:3000`, remove direct `web`/`api` ports, update `NEXT_PUBLIC_API_URL`) (`docker-compose.yml`, `apps/web/.env`, `apps/web/.env.example`).
- Fixed gateway template to use `INTERNAL_API_KEY` env var instead of hardcoded value (`gateway/nginx.conf.template`).
- Accepted and implemented ADR-047 to store order status actors as `{ userId, email }` objects per status key in `status_actors` (`docs/adr/ADR-047-order-status-actors-with-user-identity.md`).
- Fixed orders dashboard status updates to merge the full order payload so actor labels refresh immediately after transitions (`apps/web/src/app/dashboard/orders/page.tsx`).
- Reported: API + web test suites pass after ADR-047 changes (`pnpm --filter @scan2serve/api test`, `pnpm --filter @scan2serve/web test`).
- Dropped private networking from the post-ADR-036 TODO list; Grafana + Prometheus remain for later.
- Drafted ADR-048 to introduce Prometheus metrics collection and Grafana monitoring (`docs/adr/ADR-048-prometheus-grafana-monitoring.md`).
- Accepted ADR-048 and wired Prometheus + Grafana services (with API metrics endpoint, Postgres exporter, ClickHouse metrics, and `/grafana/` gateway routing) (`docker-compose.yml`, `monitoring/`, `apps/api/src/metrics.ts`, `gateway/nginx.conf.template`).
- Adjusted internal API key enforcement to accept `Authorization: Bearer` tokens for Prometheus scraping (`apps/api/src/middleware/internalApiKey.ts`, `monitoring/prometheus.yml`).
- Made compose runtime image configurable via `PNPM_NODE_IMAGE` (defaults to `node:20-alpine`) and restored Corepack with a persistent `COREPACK_HOME` cache (`docker-compose.yml`).
- Fixed Redis outbox publishing to use `multi.addCommand` for Redis v4 pipelines, avoiding `sendCommand` runtime errors (`apps/api/src/services/orderEventQueue.ts`).
- Fixed Grafana subpath proxying by preserving `/grafana` in `proxy_pass` and forwarding prefix/host headers to stop redirect loops (`gateway/nginx.conf.template`).
- ClickHouse order-event consumer now uses `CLICKHOUSE_BOOTSTRAP_*` for schema creation and `CLICKHOUSE_INGEST_*` for inserts to prevent privilege errors (`apps/api/src/services/orderEventQueueConsumer.ts`).
- Added Grafana dashboard provisioning + Scan2Serve overview dashboard JSON, mounted into Grafana via compose (`monitoring/grafana/provisioning/dashboards/dashboards.yml`, `monitoring/grafana/dashboards/scan2serve-overview.json`, `docker-compose.yml`).
