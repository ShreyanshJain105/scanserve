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
