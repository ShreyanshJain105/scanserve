# docs — Architecture and Process Records

## What this is
Project documentation for architecture decisions, process notes, and operational guidance.

## Conventions
- ADR files live in `docs/adr/` and use the `ADR-XXX-title.md` naming pattern.
- ADRs should include: Date, Status, Context, Decision, Consequences.
- Keep ADR status explicit (`Proposed`, `Accepted`, `Superseded`) and update when approved.
- UX guidance docs should enforce toast-based user notifications/errors rather than inline page text alerts for action feedback.

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
- Added ADR-007 (Proposed) for Layer 4 Menu Management to define category/menu-item CRUD scope, reorder semantics, availability toggling, and required API/web test coverage before implementation.
- ADR-007 is now accepted and Layer 4 implementation has started (business category/menu-item API endpoints plus dashboard menu UI baseline).

## Updates 2026-03-20
- Added ADR-008 (Accepted) to define root-route redirect behavior and `/home` landing split (`/` redirect gate, `/home` public landing).
- Added ADR-009 (Accepted) to standardize API logging with a singleton logger and structured request/error lifecycle events.
- Added ADR-010 (Accepted) for subtle AI-assisted menu authoring: top-5 category/item suggestions (excluding existing entries), dietary-tag auto-fill from selected suggestions, and visible dietary-tag display in dashboard menu list.
- Added ADR-011 (Accepted) to evolve ADR-010 suggestions into LLM-driven, context-aware top-5 recommendations with typed-text autocomplete and deterministic fallback.
- ADR-011 was refined to enforce singleton AI model/client instantiation per API process and to use dedicated AI endpoint namespace (`/api/ai/menu/item-suggestions`).
- Added ADR-012 (Accepted) for dashboard menu visual refresh: color-accented category cards and per-item image placeholder with `Upload` and `Generate AI` entry points (UI-first, backend persistence deferred).
- Added ADR-013 (Accepted) for item description authoring: manual description input/edit plus AI-generated description endpoint (`/api/ai/menu/item-description`) with deterministic fallback.
- Recorded cross-app UX messaging policy: prefer toasts for user notifications/errors; avoid inline banner/text feedback patterns.
- Added ADR-014 (Accepted): menu-item image persistence now uses local S3-compatible storage (MinIO), persists only `image_path` in DB, and wires upload/AI image generation routes into dashboard image actions.
- Added ADR-015 (Accepted): deleted/replaced image paths are stored in a DB cleanup queue and removed from S3 by periodic retryable cleanup worker.
- Added ADR-016 (Accepted): onboarding now uses server-side auto-generated immutable slugs, requires currency input, and replaces logo URL entry with drag-drop logo upload.
- Added ADR-017 (Accepted): dashboard business cards use logos, business delete flow is replaced with archive+confirm behavior, restore is allowed within retention window, and archived businesses are auto-deleted after 30 days with audit logging.
- Added ADR-018 (Accepted): sitewide public UI redesign with explicit header/body/footer shell, home hero + authenticated profile section, dialog-based auth UX on home/QR pages, and light-theme visual system refresh.
- Added ADR-019 (Accepted): Layer 5 table + QR management contract covering table bulk-create/list/update/toggle, QR regenerate/history continuity, and single/batch QR download export scope.
- Added ADR-020 (Accepted at the time) as the initial Gemini provider-switch path; this is now superseded by ADR-022 (Gemini-only runtime).
- Added ADR-021 (Accepted): text/image generation now share backend guardrails for unsafe prompt blocking and generated-text sanitization/fallback safety.
- Added ADR-022 (Accepted): menu image generation runtime is now Gemini-only; legacy Nano-Banana/provider-switch implementation has been removed.
- Added ADR-023 (Accepted): keeps a single `/api/auth/*` namespace and enforces business-vs-customer scope resolution by `qrToken` validity, with strict cookie isolation and mixed-session guardrails.
- Added ADR-024 (Accepted): introduces dual-session visibility (`businessUser` + `customerUser`) and scoped logout/login UX in unified auth without splitting route namespaces.
- Added ADR-025 (Accepted): auth entry routes now guard against redundant login/register calls when scope session already exists and all auth dialogs expose visible close controls.

## Updates 2026-03-24
- Marked `docs/adr/ADR-026-in-place-auth-dialogs-without-route-transitions.md` as superseded without implementation.
- Auth UX policy remains route-based: keep explicit redirects to `/login`, `/register/business`, `/qr/login`, and `/qr/register` instead of introducing a global in-place auth dialog controller.

## Updates 2026-03-24
- Added and accepted `docs/adr/ADR-027-public-menu-and-cart.md` to define Layer 6 scope: public menu SSR, read-only public menu API, and client-side cart keyed by business/table/qrToken, with ordering/payment deferred to Layer 7.

## Updates 2026-03-24
- Drafted `docs/adr/ADR-028-business-update-approvals-and-block-flag.md` (Proposed) to add a `blocked` flag, queue business profile edits for admin approval instead of blocking live businesses, and introduce admin approve/reject flows for pending updates.

