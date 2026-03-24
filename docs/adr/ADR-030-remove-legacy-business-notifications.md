# ADR-030: Remove Legacy Business Notifications Table

- Status: Accepted
- Date: 2026-03-24

## Context
- ADR-029 introduced `notification_events` (history) and `notification_inbox` (unread).
- The legacy `business_notifications` table is now redundant and increases confusion.

## Decision
- Remove the legacy `BusinessNotification` Prisma model and related enum/relations.
- Standardize all notifications on `notification_events` + `notification_inbox`.

## Consequences
- Schema is simpler and consistent with ADR-029.
- Any legacy `business_notifications` data is discarded (acceptable due to full data wipe).
