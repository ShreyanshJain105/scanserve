# ADR-031: Admin Notification Inbox

- Status: Accepted
- Date: 2026-03-24

## Context
- Notifications are now split into `notification_events` (history) and `notification_inbox` (unread).
- Business owners can see their notifications, but admins need an inbox too (new business submissions and update requests).

## Decision
- Emit admin notifications for:
  - New business submissions (`BUSINESS_SUBMITTED`)
  - New business update requests (`BUSINESS_UPDATE_SUBMITTED`)
- Add admin endpoints:
  - `GET /api/admin/notifications?scope=unread|all`
  - `POST /api/admin/notifications/:inboxId/read`
  - `POST /api/admin/notifications/read-all`
- Reuse the same header bell UI for admin sessions.

## Consequences
- Admins get accurate, durable notifications without new tables.
- Slightly more writes on submission flows.
