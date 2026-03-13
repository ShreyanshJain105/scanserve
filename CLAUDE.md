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

## Project Overview

**Scan2Serve** — A platform where restaurants/cafés create digital menus accessible via QR codes. Customers scan QR codes at tables to view menus, place orders, and pay online (Stripe). Business owners manage menus, tables, and orders through a dashboard. Admins approve businesses and oversee the platform.

## Tech Stack

- **Frontend:** Next.js (App Router) + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express REST API
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** JWT-based, three roles: customer, business, admin
- **Payments:** Stripe (Checkout Sessions)
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
Express.js Backend (apps/api/)
  ├── Auth (register, login, JWT, role middleware)
  ├── Menu CRUD (categories, items, images)
  ├── Table & QR Management (bulk create, download)
  ├── Order Management (create, status updates, filtering)
  └── Payments (Stripe checkout sessions, webhooks)
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
- `npm run dev` — starts both web and api in parallel
- `npm run dev --workspace=apps/web` — start frontend only
- `npm run dev --workspace=apps/api` — start backend only
- `npm run build` — build all apps
- `npm run lint` — lint all apps
- Shared package imported as `@scan2serve/shared` in both apps

## Database Schema

- `users` — id, email, password_hash, role (customer|business|admin), created_at
- `businesses` — id, user_id (FK), name, description, logo_url, address, phone, status (pending|approved|rejected), created_at
- `categories` — id, business_id (FK), name, sort_order
- `menu_items` — id, category_id (FK), business_id (FK), name, description, price, image_url, is_available, dietary_tags[], sort_order
- `tables` — id, business_id (FK), table_number (int, unique per business), label (optional), is_active, created_at
- `qr_codes` — id, business_id (FK), table_id (FK), unique_code, qr_image_url, created_at
- `orders` — id, business_id (FK), table_id (FK), status (pending|confirmed|preparing|ready|completed|cancelled), total_amount, stripe_payment_id, customer_name, customer_phone, created_at
- `order_items` — id, order_id (FK), menu_item_id (FK), quantity, unit_price, special_instructions

## API Endpoints

### Auth
- `POST /api/auth/register` — signup (business role → status=pending)
- `POST /api/auth/login` — returns JWT
- `GET  /api/auth/me` — current user profile

### Business Menu
- `GET    /api/business/menu` — categories + items for logged-in business
- `POST/PUT/DELETE /api/business/categories`
- `POST/PUT/DELETE /api/business/menu-items` — with image upload

### Tables & QR
- `POST   /api/business/tables` — bulk create (specify count → tables 1..N with auto QR)
- `GET    /api/business/tables` — list all with QR codes and active order count
- `PATCH  /api/business/tables/:id` — update label, toggle is_active
- `DELETE /api/business/tables/:id` — remove table + QR
- `GET    /api/business/tables/:id/qr` — download QR (PNG/SVG)
- `GET    /api/business/tables/qr/all` — batch download (ZIP/PDF)

### Orders
- `POST   /api/orders` — submit order (items, table_id, customer info)
- `GET    /api/business/orders` — list (filter by status, date, table_number)
- `PATCH  /api/business/orders/:id/status` — advance order status

### Payments
- `POST   /api/payments/create-session` — Stripe Checkout Session
- `POST   /api/payments/webhook` — Stripe webhook handler

### Admin
- `GET    /api/admin/businesses` — list (filter by status)
- `PATCH  /api/admin/businesses/:id/approve`
- `PATCH  /api/admin/businesses/:id/reject`
- `GET    /api/admin/users` — list all users
- `GET    /api/admin/stats` — platform-wide stats

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
  │ • Stripe Checkout Session creation                            │
  │ • Stripe webhook handler (payment success/failure)            │
  │ • Payment flow: cart → Stripe Checkout → success page         │
  │ • Order confirmation with order number                        │
  │ • Order status page /order/[id] (polling for updates)         │
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
│ • Domain, SSL, CORS, production Stripe keys                           │
│ • Seed admin account                                                  │
│ • End-to-end flow testing                                             │
└────────────────────────────────────────────────────────────────────────┘
```

## Key Frontend Routes

| Route | Role | Purpose |
|-------|------|---------|
| `/login` | public | Login form |
| `/register` | public | Register (customer or business) |
| `/register/business` | public | Business registration details |
| `/menu/[businessSlug]?table=N` | public | Public menu page (scanned via QR) |
| `/order/[orderId]` | public | Order status tracking |
| `/dashboard` | business | Dashboard overview |
| `/dashboard/menu` | business | Menu management |
| `/dashboard/tables` | business | Table & QR management |
| `/dashboard/orders` | business | Order management board |
| `/admin` | admin | Admin panel |

## Key Design Decisions

- **Polling over WebSockets** for order updates (15s interval). Simpler for MVP; WebSocket upgrade planned post-MVP.
- **Table mapping included** — businesses specify table count, each gets a numbered QR. No visual floor plan in MVP.
- **Payments required** — all orders go through Stripe. No cash/pay-at-counter in MVP.
- **Admin-approved onboarding** — businesses register → pending → admin approves before they can create menus.
- **English only, single currency** for MVP.
- **Mobile-first** public menu — most customers scan QR from phones.
