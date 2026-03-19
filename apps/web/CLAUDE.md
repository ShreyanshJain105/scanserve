# apps/web — Next.js Frontend

## What this is
Next.js 15 App Router frontend. Serves three audiences:
1. **Public** — menu pages (SSR, mobile-first) and order status
2. **Business owners** — dashboard for menu, tables, QR codes, and order management
3. **Admin** — platform management panel

## Commands
```bash
pnpm dev    # start dev server on :3000
pnpm build  # production build
pnpm lint   # run Next.js ESLint
```

## Route Groups
- `src/app/(auth)/` — login, register pages (no auth required)
- `src/app/(public)/` — public menu `/menu/[slug]`, order status `/order/[id]`
- `src/app/dashboard/` — business owner pages (requires business role)
- `src/app/admin/` — admin pages (requires admin role)

## Conventions
- Shared types imported from `@scan2serve/shared`
- API calls go through helper functions in `src/lib/api.ts`
- Auth state managed via React context in `src/lib/auth-context.tsx`
- UI components use shadcn/ui (in `src/components/ui/`)
- Tailwind CSS for styling — mobile-first approach
- Feature-specific components in `src/components/{feature}/`

## Environment
- Copy `.env.example` to `.env.local`
- `NEXT_PUBLIC_API_URL` points to the Express backend

## Updates 2026-03-19
- Added auth context + API client with cookie-based flow and 401 refresh retry.
- Built `/login`, `/register`, `/register/business`, and dashboard placeholder; wrapped app with `AuthProvider`.
- Added `.env.example` for `NEXT_PUBLIC_API_URL`.
- Added Vitest + testing-library + jsdom setup; tests for api fetch retry and auth context login behavior (`tests/`).
- Extended auth context to include business profile state (`businesses`, selected business, profile create/update/list refresh methods) fetched at login/bootstrap.
- Reworked `/dashboard` into Layer 3 status-aware UI with business cards selector, locked overlay for `pending/rejected`, and onboarding CTA when no profile exists.
- Added `/dashboard/onboarding` for business profile create/edit/resubmit flow.
- Added `tests/dashboard.test.tsx` for onboarding-required and pending-lock dashboard states.
- Docker compose diagnostics: web container command is currently invalid after install. `pnpm --filter @scan2serve/web dev -- --hostname 0.0.0.0 --port 3000` resolves to `next dev --port 3000 -- --hostname ...`, and Next interprets `--hostname` as a directory (`Invalid project directory provided`).
- Compose fix applied in `docker-compose.yml`: web command switched to `pnpm --filter @scan2serve/web exec next dev --hostname 0.0.0.0 --port 3000`; verified web boots and reaches ready state in compose.
- Added admin moderation UI at `src/app/admin/page.tsx` (status-filtered list with approve/reject actions) for Layer 3 moderation flow.
- Improved onboarding/dashboard UX for rejection visibility and wrapped onboarding page with `Suspense` for `useSearchParams` build compatibility.
- Removed unsupported Vitest coverage typing from `vitest.config.ts`; `pnpm --filter @scan2serve/web build` and tests now pass.
- Compose healthcheck probe updated to `http://127.0.0.1:3000` to avoid IPv6 localhost false negatives.
- Main-site registration scope changed to business-only: `src/app/(auth)/register/page.tsx` now redirects to `/register/business`.
- Added QR-scoped customer auth pages: `src/app/qr/[qrToken]/page.tsx`, `src/app/qr/login/page.tsx`, and `src/app/qr/register/page.tsx`.
- Extended auth context with QR customer auth helpers that call shared auth endpoints with `qrToken` (`src/lib/auth-context.tsx`).
- `/qr/[qrToken]` now performs server-side QR resolution via API and redirects to `/menu/[slug]?table=...&token=...` on success.
- Added `/menu/[slug]` placeholder page as the QR-resolved public destination until full Layer 6 menu UI is built.
- Runtime note: in docker, server components must use `API_INTERNAL_URL` (container-to-container URL) for API fetches.
