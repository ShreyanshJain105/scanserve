# ADR-028: Business Update Approvals and Block Flag

- Status: Accepted
- Date: 2026-03-24

## Context

Currently, updating a business profile moves the business back to `pending`, blocking operations until admin approval. The user wants:
- Edits to be stored without blocking the live business.
- Admin review/approval of edits before they take effect.
- An explicit `blocked` flag that lets admins freeze a business and all related operations.

## Decision (Proposed)

1) **New schema:**
   - Add boolean `blocked` to `Business` (default `false`).
   - Add `business_update_requests` table to store pending edits:
     - `id`, `businessId`, `payload` (JSONB of proposed fields), `createdAt`, `updatedAt`, `status` (`pending|approved|rejected`), `reviewedBy`, `reviewedAt`, `reviewNote`.

2) **Business profile edits (PATCH /api/business/profile):**
   - For approved businesses: write diffs into `business_update_requests` with `status=pending`; do **not** change live `Business` record.
   - For pending businesses (initial creation not yet approved): keep current behavior—updates apply directly and stay `pending`.
   - For rejected businesses: allow direct edits and set status back to `pending` (unchanged from prior policy).
   - Response for approved businesses returns both `currentBusiness` and `pendingUpdate` (if any).

3) **Admin moderation:**
   - New endpoints under `/api/admin/businesses/:id/updates` to list, approve, or reject pending updates.
   - Approve: apply payload fields to `Business`, delete/close the request.
   - Reject: mark request `rejected` with optional note; do not change `Business`.

4) **Blocked flag enforcement:**
   - Add middleware guard: if `business.blocked` is true, reject business-scoped routes with `403 BUSINESS_BLOCKED`.
   - Admin endpoint to set/clear `blocked` (`PATCH /api/admin/businesses/:id/block` with `{ blocked: boolean, reason? }`).

5) **UX surfaces (follow-up after API):**
   - Business owner notifications: add a notifications drawer/button that lists all admin decisions and pending-update statuses, including business name, fields changed, decision (approved/rejected/pending), and timestamps. Current vs pending diffs are shown here, not inline on the dashboard form.
   - Admin UI should surface pending update rows with diff view and approve/reject actions.

## Implementation Tasks (Planned)

1) **Schema migration**
   - Add `blocked boolean default false` to `businesses`.
   - Add `business_update_requests` table with: id, business_id FK, payload JSONB, status enum (`pending|approved|rejected`), reviewed_by FK nullable, reviewed_at, review_note, created_at, updated_at.
   - Add indexes on `business_id, status` and `created_at`.

2) **API surface for updates queue**
   - Change `PATCH /api/business/profile` behavior:
     - If business status is `approved`: store diff in `business_update_requests` (single pending per business; replace existing pending request) without changing live record.
     - If status `pending` (initial creation): keep current apply-in-place behavior.
     - If status `rejected`: allow apply-in-place and set status to `pending` (existing rule).
   - Response returns current business and pending update (if any).

3) **Admin moderation endpoints**
   - `GET /api/admin/businesses/:id/updates` list pending/rejected/approved requests (filterable by status).
   - `PATCH /api/admin/businesses/:id/updates/:updateId/approve` applies payload to Business, deletes or marks request approved.
   - `PATCH /api/admin/businesses/:id/updates/:updateId/reject` marks request rejected with optional review_note.

4) **Blocked flag**
   - Add `blocked` checks to business-scoped middleware (e.g., `requireApprovedBusiness`) returning `403 BUSINESS_BLOCKED` when true.
   - Admin endpoint `PATCH /api/admin/businesses/:id/block` with `{ blocked: boolean, reason? }`.
   - Ensure business-scoped routes (menu, tables, qr, ai, images) enforce blocked.

5) **Notification plumbing (backend)**
   - Emit notification records on update approve/reject and block/unblock actions; expose list endpoint for owner (e.g., `/api/business/notifications`).
   - Include business name, fields changed summary, decision, timestamps.

6) **Web follow-up (separate effort after API)**
   - Dashboard: show notification bell/drawer for owners; display pending update notice via notifications, not inline form.
   - Admin: list pending update requests with field diffs, approve/reject UI, block/unblock toggle.
## Consequences

- Live businesses remain operational while edits await admin approval.
- Admins gain a deterministic freeze switch via `blocked`.
- Additional storage/migration required; API and middleware must honor `blocked` and pending-update logic.

## Open Questions

- Which fields are allowed in pending updates (logo uploads? currency? address? all profile fields)? Proposed: same as existing profile update schema.
- Should multiple pending requests be allowed or enforced as single open request per business? Proposed: single open per business (replace/update existing pending request). Changes: Keep separate request
- How are logo uploads handled while pending (store object but only swap pointer on approval)? Proposed: store path in pending payload; keep existing logo until approval.
