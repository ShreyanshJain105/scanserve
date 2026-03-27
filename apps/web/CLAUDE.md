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

## Updates 2026-03-26
- Added CSRF token support in `src/lib/api.ts`: fetches `/api/auth/csrf` when needed and sends `x-csrf-token` on mutating requests (including refresh retry).
- Added dismiss button to toast notifications in `src/components/ui/toast-viewport.tsx`.
- Toast viewport now positions below the sticky header by reading header height and setting a CSS offset.
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
- Layer 5 web implementation: added `/dashboard/tables` (`src/app/dashboard/tables/page.tsx`) with bulk-create form, table list pagination, label save, active toggle, QR regenerate, and single/batch download actions.
- Dashboard quick-action panel now includes a direct `Manage tables and QR` card on `src/app/dashboard/page.tsx`.
- Added `tests/tables-page.test.tsx` to cover role guard, initial list fetch, and bulk-create API wiring.
- Customer-flow header update: `AppHeader` now supports `audience="customer"` to suppress business/admin CTA links in customer surfaces.
- `PublicSiteShell` now accepts `headerAudience`, and customer routes (`/menu/[slug]`, `/qr/login`, `/qr/register`) use customer-only header mode.
- Added regression test `tests/app-header.test.tsx` to ensure customer-mode header does not render Dashboard CTA.
- Auth scope context update: `src/lib/auth-context.tsx` now sends `x-qr-token` for `/api/auth/me` and `/api/auth/logout` when QR/menu token context is present in current route URL.
- API refresh retry update: `src/lib/api.ts` now forwards `x-qr-token` to `/api/auth/refresh` when present on the original request headers, keeping customer refresh scope aligned on 401 retries.
- ADR-024 web implementation:
  - `src/lib/auth-context.tsx` now hydrates dual session identities from `GET /api/auth/sessions` (`businessUser`, `customerUser`) while retaining active `user` behavior from `/api/auth/me`,
  - added scoped logout methods (`logoutBusiness`, `logoutCustomer`, `logoutAll`) using unified `/api/auth/logout` with optional `scope`,
  - `src/components/layout/app-header.tsx` now renders both active identities when present and exposes scoped login/logout actions (including cross-scope login entry when one scope is missing).
- Added/updated header and auth-context tests (`tests/app-header.test.tsx`, `tests/auth-context.test.tsx`) for dual-session and scoped-action behavior.
- Header action UX refinement in `src/components/layout/app-header.tsx`: scoped auth actions are now grouped under two parent dropdown-style controls (`Login`, `Logout`) instead of separate flat buttons.
- Dropdown menus include both scope options (`business`, `customer`) and keep `Logout all`; options are disabled when the corresponding session is absent.
- Header-only auth-action policy refinement: removed extra body-level login/logout buttons from `src/app/home/page.tsx` and dashboard fallback states in `src/app/dashboard/page.tsx`; login/logout actions now live only in header dropdown controls.
- Menu/customer-surface refinement:
  - removed repeated QR login/register buttons from menu body in `src/app/menu/[slug]/page.tsx`,
  - customer-mode header now excludes business-scope auth actions (`Login as business`, `Logout business`) and keeps customer-only login/logout controls.
- ADR-025 implementation:
  - auth context methods in `src/lib/auth-context.tsx` now guard login/register calls when target scope is already active (`businessUser`/`customerUser`) and avoid redundant auth write calls,
  - `/login`, `/register/business`, `/qr/login`, and `/qr/register` now render `Already logged in` state when relevant scope session exists,
  - all auth dialogs now have visible close controls wired via `ModalDialog onClose` to safe navigation (`/home` or QR flow continuation).
- Added auth-route/dialog tests in `tests/auth-dialogs.test.tsx` and expanded `tests/auth-context.test.tsx` guard coverage.
- Auth entry-surface refinement:
  - default header login dropdown now exposes only `Login as business` (`src/components/layout/app-header.tsx`),
  - customer login remains available only on customer surfaces (`headerAudience="customer"` flows).

