# Scan2Serve

**A QR-powered digital menu and ordering platform for restaurants and cafés.**

Customers scan a QR code at their table to view the menu, place orders, and pay online. Business owners manage their menus, tables, and live orders through a dashboard. Admins oversee business onboarding and platform health.

---

## Home Screen
![Home Screen](docs/images/home-page)

## Business Dashboard
![Business Dashboard](docs/images/business-dashboard-page)

## Business Login Page
![Business Login](docs/images/business-login-page)

## Menu Edit
![Menu Edit](docs/images/menu-edit-page)

## QR Generation
![QR Generation](docs/images/qr-page)

---

## Features

**For Customers**
- Scan a QR code at any table to instantly open the restaurant's menu
- Browse categories, filter by dietary tags, and add items to a cart
- Submit orders and pay securely via Razorpay Checkout
- Track order status in real time

**For Business Owners**
- Register and get approved by an admin before going live
- Build and manage a full digital menu (categories, items, images, pricing, dietary tags)
- Generate QR codes per table — download individually or as a ZIP
- Monitor live orders on a Kanban-style board with one-tap status updates
- AI-assisted menu authoring: category suggestions, item descriptions, and AI-generated item images

**For Admins**
- Review and approve/reject business applications
- Browse all businesses, users, and platform-wide stats

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express |
| Database | PostgreSQL, Prisma ORM |
| Auth | JWT (access + refresh cookies), role-based |
| Payments | Razorpay Checkout |
| AI | Google Gemini (menu suggestions, item descriptions, image generation) |
| File Storage | S3-compatible (MinIO locally) |
| QR Codes | `qrcode` npm package (server-side) |

---

## Architecture

```
Next.js Frontend (apps/web/)
  ├── Public Menu + Ordering   (customer-facing, mobile-first)
  ├── Business Dashboard       (protected, business role)
  └── Admin Panel              (protected, admin role)
        │
        │  REST API
        ▼
Express.js Backend (apps/api/)
  ├── Auth (JWT, refresh rotation, role middleware)
  ├── Business Onboarding & Approval
  ├── Menu CRUD (categories, items, images)
  ├── Table & QR Management
  ├── Order Management
  ├── Payments (Razorpay)
  └── AI endpoints (/api/ai/*)
        │              ▲
        ▼              │
   PostgreSQL     packages/shared/
  (Prisma ORM)   (types, validators, constants)
```

---

## Project Structure

```
scan2serve/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/         # login, register
│   │   │   ├── (public)/       # public menu, order status
│   │   │   ├── dashboard/      # business owner dashboard
│   │   │   └── admin/          # admin panel
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui base components
│   │   │   ├── menu/           # menu display
│   │   │   ├── cart/           # cart
│   │   │   ├── dashboard/      # dashboard components
│   │   │   └── admin/          # admin components
│   │   ├── lib/                # API client, utils, auth helpers
│   │   └── hooks/              # custom React hooks
│   └── api/                    # Express backend
│       ├── src/
│       │   ├── routes/         # auth, business, menu, orders, admin, payments, ai
│       │   ├── middleware/      # auth, validation, error handling
│       │   ├── services/       # business logic
│       │   └── utils/          # QR generation, logger, etc.
│       └── prisma/
│           ├── schema.prisma
│           └── seed.ts
└── packages/
    └── shared/                 # shared TypeScript types, constants, validators
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Docker & Docker Compose
- A Razorpay account (for payments)
- A Google Gemini API key (for AI features)

### 1. Clone and install

```bash
git clone https://github.com/Kkoderr/scan2serve.git
cd scan2serve
pnpm install
```

### 2. Configure environment variables

Copy the example env files and fill in your values:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Key variables for `apps/api/.env`:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
GEMINI_API_KEY=...
S3_ENDPOINT=...
S3_BUCKET=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=changeme
```

### 3. Start with Docker Compose (recommended)

```bash
docker compose up --build
```

Or use the helper script:

```bash
./scripts/dev-compose.sh
```

This starts PostgreSQL, MinIO (local S3), the API, and the web app — all with healthchecks.

> **Note:** Set `CI=true` in your shell or in the Docker Compose service env to prevent interactive pnpm prompts during container build.

### 4. Run database migrations and seed

```bash
pnpm --filter @scan2serve/api exec prisma migrate deploy
pnpm --filter @scan2serve/api exec prisma db seed
```

The seed script creates an admin account using the `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` env vars.

### 5. Start in development mode (without Docker)

```bash
pnpm dev          # starts both web and api in parallel
pnpm dev:web      # frontend only
pnpm dev:api      # backend only
```

### 6. Run tests in Docker

```bash
./scripts/test-compose.sh
```

The script runs tests under a separate Compose project to avoid network conflicts.

---

## Key Routes

| Route | Access | Description |
|---|---|---|
| `/home` | Public | Landing page |
| `/login` | Public | Login |
| `/register` | Public | Business registration |
| `/qr/[qrToken]` | Public | QR entry — resolves token and redirects |
| `/menu/[slug]` | Public | Customer-facing digital menu |
| `/dashboard` | Business | Dashboard overview |
| `/dashboard/menu` | Business | Menu and category management |
| `/dashboard/tables` | Business | Table and QR code management |
| `/admin` | Admin | Business approval panel |

---

## Monorepo Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in parallel |
| `pnpm build` | Build all apps |
| `pnpm lint` | Lint all apps |
| `pnpm --filter @scan2serve/api test` | Run API tests |
| `pnpm --filter @scan2serve/web test` | Run web tests |

---

## Auth Model

- **Business owners** register on the main site and are reviewed by an admin before gaining access.
- **Admins** log in via the standard login page and are redirected to `/admin` by role.
- **Customers** authenticate only through QR-scoped flows — there is no standalone customer registration outside of scanning a table QR code.
- Auth uses httpOnly cookie-based JWT access + refresh tokens with automatic rotation.

---

## Design Decisions

- **Polling over WebSockets** — order updates use 15-second polling for MVP simplicity; WebSocket upgrade is planned post-MVP.
- **Admin-gated onboarding** — businesses go through a `pending → approved` flow before they can publish menus.
- **Payments required** — all orders go through Razorpay; cash/pay-at-counter is not supported in MVP.
- **Mobile-first public menu** — the customer-facing menu is optimised for phones since most users scan from a mobile device.
- **Immutable slugs** — business slugs are auto-generated server-side on creation and cannot be changed.
- **S3-path storage** — `image_path` (object path) is stored in the database, not raw URLs, to keep storage-layer URLs decoupled from the data model.
- **Deferred asset cleanup** — deleted images are queued in a DB table and removed from S3 asynchronously by a background worker.

---

## Implementation Status

| Layer | Status |
|---|---|
| 1 — Foundation (monorepo, DB, Docker) | ✅ Done |
| 2 — Authentication (JWT, roles, QR-scoped) | ✅ Done |
| 3 — Business Onboarding & Admin Approval | ✅ Done |
| 4 — Menu Management (CRUD, images, AI) | ✅ Done |
| 5 — Table Management & QR Codes | ✅ Done |
| 6 — Public Menu & Cart | 🔄 In progress |
| 7 — Ordering & Payments | 🔜 Planned |
| 8 — Order Management (business side) | 🔜 Planned |
| 9 — Business Dashboard & Analytics | 🔜 Planned |
| 10 — Admin Panel (full) | 🔜 Planned |
| 11 — Polish & Deployment | 🔜 Planned |

---

## License

This project does not currently include a license file. All rights reserved by the author unless otherwise stated.
