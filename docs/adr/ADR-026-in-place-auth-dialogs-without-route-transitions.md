# ADR-026: In-Place Auth Dialogs Without Route Transitions

**Date:** 2026-03-20  
**Status:** Superseded  
**Depends on:** ADR-023, ADR-024, ADR-025

## Superseded Note
On 2026-03-24 this proposal was explicitly dropped. The project keeps route-based auth entry
pages (`/login`, `/register/business`, `/qr/login`, `/qr/register`) and history-first close
behavior rather than moving to a global in-place auth dialog controller.

## Context
Current auth UX still relies on route-based auth pages (`/login`, `/register/business`, `/qr/login`, `/qr/register`) that render dialog UI after navigation.  
This creates a confusing flow: user clicks login/register on page A, gets redirected to page B, then sees a dialog.

Desired behavior:
- auth dialogs should open on the same page where user initiated action,
- no route transition for normal auth entry actions,
- QR customer auth remains token-scoped.

## Decision
Move to a global, in-place auth dialog system controlled by client-side state, and stop using route transitions for primary auth entry.

## UX Contract
1. Business auth
- `Login as business` opens business login dialog in-place.
- `Register business` opens business register dialog in-place.

2. Customer auth (QR-scoped)
- `Login as customer` opens customer login dialog in-place when `qrToken` context is available.
- `Register as customer` opens customer register dialog in-place when `qrToken` context is available.
- If QR token is missing, show toast/info and do not navigate.

3. Close behavior
- Close button always dismisses dialog only.
- Close action does not trigger auth submissions.

4. Already-logged-in guard
- Reuse ADR-025 behavior:
  - if target scope session exists, show `Already logged in as ...`,
  - block redundant auth write calls.

## Architecture
### Global dialog controller
Add a client-side auth-dialog controller/provider (mounted once in app layout):
- state: dialog mode (`business-login`, `business-register`, `customer-login`, `customer-register`, `null`)
- optional payload: `qrToken`
- actions:
  - `openBusinessLogin()`
  - `openBusinessRegister()`
  - `openCustomerLogin(qrToken)`
  - `openCustomerRegister(qrToken)`
  - `closeAuthDialog()`

### Dialog host
Render one dialog host at root layout, consuming controller state and auth context methods.

## Routing Policy
### Primary flow
- Internal auth triggers must use dialog controller actions, not route navigation.

### Legacy route handling
Keep route pages temporarily for backward compatibility and deep links:
- `/login`, `/register/business`, `/qr/login`, `/qr/register` should become compatibility entry points that either:
  - auto-open dialog and return to safe page context, or
  - show short deprecation screen with action to open dialog.

Final removal/redirect of legacy routes occurs only after internal link migration and usage confidence.

## Consequences
### Pros
- Cleaner UX: no unnecessary page hop before dialog.
- Consistent auth interaction model across site.
- Better continuity for QR and menu flows.

### Trade-offs
- Requires global client-side dialog orchestration.
- Compatibility handling needed during migration.
- Slight increase in shared UI state complexity.

## Implementation Checklist
1. Add global auth dialog controller + root dialog host.
2. Migrate header/home/menu/dashboard auth triggers to controller actions.
3. Wire QR token extraction for customer auth dialog entry.
4. Keep ADR-025 already-logged-in guards and close controls in dialog host.
5. Convert route-based auth pages to compatibility mode.
6. Add tests for no-route-change auth open behavior and close behavior.

## Acceptance Criteria
1. Clicking auth actions opens dialog on current page (no route transition).
2. Customer auth dialog opens only with valid QR context input.
3. Closing dialog keeps user on same page.
4. Already-logged-in guard blocks redundant auth API calls.
5. Legacy auth routes remain safe during migration and do not break deep links.

## Outcome
This ADR is not being implemented.

The retained project direction is:
- auth entry remains route-based and explicit,
- route pages continue rendering dialog-style auth surfaces,
- close behavior should prefer `router.back()` with safe fallback routing,
- future work should not introduce a global auth-dialog controller unless a new ADR replaces this decision.