## Updates 2026-03-27
- Added static org-invite preview page with accept/decline actions at `src/app/dashboard/org-invite/[inviteId]/page.tsx`.
- Notifications dropdown now deep-links org invite entries to the preview page.
- Added web tests for org invite preview and notification link (`tests/org-invite-page.test.tsx`, updated `tests/app-header.test.tsx`).
- Added explore page at `src/app/explore/page.tsx` describing org/staff/menu/order use cases; zero-business dashboard CTA now routes to `/explore`.
- Added invite modal UI on dashboard quick actions to call org invite endpoints.
- Added dashboard/explore web tests (`tests/dashboard.test.tsx`, `tests/explore-page.test.tsx`).
- Added navigation between `/home` and `/explore` (home CTA + explore back-to-home).
- Auth route simplification:
  - removed non-dialog hero/section content from `/login`, `/register/business`, `/qr/login`, and `/qr/register`; pages now render dialog-only auth surfaces.
- Home-page auth scope cleanup:
  - removed direct QR login/register preview links from `src/app/home/page.tsx`; home keeps business-first entry while customer auth stays in QR/menu flow.
- Updated `tests/app-header.test.tsx` to assert business-only login in default header mode and customer-only login/logout in customer header mode.
- Added org create page tests and dashboard/onboarding redirect coverage when no org exists (`tests/org-create-page.test.tsx`, updates in `tests/dashboard.test.tsx`, `tests/onboarding-page.test.tsx`).
- Updated web tests for org create flow, explore auth mocking, and `apiFetch` CSRF retry expectations; web suite now passes.
- Fixed org-create submission to JSON.stringify payload in `src/app/dashboard/org/create/page.tsx` and updated org-create test expectation.
- Dashboard now auto-redirects org owners with zero businesses to `/dashboard/onboarding` to start creating the first business; updated dashboard tests accordingly.

## Updates 2026-03-24
- Added notification bell/badge in `AppHeader` that fetches `/api/business/notifications`; link goes to `/dashboard/notifications`.
- Admin page now renders pending-update diffs (from/to) with raw payload toggle.
- Menu and tables pages show blocked/pending/rejected/archived banners explaining disabled state.
- Added tests `tests/notifications-page.test.tsx` and updated `tests/app-header.test.tsx`; full web suite passing.

## Updates 2026-03-24
- Header notification bell is now icon-only, right-aligned, and opens inline scrollable/paginated list (no redirect); badge uses fetched count.
- Logout hidden when no session; dashboard link suppressed when already on dashboard.
- Added `usePathname` mocks across tests; web suite still fully passing.

## Updates 2026-03-24
- Notifications panel now consumes unread/all scopes from `/api/business/notifications`, shows unread count, supports per-item mark-read and mark-all.
- Badge count reflects backend unread count; panel includes scope toggle.

## Updates 2026-03-24
- ADR-032 approved: polish notification UX and standardize blocked banners across owner pages (implementation pending).

## Updates 2026-03-24
- Notification panel shows grouped business headers, type badges, actor hint, and payload field diffs.
- Added blocked banners on dashboard and onboarding pages; web tests passing.
- Auth dialog close-navigation refinement:
  - updated close handlers in `/login`, `/register/business`, `/qr/login`, and `/qr/register` to prefer browser-history back (`router.back()`) before any fallback route push.
  - this avoids forced redirection to `/home` when dialogs were opened from in-context pages (e.g., menu QR flow).

## Updates 2026-03-24
- Auth entry policy clarified: keep route-based auth redirects (`/login`, `/register/business`, `/qr/login`, `/qr/register`) and do not pursue ADR-026's global in-place auth dialog controller.
- Added public menu + cart implementation (ADR-027 accepted): SSR `/menu/[slug]` now fetches public menu API and renders categories/items with availability; client-side cart persists per business/table/QR token using localStorage with quantity controls and total display.
- Added regression coverage `tests/public-menu.test.tsx`; full web suite passes.
- The supported UX remains dialog-style auth pages with history-first close behavior rather than shared client-side dialog orchestration.

## Updates 2026-03-24
- Redesigned public menu surface: hide item descriptions, keep dietary badges and price focus.
- Added floating cart button at bottom-right that opens a bottom sheet cart drawer on the same page; cart drawer reuses localStorage cart scoped by business/table/QR token.
- Updated `apps/web/tests/public-menu.test.tsx` accordingly; web test suite remains green.

## Updates 2026-03-24
- Reduced public menu card footprint (smaller padding/thumb) and added tap-to-select to reveal descriptions on demand.
- Fixed cart drawer close control copy (“Hide cart”) and kept floating button toggling in sync.
- Extended `tests/public-menu.test.tsx` with description-toggle assertion; web tests still pass.

