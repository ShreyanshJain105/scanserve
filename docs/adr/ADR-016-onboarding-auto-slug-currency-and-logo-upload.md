# ADR-016: Onboarding Auto-Slug, Currency Input, and Drag-Drop Logo Upload

**Date:** 2026-03-20  
**Status:** Accepted

## Context
Current onboarding requires manual slug entry and accepts `logoUrl` text input.
Requested changes:
1. slug must be auto-generated from business name and made non-editable,
2. onboarding must collect business currency,
3. `logoUrl` text input should be replaced by drag-drop image upload.

## Decision
1. Slug generation policy (server-authoritative)
- Remove manual slug requirement from onboarding payloads.
- API generates slug from business name using deterministic normalization:
  - lowercase,
  - alphanumeric + hyphen,
  - de-dupe hyphens,
  - length cap 64.
- If slug exists, append suffix (`-2`, `-3`, ...`) until unique.
- Slug is immutable after creation (update route ignores/rejects slug edits).
- UI displays slug read-only and marks editing disabled.

2. Currency field
- Add `currencyCode` to `Business` model (`currency_code`, varchar-like text).
- Onboarding create requires currency code (e.g. `USD`, `INR`, `EUR`).
- Onboarding update allows updating currency.
- Normalize to uppercase ISO-like 3-letter code in API validation.

3. Logo upload (replace logo URL text input)
- Add business-logo upload endpoint: `POST /api/business/profile/logo` (multipart image).
- Store uploaded logo in S3-compatible storage and persist resulting URL/path into business profile field.
- On onboarding page:
  - replace logo URL input with drag-drop upload area,
  - upload action returns URL/path and binds to profile form,
  - keep preview/removal controls.

4. Backward compatibility
- Existing `logoUrl` DB field remains source for rendered profile logo.
- Existing profiles get `currencyCode` default migration value (`USD`) and can update in onboarding.

5. Testing
- API tests for slug generation uniqueness, slug immutability, currency validation/normalization, and logo upload route.
- Web tests for onboarding read-only slug display, currency input, and drag-drop upload interaction.

## Consequences
- Pros:
  - Removes user friction and slug collisions.
  - Adds explicit business currency needed for pricing/payments display later.
  - Improves onboarding UX with direct logo upload.
- Cons:
  - Adds API surface and upload/storage complexity for onboarding.
  - Requires migration and test updates across API/web.

## Alternatives Considered
- Client-side slug generation only: rejected; uniqueness/race requires server authority.
- Keep logo URL field with optional upload: rejected for UX scope requested.

## Acceptance Criteria
1. User cannot manually edit slug in onboarding; API always enforces auto-generated immutable slug.
2. Creating business profile auto-generates unique slug from business name.
3. Currency is required on create and validated/normalized in API.
4. Onboarding uses drag-drop logo upload and persists logo in profile.
5. API and web tests cover new onboarding behavior.
