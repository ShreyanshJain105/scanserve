# ADR-005: Business-Only Website Registration; QR-Triggered Customer Auth

**Date:** 2026-03-19  
**Status:** Superseded by ADR-006  

## Context
Current auth allows public role-based registration and includes `customer` signup from website auth pages. Product direction for MVP is now:
- Website registration/login experience is for business users only.
- Customer auth should not be visible or reachable from main website pages.
- Customer auth is only triggered in QR flow: when a user lands on public menu from QR and required customer cookie is missing.
- Existing customer auth implementation should be preserved behind feature flags for later activation.

Removing all customer-signup code now would create churn and rework when we revisit customer accounts later.

## Decision
1. Registration policy and feature flags
- Backend flag `ENABLE_CUSTOMER_REGISTRATION` (default `false`) gates customer registration on `/api/auth/register`.
- Backend flag `ENABLE_CUSTOMER_LOGIN` (default `false`) gates customer login from non-QR flows.
- When flags are `false`, public website auth endpoints accept only business login/registration.
- `admin` public registration remains disallowed.
- API contract for disallowed role/path: `400`, `status: 0`, `INVALID_REGISTRATION_ROLE` (register) or `INVALID_LOGIN_ROLE` (login).

2. Frontend auth route scope
- Main website auth routes expose business flow only.
- `/register` and `/register/business` remain business-focused.
- Customer register/login controls are hidden unless both:
  - user is inside QR public-menu flow, and
  - customer cookie/session is missing.
- Remove existing customer pathways from all non-QR flows:
  - remove customer option/controls from main website auth pages,
  - remove direct customer navigation/CTAs from landing and dashboard auth entry points,
  - block access to customer auth screens/routes when request origin is not QR/public-menu context.
- Optional web flags:
  - `NEXT_PUBLIC_ENABLE_CUSTOMER_REGISTRATION` default `false`
  - `NEXT_PUBLIC_ENABLE_CUSTOMER_LOGIN` default `false`

3. Customer entry model
- Customer access is QR-driven under `qr/` prefix.
- Canonical scan entry path becomes `GET /qr/:qrToken` where `qrToken` is a hashed/signed identifier.
- Server resolves `qrToken` to business/table context, then opens the corresponding public menu page.
- Customer auth pages are only under QR namespace:
  - `/qr/login`
  - `/qr/register`
- Customer auth trigger condition:
  - user is in `qr/` flow, and
  - required customer cookie/session is missing.
- Customer identity remains order-scoped (`customerName`, `customerPhone`) for MVP checkout.

4. Type and test policy
- Shared `UserRole` can keep `customer` for future use.
- Current tests assert customer website auth is disabled by default and business website auth remains active.
- Add explicit API tests for:
  - business registration succeeds,
  - customer registration is rejected when flag is off.
- Add web tests for:
  - `/register` does not expose customer role/controls,
  - QR/public-menu path shows customer auth gate only when cookie/session is missing and flags are enabled.
- Existing order-domain `customer*` fields remain unchanged (guest order metadata, not auth users).

## Urgent Task Plan
1. API: add `ENABLE_CUSTOMER_REGISTRATION` gate in auth register route.
2. API: add `ENABLE_CUSTOMER_LOGIN` gate for customer login from website contexts.
3. Web: keep visible registration/login scope business-only on main website.
4. API + web routing: create QR-prefixed customer auth routes (`/qr/login`, `/qr/register`) and block non-QR customer auth attempts.
5. Web: implement QR/public-menu cookie check hook to trigger customer auth gate only in QR flow.
6. Cleanup: remove legacy non-QR customer pathways in UI/router wiring and enforce route guards.
7. Session separation: keep customer cookie scoped to `qr/` pages and keep business auth cookie separate.
8. QR security: use hashed/signed QR token and direct token-to-menu resolution.
9. Tests: update/add API and web tests to reflect business-only website scope + QR-trigger behavior.
10. Docs: add CLAUDE notes that customer website auth is feature-flagged and currently out-of-scope.

## Open Questions Resolution (Answered)
1. Non-QR customer auth tampering behavior:
- Do not expose customer login/register on main website UI.
- If customer auth is attempted outside `qr/` flow, reject request with explicit error (`403`, `CUSTOMER_AUTH_QR_ONLY`).

2. QR route naming:
- Use `qr/` prefixed routes.
- Customer auth pages are `/qr/login` and `/qr/register`.

3. Cookie/session separation:
- Customer cookie remains scoped to QR routes only.
- Business/admin auth cookie remains separate and is not reused for customer flows.

4. Best behavior for `/register`:
- Use business-only behavior and redirect `/register` -> `/register/business` to avoid duplicate auth UI.

5. Implementation order:
- Prioritize policy enforcement first (route gating + cookie scope), then UI wiring, then tests.

6. Hashed QR identifier:
- Use signed/hashed `qrToken` in scan URL (`/qr/:qrToken`) and resolve it server-side to business/table context.
- Avoid exposing raw predictable IDs in QR links.

7. Legacy-customer meaning:
- "Legacy customer users" means customer-role rows that may already exist in DB from earlier builds.
- Current policy: they still cannot access non-QR auth pathways.

8. Documentation decision:
- Add explicit "do not build/extend non-QR customer auth" notes in root `CLAUDE.md`, `apps/api/CLAUDE.md`, and `apps/web/CLAUDE.md` until a future ADR re-enables it.

## Consequences
- Pros:
  - Aligns MVP funnel (QR -> public menu -> order) and removes customer-auth noise from business website entry.
  - Reduces current surface area while preserving a clean reactivation path.
  - Keeps engineering focus on business onboarding and menu/order flows.
- Cons:
  - Introduces one more runtime flag to manage.
  - Dormant code paths can drift if not covered by future test reactivation.

## Alternatives Considered
- Hard-delete all customer signup code now: rejected because it increases reimplementation cost when customer accounts are resumed.
- Leave customer signup fully enabled but undocumented: rejected because it conflicts with MVP scope and creates product ambiguity.
