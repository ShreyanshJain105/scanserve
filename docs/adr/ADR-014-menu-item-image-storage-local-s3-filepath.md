# ADR-014: Menu Item Image Storage with Local S3 and DB File Path

**Date:** 2026-03-20  
**Status:** Accepted

## Context
ADR-012 introduced `Upload` and `Generate AI` image actions in the dashboard as UI entry points only.
The backend currently does not persist image assets.

Current requirement:
- use a local S3-compatible setup for storing uploaded/generated menu item images,
- persist the image file path in the database.

## Decision
1. Storage backend: local S3-compatible object storage (MinIO in docker-compose)
- Add a MinIO service to local runtime.
- Use one bucket for menu assets (for example `menu-images`).
- Keep storage access behind an API service layer in `apps/api`.

2. Data model: persist storage path in DB only
- Extend `MenuItem` with `imagePath` (nullable, string) mapped to `image_path`.
- Do not persist image URLs.
- On upload/generation success, write `imagePath` (authoritative storage key).

3. API contract updates
- Add business-protected endpoint to upload item images (multipart/form-data) and set `imagePath` for a target item.
- Add business-protected endpoint to generate AI image and set `imagePath` for a target item.
- API may return a resolved image URL for rendering, but only `imagePath` is persisted.

4. Key format and tenancy safety
- Object key pattern: `business/{businessId}/menu-items/{itemId}/{timestamp}-{safeFilename}`.
- Validate ownership so a business can only update its own menu items.
- Restrict mime types and size with explicit validation errors suitable for toast rendering.

5. Reliability and fallback
- If MinIO/S3 is unavailable, fail upload/generation with stable error codes and do not partially update DB.
- Preserve existing menu item flows when image operations are not used.

## Consequences
- Pros:
  - Enables real persisted image assets in local development.
  - Keeps DB-stored path provider-agnostic for future S3 migration.
  - Maintains backward compatibility with existing `imageUrl` clients.
- Cons:
  - Adds infra/dependency complexity (MinIO + env config).
  - Requires migration and shared-type/API response updates.

## Alternatives Considered
- Local filesystem storage only: rejected because it diverges from S3 production target and complicates migration.
- Persist only `imageUrl` and not path: rejected; weaker control over storage/provider transitions.

## Acceptance Criteria
1. Local docker runtime includes working MinIO storage and API connectivity.
2. Upload endpoint stores object in MinIO and persists `imagePath` in DB for menu item.
3. AI image-generation endpoint stores generated image in MinIO and persists `imagePath` in DB.
4. Menu item fetch responses include a usable URL for rendering while keeping `imagePath` persisted.
5. API + web tests cover successful image attach and storage/validation failure paths.
