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
