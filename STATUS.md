# Project Status

> **How this file works:**
> - **Last Session** — overwritten each session. This is what a new Claude reads first for fast pickup.
> - **Timeline** — append-only log. Never delete or modify past entries. New entries go at the bottom.
> - **Decisions Log** — append-only. All ADRs recorded here.

---

## Last Session

**Date:** 2026-03-14
**What was done:**
- Phase 1.1: Project Scaffolding — COMPLETE
- pnpm monorepo initialized (apps/web, apps/api, packages/shared)
- Express + TypeScript backend with health endpoint on :4000
- Next.js 15 App Router + Tailwind CSS frontend on :3000
- Shared types package with all entity types and constants
- Prisma schema with all 8 core models
- ESLint + Prettier configured, CLAUDE.md files in each folder
- Git initialized, initial commit on `main` (`3ac7e00`)

**What's NOT done yet:**
- No remote repository connected (local only)
- No database created or migrations run
- No `.env` files (only `.env.example` exists)
- No feature code beyond scaffolding

**Next step:** Phase 1.2 — Authentication System (Layer 2)
1. Create auth middleware (`requireAuth`, `requireRole`) in `apps/api/src/middleware/`
2. Create auth routes (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`) in `apps/api/src/routes/`
3. Create auth service (password hashing, JWT sign/verify) in `apps/api/src/services/`
4. Create frontend auth pages (`/login`, `/register`, `/register/business`) in `apps/web/`
5. Create auth context provider in `apps/web/src/lib/`

**Build progress:**
```
Layer 1:  Foundation          ✅ DONE
Layer 2:  Authentication      ← NEXT
Layer 3:  Business Onboarding
Layer 4:  Menu Management
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

---

## Decisions Log

| # | Decision | Why | Date |
|---|----------|-----|------|
| ADR-001 | pnpm workspaces (not npm/Nx) | Strict dep isolation without overhead; Nx overkill for 2 apps at MVP | 2026-03-14 |

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
