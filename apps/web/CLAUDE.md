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
- User-facing success/error/info feedback must use toast notifications, not inline text messages/banners in page content.

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
- Started Layer 4 UI baseline: added `/dashboard/menu` for category creation, menu item creation, availability toggle, and simple reorder controls wired to business API endpoints.
- Added `tests/menu-page.test.tsx` to cover role guard and initial load behavior for dashboard menu page.

## Updates 2026-03-20
- Added dedicated web health route `src/app/healthz/route.ts` and switched compose probe to `GET /healthz`.
- Upgraded `src/app/dashboard/menu/page.tsx` to include category rename/delete/reorder, menu item edit/delete, and API-backed pagination controls.
- Extended `tests/menu-page.test.tsx` with pagination navigation coverage (`Next` page request assertion).
- Owner-access update: login now redirects by role (`admin` to `/admin`, `business` to `/dashboard`) via `src/app/(auth)/login/page.tsx` and `src/lib/auth-context.tsx`.
- Added owner discoverability on `src/app/page.tsx` and introduced `/owner` alias route (`src/app/owner/page.tsx`) redirecting to admin moderation.
- Owner UX policy tightened: removed explicit admin entry UI from `src/app/page.tsx` and removed `/owner` alias route; admin access is now only via normal login credentials with role-based redirect.
- Expanded Layer 4 menu tests in `tests/menu-page.test.tsx` with item edit/delete interaction coverage and blocked-business behavior assertions.
- Route split update: moved public landing UI from `/` to `src/app/home/page.tsx`; root route (`src/app/page.tsx`) now server-redirects to `/dashboard` (business), `/admin` (admin), or `/home` (unauthenticated/invalid session).
- Root redirect hardening: `src/app/page.tsx` now uses `/api/auth/refresh` as fallback when `/api/auth/me` fails but `refresh_token` exists, so valid sessions still route to role destination.
- Added `tests/root-page.test.ts` to cover root redirect behavior for no-cookie, business session, admin session, and invalid `/api/auth/me` responses.
- Updated login fallback in `src/app/(auth)/login/page.tsx` so non-admin/non-business users are sent to `/home`.
- Updated protected-page unauthenticated guards to redirect to `/home` (instead of `/login`) in `src/app/admin/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/onboarding/page.tsx`, and `src/app/dashboard/menu/page.tsx` so post-logout landing is consistent.
- API client header fix: `src/lib/api.ts` now merges request options before assigning merged headers so `Content-Type: application/json` is preserved even when custom headers (like `x-business-id`) are passed.
- Added regression test in `tests/api.test.ts` to assert outbound requests keep both `Content-Type` and `x-business-id` for POST category creation flows.
- ADR-010 implementation: dashboard menu (`src/app/dashboard/menu/page.tsx`) now shows suggested category chips and category-scoped suggested item chips from API endpoints.
- Selecting a suggested item now auto-fills item name and dietary tag in create form; item cards now visibly display dietary tags as badges.
- Updated `tests/menu-page.test.tsx` to cover suggestion-aware flows and dietary-tag display behavior.
- Switched dashboard item suggestions to dedicated AI endpoint `GET /api/ai/menu/item-suggestions` with `businessId`, `categoryId`, `q`, and `limit` query parameters.
- Added debounced typed-query suggestion fetch in `src/app/dashboard/menu/page.tsx`; old suggestion chips are cleared while request is in-flight so stale suggestions are not shown during search.
- Category change now triggers immediate re-fetch of item suggestions for the newly selected category; added regression coverage in `tests/menu-page.test.tsx`.
- Removed unnecessary `All categories` control from dashboard menu category rail and made category selection explicit.
- Menu items section now remains visually blurred/locked until at least one category exists, with helper copy guiding first-time setup (`Add your first category to unlock menu item management.`).
- Added web regression test in `tests/menu-page.test.tsx` for locked-no-category state and absence of the `All categories` button.
- UI polish pass: category and item action controls (move/edit/delete) in dashboard menu now use icon-only buttons with accessible `aria-label`/`title` attributes instead of text labels.
- Redesigned category and menu item cards with softer borders, subtle gradients, and improved spacing for cleaner visual hierarchy.
- Updated menu interaction tests to target accessible icon-button labels (e.g., `Edit item ...`, `Delete item ...`).
- ADR-012 implementation: refreshed category cards with color-accented gradient themes per card for stronger visual distinction and cleaner selection contrast.
- Added per-item image blocks in menu cards: render image preview when `imageUrl` exists, otherwise show explicit placeholder (`No Image`).
- Added UI entry-point actions on each item card: `Upload` and `Generate AI` image controls (currently UI-only hooks), with test coverage for placeholder/preview and control presence.
- Category visual refinement follow-up: softened category card styling away from heavy gradients to cleaner white cards with colored left accents and subtler selected-state treatment.
- Item image action placement follow-up: moved `Upload` and `Generate AI` controls directly beneath the image placeholder/preview and converted both to icon-only buttons (accessible via labels/tooltips).
- ADR-013 implementation: create-item form now includes manual description input plus `Generate Description` action using `/api/ai/menu/item-description`.
- Item edit mode now includes editable description textarea and AI-assisted description generation action; item cards display description text when present.
- Added web test coverage in `tests/menu-page.test.tsx` for AI description generation and form autofill behavior.
- Description UX refinement: moved generate-description controls into description textareas as icon-only inline actions (create + edit) using accessible labels/tooltips.
- Layout refinement: added faded gradient section grouping in category panel and subtle gradient divider lines across menu panel subsections for clearer visual separation.
- Suggestion UX refinement: category and menu-item suggestions now render as input-attached dropdown chip panels directly beneath their respective inputs (instead of detached suggestion sections).
- Suggestion UX follow-up: removed dropdown/overlay behavior and kept suggestion chips inline in the same input blocks for both category-create and item-name fields.
- Visual rollback follow-up: removed category faded-gradient grouping and menu-section gradient divider lines from `src/app/dashboard/menu/page.tsx`, returning those regions to neutral bordered surfaces.
- Toast system implementation: added global toast utility (`src/lib/toast.ts`) and viewport (`src/components/ui/toast-viewport.tsx`) mounted in `src/app/layout.tsx`; converted inline auth/admin/onboarding/menu error feedback to toasts and removed inline error text rendering for those flows.
- UX messaging policy: use toasts for all user notifications/errors; avoid inline red/green page text messages for action feedback.
- Dashboard menu image actions are now wired to real API endpoints in `src/app/dashboard/menu/page.tsx`:
  - upload button opens hidden file picker and posts multipart to `/api/business/menu-items/:id/image/upload`,
  - AI button posts to `/api/business/menu-items/:id/image/generate`.
