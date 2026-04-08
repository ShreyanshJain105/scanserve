---
Date: 2026-04-09
Status: Accepted
---

# ADR-047 — Order Status Actors Store User Identity

## Context
Order status transitions currently persist `status_actors` as a JSON map of status keys to a label string (name/email). This is used for accountability in the business order workflow UI, but it does not preserve a stable user identity (user id). We want to store both the `userId` and `email` together per status.

## Decision
Keep the existing `orders.status_actors` JSONB column, but change the shape to store an object per status:

```json
{
  "confirmedBy": { "userId": "...", "email": "..." },
  "preparingBy": { "userId": "...", "email": "..." }
}
```

Updates will write both `userId` and `email` from the authenticated business user when a status transition occurs. API responses and UI rendering will read from this object shape.

## Consequences
- No schema migration required (JSON shape change only).
- API serialization and UI display logic must be updated to handle the new object shape.
- Tests should cover the new shape and ensure existing UI labels continue to render correctly.
- Backward compatibility for existing string values should be handled gracefully (fallbacks when encountering legacy string labels).

## Questions & Answers

### Questions for User
- No open questions at this time.

### Answers (to be filled by user)
- N/A
