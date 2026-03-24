# ADR-032: Notification UX Polish + Blocked Banners

- Status: Accepted
- Date: 2026-03-24

## Context
- Notifications now support unread/all with mark‑read, but the list is utilitarian and doesn’t show diffs or history well.
- Blocked/pending/rejected banners are only shown on some owner pages; consistency is needed across dashboard surfaces.

## Decision (Proposed)
1) **Notification UI polish**
   - Add compact diff rendering for update approvals/rejections (show changed fields when payload exists).
   - Improve history view: group by business and show actor label when available.
2) **Blocked banners**
   - Add consistent banner component across owner pages (`/dashboard`, `/dashboard/onboarding`, `/dashboard/menu`, `/dashboard/tables`) with the same copy/visual style.

## Consequences
- Clearer admin decisions for owners and consistent blocked messaging.
- Small UI complexity increase but no API changes required.
