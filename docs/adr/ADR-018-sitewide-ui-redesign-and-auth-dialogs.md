# ADR-018: Sitewide UI Redesign with Global Shell + Home Auth Dialogs

**Date:** 2026-03-20  
**Status:** Accepted

## Context
Requested scope:
1. Redesign the current website UI with clear structure (header/footer/body sections + subsections).
2. Convert login/registration from standalone pages into dialog-based flows.
3. Show a profile section on home when user is loaded.
4. Add a proper hero section on home.
5. Shift the UI to a light color direction.

Current constraints and baseline:
- Public landing currently lives at `/home` with a minimal centered card.
- Login and business registration are standalone pages (`/login`, `/register/business`).
- Root layout has no reusable app shell and no global page-level visual hierarchy primitives.
- Existing auth guards and redirects rely on current route paths; compatibility should be preserved.

## Decision
1. Introduce a reusable global shell for public pages
- Add a shared public shell component used by home and auth entry points.
- Structure includes:
  - sticky/light header with brand + navigation/actions,
  - main content sections (hero + feature/value subsections),
  - footer with product/support/legal links placeholders.
- Keep dashboard/admin application pages functionally intact while updating visual consistency where low-risk.

2. Move auth UX into dialog flows (home + QR pages)
- Home page will own auth dialogs:
  - `login` dialog,
  - `register business` dialog.
- Home dialogs are local-state driven (not deep-link query driven).
- Existing `/login` and `/register/business` routes remain accessible as fallback auth pages.
- QR auth pages (`/qr/login`, `/qr/register`) should also present auth as dialog-based UX within QR context.

3. Add authenticated profile section on home
- When `useAuth()` has a loaded user:
  - show profile card in home header/body summary (email, role, current quick actions),
  - include a single role-aware CTA (`Go to dashboard` or `Go to admin`) and logout action.
- For unauthenticated users, show login/register CTAs that open dialogs.

4. Hero and light-theme visual direction
- Implement a deliberate light design system in `globals.css` with semantic tokens (background/surface/text/accent/border).
- Add hero section with strong headline, supporting copy, and primary/secondary CTAs.
- Introduce section/subsection rhythm via spacing, surface cards, and subtle gradients/patterns without dark-mode dependence.
- Typography choice is implementation-defined (introduce stronger display/body pairing as part of redesign).

5. Testing and compatibility
- Keep auth API usage unchanged (`useAuth` methods, cookie behavior, redirects by role).
- Update/add web tests for:
  - home dialog open/close by CTA interactions,
  - fallback `/login` and `/register/business` behavior remains functional,
  - QR auth dialog behavior in `/qr/login` and `/qr/register`,
  - authenticated home profile section rendering,
  - critical guard flows unchanged.

## Consequences
- Pros:
  - coherent site structure and stronger first-use UX,
  - auth entry consolidated in one place while preserving link compatibility,
  - clearer visual hierarchy with modern light theme.
- Cons:
  - moderate frontend refactor touching multiple routes/tests,
  - potential temporary churn in snapshot-like UI tests.

## Alternatives Considered
- Keep standalone auth pages and only restyle: rejected; does not satisfy dialog requirement.
- Replace entire dashboard/admin UI in same pass: rejected; too broad/risky for one iteration.
- Add modal routing with parallel routes/intercepting routes: deferred; local-state dialogs are sufficient now.

## Acceptance Criteria
1. `/home` has explicit header, hero, body sections/subsections, and footer.
2. Login and business registration are dialog-based on home.
3. `/login` and `/register/business` remain functional fallback auth pages.
4. Home shows authenticated profile section when user is loaded.
5. UI adopts a consistent light color direction across redesigned public surfaces.
6. `/qr/login` and `/qr/register` expose dialog-based auth UX in QR context.
7. Web tests pass after coverage updates.
