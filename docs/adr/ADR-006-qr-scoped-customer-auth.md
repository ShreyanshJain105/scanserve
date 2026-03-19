# ADR-006: QR-Scoped Customer Auth with Business-Only Website Auth

**Date:** 2026-03-19  
**Status:** Accepted  
**Supersedes:** ADR-005

## Context
ADR-005 introduced the right direction but left conflicting decisions:
- It mixed customer auth under `/api/auth/*` and QR-prefixed auth routes.
- It combined "flags default off" with "QR-triggered customer auth required" without a clear active path.
- It used mixed error semantics (`400` invalid role vs `403` QR-only restriction) for similar misuse cases.

Product intent is now explicit:
- Main website auth is business-only.
- Customer auth exists only in QR flows.
- Any non-QR customer auth pathway must be removed/blocked.
- Customer-specific data/session must not be used on main website flows (only QR-scoped flows).

## Current Context Snapshot
- Keep a single API server and shared auth endpoints (`/api/auth/login`, `/api/auth/register`).
- Distinguish QR customer auth requests by required hashed/signed `qrToken` in request payload for `role=customer`.
- Main website routes never expose customer login/register controls.
- Non-QR request tampering for customer auth must be explicitly rejected.

## Decision
1. Auth surface split
- Business/admin auth remains under existing website auth flow.
- Customer auth remains QR-scoped only at the web layer (QR entry and QR pages), but uses the same API auth endpoints as business auth.
- API endpoints stay unchanged:
  - `POST /api/auth/login`
  - `POST /api/auth/register`
- Separation is done by request context:
  - business website requests do not include QR token,
  - customer QR requests include a hashed/signed QR token (`qrToken`) in auth payload.

2. Non-QR customer pathway removal
- Remove customer role options and links from all non-QR website flows (`/login`, `/register`, landing CTAs).
- Block direct access/tampering attempts to customer auth outside QR context.
- Main website `/register` should redirect to `/register/business` to keep one business onboarding entry.
- Customer auth UI/pages are not discoverable from non-QR navigation.

3. QR context enforcement
- Scan entry is `GET /qr/:qrToken`.
- `qrToken` must be hashed/signed and resolved server-side to business/table context.
- Customer auth requests through `/api/auth/login` and `/api/auth/register` require validated QR context for `role=customer` (derived from `qrToken` and/or resolved session marker).
- If QR context is missing or invalid, reject with `403` + `CUSTOMER_AUTH_QR_ONLY`.
- QR token validation failure should not leak business/table internals (generic message, explicit error code).

4. Cookie/session isolation
- Customer auth/session cookie must be scoped to QR pages and not reused for business/admin role auth.
- Business/admin cookies remain separate and continue current behavior.
- Customer cookie must not grant access to non-QR protected areas.
- Business/auth middleware must ignore QR customer cookie for business/admin authorization checks.

5. Feature flag policy (conflict resolution)
- `ENABLE_CUSTOMER_QR_AUTH` (default `true` in dev, configurable per environment) controls QR-scoped customer auth.
- Legacy flags (`ENABLE_CUSTOMER_REGISTRATION`, `ENABLE_CUSTOMER_LOGIN`) are treated as implementation details and should not enable non-QR customer auth.
- Regardless of flags, non-QR customer auth remains disallowed by policy.

6. Error contract
- Non-QR customer auth attempt: `403` + `CUSTOMER_AUTH_QR_ONLY`.
- Unsupported role submitted on business website auth endpoints: `400` + `INVALID_REGISTRATION_ROLE`/`INVALID_LOGIN_ROLE`.
- Response envelope stays `{ status: 0, error: { code, message } }`.

7. Scope freeze
- No new non-QR customer features are to be built until a future ADR explicitly reopens that scope.

## Implementation Plan
1. Route cleanup:
- remove customer options/CTAs from non-QR UI
- ensure `/register` redirects to `/register/business`
2. QR auth UI:
- keep customer auth interaction under QR-driven pages only
- include `qrToken` in customer login/register requests
3. API policy enforcement:
- keep same `/api/auth/login` and `/api/auth/register` endpoints
- for `role=customer`, require valid `qrToken` context and reject non-QR attempts
- keep business website auth unaffected
4. Session model:
- enforce dedicated customer cookie scope for QR flows
- keep business/admin cookies separate
5. Tests:
- web tests for non-QR customer pathway absence and `/register` redirect
- API tests for QR-context-required customer auth
- QR token validation tests
6. Documentation:
- add explicit "no non-QR customer auth work" notes in root/API/web `CLAUDE.md`

