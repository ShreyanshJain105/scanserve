---
Date: 2026-04-11
Status: Proposed
---

# ADR-055: Move Business Dashboard UI to App Subdomain

## Context
We want the business/admin web UI to live on a dedicated subdomain (`app.<domain>`), while public-facing routes (home, menu, QR flows) stay on the main domain. The current Next.js app serves both public and dashboard routes under a single host with path-based routing.

We need a clear hosting and routing strategy that:
- Keeps public routes on the main domain.
- Serves dashboard/admin routes on the `app` subdomain.
- Preserves auth, redirects, and cookies without breaking QR/public flows.

## Decision (Proposed)
Adopt **host-based routing** within the existing Next.js app (single deployment) so that:
- `app.<domain>` serves dashboard/admin routes.
- `<domain>` serves public routes (home/menu/qr).
- Cross-host redirects are explicit and deterministic for dashboard/admin-only paths.

### Routing rules
- Requests to `app.<domain>`:
  - Allow `/dashboard`, `/dashboard/*`, `/admin`, `/login`, `/register`, `/home` (if we keep it), and any auth routes needed for business/admin.
  - Redirect `/menu/*` and `/qr/*` to `<domain>` (public entry only).
  - Root `/` redirects to `/dashboard` (or a dedicated app landing if desired).
- Requests to `<domain>`:
  - Allow public routes (`/home`, `/menu/*`, `/qr/*`, `/orders`, `/login` for business if we keep it here).
  - Redirect dashboard/admin routes to `app.<domain>`.
  - Root `/` follows existing auth-aware redirect, but for business/admin roles it should send users to `app.<domain>`.

### Auth + cookies
- Keep existing cookie strategy unless we decide to share auth across subdomains.
- If API is served from the same subdomain as the app (preferred), host-only cookies are sufficient.
- If API remains on a different subdomain, use `Domain=. <domain>` cookies and confirm SameSite/CORS settings.

## Consequences
- Requires middleware to detect `Host` and enforce routing rules.
- Requires updates to auth redirects and absolute URL construction.
- Requires environment variables for base URLs (e.g., `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`).
- Public and dashboard traffic remain in a single Next app unless we choose a split deployment later.

## Implementation Notes (Post-Approval)
- Add Next.js middleware to enforce host-based routing rules.
- Update auth redirects (`/`, login success, role routing) to use the app subdomain.
- Ensure QR/menu routes are served from the main domain only (public entry).
- Add env config and update gateway/proxy if needed.
- Update tests for redirects and host-based routing where applicable.

## Questions & Answers

### Questions for User
1. What is the exact production domain? (e.g., `scan2serve.com` so app is `app.scan2serve.com`.)
2. Should `app.<domain>` land directly on `/dashboard` (root redirect) or have a distinct app landing page?
3. Where will the API live in production: behind the gateway on `app.<domain>` or on `api.<domain>`?
4. Should business/admin login pages live only on `app.<domain>` or remain accessible on the main domain as well?

### Answers (to be filled by user)
- A1: TBD (exact domain not provided yet).
- A2: TBD (should `app.<domain>` root go to `/dashboard` or a distinct landing).
- A3: Behind `app.<domain>` (per user direction).
- A4: Only on `app.<domain>` (per user direction).
- A5: QR + menu routes stay on the main domain only (public entry).
 
