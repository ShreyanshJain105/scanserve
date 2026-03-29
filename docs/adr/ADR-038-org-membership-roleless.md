# ADR-038: Roleless Org Membership (Business Roles Only)

- Status: Accepted
- Date: 2026-03-29

## Context
- Current RBAC uses org roles (`owner`, `manager`, `staff`) plus business-scoped roles.
- We removed role selection from org invites and defaulted org role to `staff`, which blocks manager-only org actions (invite/access) even when a user has manager privileges at the business level.
- The product direction is to simplify: org membership should identify which org a user belongs to, and **all permissions should be derived from business-level roles**.

## Decision (Accepted)
1) **Org membership becomes roleless**
   - `org_memberships` no longer carry a role; they only bind `userId` to `orgId`.
2) **Business roles are the sole permission source**
   - `owner`, `manager`, `staff` roles exist only in `business_memberships`.
3) **Org actions authorized by business roles**
   - Org-level invite is permitted if the user is **org owner** or has `owner`/`manager` role in **any business within the org**.
   - Business access management is permitted only if the user is `owner`/`manager` of the **selected business**.

## Consequences
- Requires Prisma schema change (remove `OrgRole` usage + `role` column in `org_memberships`).
- Requires API changes to membership checks (`requireOrgRole` replaced with business-role-based org authorization).
- Requires data migration: existing org roles are dropped; access control pivots to business memberships.
- Requires UI updates: org role labels removed; permission messaging updated to “business role” wording.

## Questions & Answers

### Questions for User
- Q1: Should a user who is manager in **any** business within an org be allowed to invite/manage access for the org, or only owners/managers of the **selected business**?
- Q2: When removing org roles, do we need a safeguard to prevent a manager of a single business from managing access to **other businesses** in the org?
- Q3: Do we want to keep a separate “org owner” concept at all, or should ownership be inferred from business ownership only?

### Answers (to be filled by user)
- A1: Managers can invite org-wide; owners can also invite.
- A2: A manager can only perform access operations for their own business, not org-wide.
- A3: Keep an org owner concept that identifies who owns the org.

### Agent Behavior
- After approval, update schema, API guards, and UI labels to be business-role-driven.
