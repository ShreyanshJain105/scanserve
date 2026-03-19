# docs — Architecture and Process Records

## What this is
Project documentation for architecture decisions, process notes, and operational guidance.

## Conventions
- ADR files live in `docs/adr/` and use the `ADR-XXX-title.md` naming pattern.
- ADRs should include: Date, Status, Context, Decision, Consequences.
- Keep ADR status explicit (`Proposed`, `Accepted`, `Superseded`) and update when approved.

## Updates 2026-03-19
- Added `docs/adr/ADR-004-business-onboarding.md` as a proposed decision for Layer 3 onboarding + admin approval gate.
- Follow-up: once approved, implement Layer 3 and update ADR-004 status to `Accepted`.
- Regenerated ADR-004 with explicit lifecycle, endpoint scope, gating middleware decisions, alternatives considered, and required test coverage.
- Regenerated ADR-004 again with a mandatory 10-question ambiguity checklist to be answered in-ADR before implementation approval.
- Resolved all 10 ADR-004 ambiguity questions directly in the ADR with explicit implementation choices (status defaults, middleware error contract, dashboard gating UX, test policy, multi-business direction).
- ADR-004 status moved from `Proposed` to `Accepted`; Layer 3 implementation started with backend routes, frontend onboarding flow, and tests.
- Added ADR-005 (Proposed) to narrow MVP auth scope: customer registration is feature-flagged (off by default), active registration is business-only, and customer entry is QR-only to public menu.
- ADR-005 scope refined: customer auth must not appear on main website routes; it is only QR/public-menu triggered when customer cookie/session is missing and related flags are enabled.
- ADR-005 clarified implementation rules: `qr/`-prefixed customer auth routes only, non-QR customer auth rejection, QR-scoped customer cookies, hashed/signed QR token entry, and explicit non-QR customer-auth freeze notes in CLAUDE files.
- ADR-006 proposed as conflict-resolution ADR that supersedes ADR-005 and unifies policy: business-only website auth, QR-scoped customer auth only, strict non-QR rejection, and dedicated QR customer session boundaries.
- ADR-006 endpoint policy update: keep shared auth endpoints (`/api/auth/login` + `/api/auth/register`); distinguish QR customer auth by required hashed `qrToken` context rather than separate QR API endpoints.
- ADR-006 refreshed with current context snapshot and acceptance criteria: no customer auth in main website routes, tamper rejection via `403 CUSTOMER_AUTH_QR_ONLY`, shared auth endpoints with required QR token for customer role, and strict cookie/session isolation from business auth.
- ADR-006 accepted: QR-scoped customer auth now uses shared auth endpoints with required `qrToken` for customer role; open-question defaults were adopted for implementation baseline.