## Updates 2026-03-24
- Further compacted public menu cards to boxy grid and shifted description reveal to a right-hand slide-in panel on selection.
- Cart toggle remains synchronized; no API changes. Tests updated/rerun (web suite green).

## Updates 2026-03-24
- Simplified cart controls to a single floating toggle (no separate hide button inside drawer).
- Public menu cards now render as full-width rows with inline descriptions and row-style layout.
- Updated `apps/web/tests/public-menu.test.tsx`; web suite remains green.

## Updates 2026-03-24
- Restyled public menu row actions: quantity strip on rose background with inline count; “In cart/Add to cart” label sits below price/controls.
- Web tests re-run (11 files, 42 tests) still green.

## Updates 2026-03-24
- Dashboard menu page now formats item prices with the selected business currency (Intl.NumberFormat using `selectedBusiness.currencyCode`); item list price display updated accordingly.
- Web test suite re-run (11 files, 42 tests) passes.

## Updates 2026-03-24
- Dashboard menu item create form now shows the business currency symbol inside the price input (derived from `selectedBusiness.currencyCode`).
- Web tests re-run (11 files, 42 tests) still passing.

## Updates 2026-03-24
- Price input currency symbol now bolded with tighter left placement; layout padding adjusted.
- Web tests re-run (11 files, 42 tests) remain green.

## Updates 2026-03-24
- Added owner notifications page `apps/web/src/app/dashboard/notifications/page.tsx` consuming `/api/business/notifications` with business name/type/message/payload/time display.
- Added notification types to shared package; web test suite remains green.

## Updates 2026-03-24
- Admin page now shows blocked badge, block/unblock toggle, and inline pending-update list with approve/reject actions (pulls `/api/admin/businesses/:id/updates` and block endpoint).
- Web tests still passing (11 files, 42 tests).

## Updates 2026-03-24
- Owner dashboards now honor `blocked` flag: menu and tables pages treat blocked businesses as disabled (same gating as pending/rejected/archived).
- Web test suite remains green (11 files, 42 tests).

## Updates 2026-03-24
- Added notifications entry point in header for business users (links to `/dashboard/notifications`).
- Ran full web suite after changes (11 files, 42 tests).

## Updates 2026-03-24
- Public menu cart now captures customer details, creates orders via `/api/public/orders`, and initiates Stripe checkout (`Order & pay` button).
- Added `/order/[id]` status page in public flow with order totals and item breakdown.
- Updated public-menu and order-page tests; web suite re-run and passing.

## Updates 2026-03-24
- Auth context now refreshes when QR token scope changes (path change) so dashboard access is restored immediately after leaving menu/QR flows.
- Added navigation mock in auth-context tests; web suite still passing.

## Updates 2026-03-24
- Dashboard menu price inputs now use a flex prefix for currency symbols to avoid overlap with longer codes (e.g., AED).

## Updates 2026-03-24
- Header now hides login controls when a session exists (business or customer); logout remains available.

## Updates 2026-03-24
- Header user cards now act as dropdowns with scoped logout actions; removed standalone logout dropdown.

## Updates 2026-03-24
- Header user-card dropdowns now attach to the card width for consistent aesthetics.

## Updates 2026-03-24
- Header dropdowns now auto-close on outside clicks.

## Updates 2026-03-24
- Header dropdowns (including notifications) now close when clicking anywhere outside the open dropdown menus.

## Updates 2026-03-24
- Removed duplicate notification scope tag since the selector buttons already indicate scope.

## Updates 2026-03-24
- Public menu checkout now uses Razorpay: loads checkout script, creates Razorpay order via API, verifies payment, then redirects to `/order/[id]`.

## Updates 2026-03-27
- Added a secondary navigation bar below the header with links to Home, Explore, and Dashboard.
- Removed top-right dashboard CTA and centered the secondary navigation bar.
- Removed default header subtitle under Scan2Serve; now only shows when `leftMeta` is provided.
- Simplified user tag display to show only email; profile label moved into dropdown.
- Removed header subtitle entirely; product name now stands alone in header.
- Made `/explore` public (no auth guard) and hid Dashboard nav until login.
- Dashboard nav now only appears for business-role users.
- Root redirect now sends any session with access/refresh tokens (business or QR) to `/explore`.