## Updates 2026-03-24
- Drafted `docs/adr/ADR-034-razorpay-payments.md` (Proposed) to replace Stripe with Razorpay for UPI support.

## Updates 2026-03-24
- ADR-034 accepted: replace Stripe payment flow with Razorpay order create + signature verification.

## Updates 2026-03-26
- Drafted `docs/adr/ADR-035-csrf-strategy.md` to capture CSRF posture decisions (proposed, awaiting approval).
- Scoped ADR-035 to CSRF strategy only; refresh-token implementation stays unchanged.
- ADR-035 accepted: implement CSRF tokens for mutating routes.

## Updates 2026-03-27
- Expanded `docs/adr/ADR-036-layer8-order-management.md` to capture 6-month retention, monthly partitioning, and order-event queue → warehouse pipeline considerations.
- Recorded ADR-036 answers for warehouse target (ClickHouse) and event schema (full snapshots with event-time gating + `eventId` dedupe).
- Recorded ADR-036 retention delete policy: hard delete from Postgres after 6 months.
- ADR-036 accepted with final status flow (Pending → Accepted → Preparing → Ready → Completed; Cancel allowed only pre-Preparing).
- Clarified ADR-036 MVP filtering to status-only and updated Decision header to Accepted.
- Marked ADR-036 as Paused pending ADR-037 (RBAC scope + invites).
- Drafted ADR-037 (`docs/adr/ADR-037-rbac-scope-and-business-invites.md`) to define scoped business memberships and invitation flow.
- Updated ADR-037 with org-level membership model (one org per user, owner creates org on first business).
- Updated ADR-037 answers: org invites require existing user email, in-app user notifications, and role permission matrix.
- ADR-037 accepted with org-invite accept/decline flow via blurred org preview page.
- Updated ADR-037 to require a static sample org preview page (no real org references) for invite acceptance UX.

## Updates 2026-03-29
- Drafted `docs/adr/ADR-038-org-membership-roleless.md` proposing roleless org membership and business-role-only permissions.
- ADR-038 accepted and implemented: org memberships are roleless, org invites authorized by org owner or any business owner/manager, and business access management is scoped to selected-business roles only.
- Unpaused ADR-036 (Layer 8 order management) and began order management UI implementation in web.

## Updates 2026-03-29
- ADR-039 accepted: added cash payments, payment-gated order creation, and UI payment-status tags.

## Updates 2026-03-30
- ADR-040 accepted: orders date filtering moves to server-side queries using browser timezone.

## Updates 2026-03-30
- Drafted ADR-041 to require customer login before order placement (QR-scoped auth).
- ADR-042 accepted: separate customer accounts and require login before order placement.

## Updates 2026-03-30
- Drafted ADR-042 for separating customer accounts and requiring login before order placement.

## Updates 2026-03-30
- Drafted ADR-043 to introduce a customer orders hub page (list + selected order detail) and an authenticated customer orders list API.
- ADR-043 accepted: customer orders hub at `/orders`, remove `/order/:id`, and add customer orders list API with 10-item pagination and active-order default selection.
- ADR-043 now includes an implementation task checklist covering redirects, route removal, API, tests, and doc updates.
- ADR-043 implementation underway: `/orders` hub and customer orders list API are now in place; docs updated to remove `/order/[id]` references.

## Updates 2026-03-30
- Marked ADR-043 implementation tasks as completed (`docs/adr/ADR-043-customer-orders-hub.md`).

## Updates 2026-03-30
- Updated ADR-036 to specify outbox → Redis Streams → ClickHouse for the warehouse feed pipeline.

## Updates 2026-03-30
- Updated ADR-036 to document composite primary keys and partitioning for `orders` + `order_items`.

## Updates 2026-03-30
- Updated ADR-036 with status-actor accountability addendum (statusActors JSON field + UI visibility).

## Updates 2026-04-04
- ADR-044 accepted: order dashboard notifications will use toasts + a bundled sound tone.

## Updates 2026-04-04
- Drafted ADR-044 for order dashboard notifications using toast + sound (`docs/adr/ADR-044-order-notifications-toast-sound.md`).

## Updates 2026-04-04
- ADR-045 accepted: dashboard-scoped analytics endpoints with Postgres (today/yesterday/current week) + ClickHouse (last week/month/quarter/year), Redis caching for non-today, and timezone stored on business profiles (`docs/adr/ADR-045-analytics-endpoints.md`).

## Updates 2026-04-08
- Drafted ADR-046 for introducing an API gateway layer as infrastructure (`docs/adr/ADR-046-api-gateway-layer.md`).

## Updates 2026-04-09
- Updated ADR-046 to require an internal API key header from the gateway for API requests, never exposed to browsers (`docs/adr/ADR-046-api-gateway-layer.md`).
- Accepted ADR-046 with gateway-fronts-both + internal API key for non-public routes (`docs/adr/ADR-046-api-gateway-layer.md`).
- Implemented gateway routing baseline and internal API key enforcement wiring (Nginx gateway + API middleware).
