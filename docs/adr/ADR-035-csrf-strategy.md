# ADR-035: CSRF Strategy for Cookie-Based Auth

- Status: Accepted
- Date: 2026-03-26

## Context
- Access tokens are JWTs stored in httpOnly cookies and validated by `requireAuth` on protected routes.
- Refresh tokens are opaque values stored hashed in the database and also stored in an httpOnly cookie scoped to `/api/auth/refresh`.
- The refresh-token implementation is staying as-is; the open question is CSRF mitigation for cookie-based auth.

## Decision
1) **Cookie posture**
   - Keep `SameSite=Lax`, `httpOnly`, `secure` in production.
   - Enforce that all state-changing operations use non-GET verbs.

2) **CSRF enforcement**
   - Implement **CSRF tokens** for mutating routes.
   - Origin/Referer checks are optional and can be layered later if needed.

## Consequences
- Refresh-token implementation remains unchanged.
- CSRF tokens add explicit anti-CSRF validation for cookie-based auth.
- Origin/Referer checks remain optional and can be layered later.

## Questions & Answers

No open questions at this time.
