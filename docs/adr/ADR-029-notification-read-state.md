# ADR-029: Persistent Notification Read State with Inbox + History Tables

- Status: Accepted
- Date: 2026-03-24

## Context
- Current design stores notifications in a single table without durable read/unread state. The header badge and list rely on re-fetching the last 50 notifications, so read markers are ephemeral and badge counts can become stale.
- Requirements:
  - Track unread separately from history for each user.
  - Attribute actor (who performed the action) on each notification event.
  - Allow mark-as-read that moves items from unread to history while keeping an immutable audit trail.
  - Keep the system simple to query for badge counts and recent history.

## Decision (Proposed)
1) **Schema split**
   - `notification_events` (immutable history): `id`, `user_id` (target), `actor_user_id` (nullable), `business_id` (nullable), `type`, `message`, `payload JSONB`, `created_at`.
   - `notification_inbox` (unread queue): `id`, `user_id`, `event_id` (FK to `notification_events`), `created_at`.
   - Indexes: `(user_id, created_at)` on both tables; FK cascade on `event_id`.
2) **Write path**
   - Whenever server emits a notification for a target user, insert into `notification_events`, then insert into `notification_inbox` for that user. Actor ID captured where available.
3) **Read API**
   - `GET /api/business/notifications?scope=unread|all&limit=50&cursor=` (default `unread`).
   - Unread pulls from `notification_inbox` join events; `all` pulls directly from events.
4) **Mark read**
   - `POST /api/business/notifications/:inboxId/read` deletes that inbox row (event stays in history).
   - Optional bulk: `POST /api/business/notifications/read-all` deletes all inbox rows for the user.
5) **Frontend**
   - Badge shows unread count (`notification_inbox` count).
   - Panel defaults to unread with per-row “Mark as read” and a toggle to view history (`scope=all`).

## Consequences
- Clear, durable separation of unread vs. history; badge reflects true unread count.
- Mark-read is an O(1) delete; history remains immutable for audit.
- Slight write amplification (one extra insert) but simpler queries and no race-prone client state.
- Migration starts history fresh (no backfill of old notifications) unless explicitly added later.