- Added per-item upload/generate loading states with icon pulse feedback and success toasts after refresh.
- Updated `src/lib/api.ts` to preserve custom headers while skipping forced JSON `Content-Type` for `FormData` bodies (required for multipart upload).
- Expanded `tests/menu-page.test.tsx` with endpoint-call assertions for upload and AI image generation actions.
- ADR-016 onboarding update in `src/app/dashboard/onboarding/page.tsx`:
  - slug field is displayed read-only and auto-previewed from business name,
  - currency input is required (3-letter uppercase),
  - logo URL text field replaced with drag-drop/click file upload area + preview.
- On submit, onboarding now uploads selected logo via `POST /api/business/profile/logo` after create/update using returned business id.
- Added `tests/onboarding-page.test.tsx` coverage for read-only slug behavior, currency capture, and logo upload call path.
- Onboarding activity/log fix: profile refresh effect now runs from stable user identity dependency (`user.id`/`user.role`) to prevent repeated fetch loops in onboarding.
- Currency input UX refinement: onboarding now provides searchable code suggestions via `datalist` while still enforcing 3-letter uppercase currency codes.
- Currency UX consistency fix: replaced native `datalist` with app-styled searchable combobox in onboarding (`src/app/dashboard/onboarding/page.tsx`) to avoid browser-specific dropdown rendering.
- Added/updated onboarding test selectors for combobox flow in `tests/onboarding-page.test.tsx`.
- Currency selector follow-up: onboarding now uses a merged single-row input (display + search together); typed search is non-committal until user selects an option.
- Currency selector behavior: selecting an option must immediately close dropdown and show committed value in the same input.
- Currency combobox markup rule: avoid nesting combobox interactive controls inside a wrapping `<label>`; use `label htmlFor` + container to prevent browser refocus/reopen on option click.
- ADR-017 dashboard update in `src/app/dashboard/page.tsx`:
  - business cards now render business logos (with fallback placeholder),
  - archived businesses are hidden by default with `Show archived` toggle,
  - archive flow uses explicit confirm dialog (type `ARCHIVE`) and restore action.