## Acceptance Criteria
1. `/login` and `/register` website flows have no customer option.
2. `/register` redirects to `/register/business`.
3. Customer auth through shared auth endpoints succeeds only when valid `qrToken` context is present.
4. Customer auth attempts without QR context return `403 CUSTOMER_AUTH_QR_ONLY`.
5. Business login/register remains unaffected.
6. Customer cookie cannot be used for business/admin authorization.

## Open Questions (To Finalize in ADR)
1. `qrToken` format and crypto
- Question: Should `qrToken` be an opaque random lookup key or a signed token (e.g., JWT/HMAC payload)?
- Recommended default: opaque random token stored server-side with hash-at-rest; avoid encoding business/table identifiers client-visible. [approved]

2. `qrToken` lifecycle
- Question: What expiry and rotation policy should QR tokens follow?
- Recommended default: non-expiring per generated table QR (revoked on table QR regenerate), with optional soft-rotation support. [keep the qrtoken non-expiring until the qrcode is deleted]

3. Auth request transport
- Question: Should `qrToken` be accepted in request body only, header only, or both?
- Recommended default: body field `qrToken` for login/register payloads, reject header-only to keep one contract. [approved]

4. Validation order
- Question: For `role=customer`, should server validate QR context before credential lookup?
- Recommended default: validate `qrToken` first, then process login/register to reduce unnecessary auth work and leakage. [approved]

5. Customer identity persistence mode
- Question: Does QR register create persistent `customer` users in DB now, or QR-session-only customer profiles?
- Recommended default: persistent `customer` user records allowed only via QR context (future-friendly for order history). [approved but keep it as customer of the webapp not the business registered]

6. Legacy customer users
- Question: How should existing `customer` users created before this policy be treated?
- Recommended default: allow login only when valid QR context is present; block non-QR auth attempts. [no users are created before so do not frain over this]

7. Cookie contract
- Question: What are final cookie names and path scopes?
- Recommended default:
  - business: existing `access_token` + `refresh_token`
  - customer QR: `qr_customer_access` + `qr_customer_refresh`
  - customer cookie path scoped to `/qr`
  [for customer QR: change it to 'customer_access_token' and 'customer_refresh_token']

8. Invalid/expired QR UX
- Question: What UI should user see for bad QR token?
- Recommended default: dedicated `/qr/invalid` page with generic error, no business/table metadata exposure. [approved]

9. Abuse controls
- Question: What rate limits apply to customer QR auth endpoints (shared auth routes with `role=customer`)?
- Recommended default: IP + token-based throttling on `/api/auth/login` and `/api/auth/register` when `role=customer`. [approved, apply rate-limiting to all the auth requests]

10. Environment flag defaults
- Question: What should `ENABLE_CUSTOMER_QR_AUTH` default to across envs?
- Recommended default:
  - local/dev: `true`
  - staging: `true`
  - production: `false` until explicit launch sign-off

## Open Questions Resolution (Adopted Defaults)
- The recommended defaults listed in the Open Questions section are adopted for implementation unless explicitly overridden in a follow-up ADR.

## Consequences
- Pros:
  - Eliminates auth-surface ambiguity and misuse paths.
  - Aligns UX with product funnel (QR -> menu -> customer actions).
  - Preserves ability to evolve customer auth later without polluting business website flow.
- Cons:
  - Adds QR context validation and token lifecycle complexity.
  - Requires careful cookie/path/domain configuration and tests.

## Alternatives Considered
- Keep customer auth in website flow behind hidden UI flags: rejected due to bypass risk and policy ambiguity.
- Remove customer auth entirely: rejected; QR-triggered customer auth remains a near-term requirement.
- Create separate QR-specific API endpoints (`/api/qr/login`, `/api/qr/register`): rejected for now to avoid endpoint sprawl; same auth endpoints with explicit QR token context provide cleaner separation.
