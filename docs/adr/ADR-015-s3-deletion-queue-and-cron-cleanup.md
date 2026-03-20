# ADR-015: S3 Deletion Queue and Cron Cleanup for Menu Item Images

**Date:** 2026-03-20  
**Status:** Accepted

## Context
Menu item images are stored in S3-compatible storage and the DB persists `menu_items.image_path`.
When a menu item is deleted (or image path is replaced), object cleanup is currently not guaranteed immediately.

Requirement:
- keep a durable record of deleted image paths,
- run periodic cleanup that deletes those S3 objects.

## Decision
1. Add durable cleanup queue table
- Add Prisma model `DeletedAssetCleanup` (append-only queue records).
- Columns (initial scope):
  - `id`,
  - `assetType` (e.g. `menu_item_image`),
  - `entityId` (menu item id or related entity id),
  - `s3Path`,
  - `status` (`pending|processing|done|failed`),
  - `attemptCount`,
  - `nextAttemptAt`,
  - `lastError`,
  - `createdAt`, `updatedAt`, `processedAt`.

2. Enqueue on delete/replace
- On menu-item delete: if `imagePath` exists, insert a `pending` cleanup record before deleting DB row.
- On image replacement (upload/generate over existing path): enqueue previous path for cleanup.

3. Cron worker in API process
- Add a scheduled cleanup worker in API startup (cron expression via env).
- Default schedule: every 10 minutes.
- Each run:
  - claim due `pending/failed` records up to batch size,
  - delete object from S3,
  - mark `done` on success,
  - on failure: increment attempts, set `failed`, and compute backoff via `nextAttemptAt`.

4. Retry and safety policy
- Missing-object deletion should be treated as success (idempotent cleanup).
- Max retry attempts and batch size controlled by env.
- Worker can be disabled via env flag.

5. Observability
- Emit structured logs for job start/end, counts, and per-record failures.
- Add admin-only/read-only endpoint later if queue inspection is needed (not in this ADR scope).

## Consequences
- Pros:
  - Prevents orphaned S3 files from accumulating.
  - Durable DB queue survives restarts and temporary storage outages.
  - Retry/backoff avoids dropping cleanup work.
- Cons:
  - Adds table + worker complexity.
  - Multi-instance deployments require careful record claiming to avoid duplicate processing.

## Multi-instance handling (MVP)
- Use atomic SQL claim (`FOR UPDATE SKIP LOCKED` style via Prisma raw query) so parallel API instances do not process the same queue records.

## Alternatives Considered
- Immediate best-effort delete inline during menu item delete only: rejected (fails on transient outages, no durability).
- External job system (Bull/Redis/Temporal): rejected for current scope; too heavy for immediate need.

## Acceptance Criteria
1. Deleting a menu item with `imagePath` creates a cleanup queue row.
2. Replacing a menu item image enqueues old `imagePath` for cleanup.
3. Scheduled worker deletes queued S3 objects and updates status transitions correctly.
4. Failed deletions retry with backoff until max attempts.
5. API tests cover enqueue + worker success/failure paths.