- Auth context now exposes business archive/restore actions (`src/lib/auth-context.tsx`) using API endpoints `PATCH /api/business/profile/archive` and `PATCH /api/business/profile/restore`.
- Added dashboard regression coverage in `tests/dashboard.test.tsx` for archived-toggle behavior and logo rendering.
- Hook-order runtime fix: moved `useMemo`/`useEffect` declarations in `src/app/dashboard/page.tsx` above all early-return branches to resolve React `Rules of Hooks` error triggered on loading-to-ready transitions.
- Archived status visual refinement: dashboard now renders archived badges with red-tinted chips (`bg-red-100 text-red-700`) on business cards and selected-business status pill in `src/app/dashboard/page.tsx`.
- Archived filter behavior refinement: `Show archived` now switches the business grid to archived-only view (not mixed list), with `Show active` to return to active businesses in `src/app/dashboard/page.tsx`.
- Archived emphasis update: archived business cards and archived overview panel/metric cards use red-tinted backgrounds (`red-50` / `red-100`) to make non-active state visually obvious.
- Updated `tests/dashboard.test.tsx` to assert archived-only toggle behavior and archived chip red styling.
- ADR-018 accepted and implemented for public-surface redesign:
  - added reusable public shell (`src/components/public/public-site-shell.tsx`) with structured header/main/footer,
  - redesigned home (`src/app/home/page.tsx`) with hero, sectioned body, and authenticated profile card (single role CTA),
  - introduced reusable dialog surface (`src/components/ui/modal-dialog.tsx`) and shared business auth forms (`src/components/auth/business-auth-forms.tsx`).
- Auth UX update:
  - `/home` now uses local-state login/register dialogs,
  - fallback `/login` and `/register/business` remain functional and render dialog-style auth surfaces,
  - `/qr/login` and `/qr/register` now use dialog-style QR auth pages in QR context.
- Public placeholder alignment: `/menu/[slug]` now uses the same structured public shell and sectioned layout.
- Light-theme baseline update in `src/app/globals.css`: semantic light tokens and explicit sans/display typography stacks for consistent bright visual direction.
- Added `tests/home-page.test.tsx` to cover home dialog opening and authenticated profile CTA behavior.
- Layer 4 completion follow-up in `src/app/dashboard/menu/page.tsx`:
  - menu-item list fetches now pass `categoryId` and reload page-1 data when selected category changes,
  - list response handling now defaults safely for missing/partial payloads to prevent render-time crashes,
  - category/item delete actions now require explicit `confirm(...)`.
- Updated `tests/menu-page.test.tsx` to align menu-item mocks with category-filtered URL shape and keep confirm flow deterministic via global confirm stub.
- Delete-confirm UX refinement: replaced browser-native `window.confirm(...)` in `src/app/dashboard/menu/page.tsx` with in-app modal confirmation UI using `src/components/ui/modal-dialog.tsx`, matching dashboard-style dialog behavior.
- Updated menu delete test flow (`tests/menu-page.test.tsx`) to assert and confirm through dialog action (`Confirm delete`) instead of stubbing global confirm.
- Global header consistency update:
  - added shared app header component `src/components/layout/app-header.tsx` with brand link to `/home` and profile block at top-right.
  - public shell now reuses this header (`src/components/public/public-site-shell.tsx`) so home/auth/QR/public menu pages stay aligned.
  - dashboard/admin/onboarding/menu pages now render the same header with optional left-side page context metadata.
- Header navigation update: shared app header now includes a `Back` button (hidden on `/home`) that uses browser history when available and falls back to `/home`.
- Back-button placement update: moved `Back` out of header into main content top-left via `src/components/layout/body-back-button.tsx`.
- `PublicSiteShell` now renders the shared body back control above page content; dashboard/admin/onboarding/menu pages render the same body back control at the top of their main sections.
- Dashboard UI refinement: converted the small `Manage menu` action into a separate full-width clickable gradient card in `src/app/dashboard/page.tsx` for stronger visual priority and discoverability.
- Dashboard placement follow-up: moved the gradient `Manage menu` quick-action card out of Active Business Overview and into the `Your businesses` grid as the leading card.
- Dashboard placement correction: moved the gradient `Manage menu` quick-action card outside the `Your businesses` container and placed it as a separate right-side panel beside that section.
- Dashboard polish follow-up:
  - simplified `Manage menu` card copy to reduce visual clutter,
  - selected non-archived business cards now use the same amber-orange-rose gradient treatment as the menu quick-action card.
- Dashboard selection style follow-up: reverted selected non-archived business-card fill to previous neutral background (`bg-gray-100`) and retained a gradient-aligned accent via border color (`border-orange-300`).
- Dashboard selection emphasis tweak: increased selected business-card border thickness to `border-2` (both archived and non-archived selected states) for stronger visual prominence.
- Dashboard action layout refinement: pulled `Archive business` out of Active Business Overview and rendered it as a separate clickable card below `Manage menu` in the right-side quick-action panel.
- Dashboard quick-actions update: added `Edit details` button adjacent to archive action card in right panel; routes to onboarding edit path (`/dashboard/onboarding?businessId=...`).
- Onboarding edit restrictions: existing business profiles now lock `Business name` input (read-only/disabled), matching slug immutability and allowing edits only for other fields.
- Added onboarding regression coverage (`tests/onboarding-page.test.tsx`) to verify locked name+slug behavior for existing-profile edit mode.
- Archived-view guard: when `Show archived` mode is active on dashboard, hide quick actions (`Manage menu`, `Edit details`, `Archive business`) regardless of previously selected active business.
