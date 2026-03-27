# ADR-037: RBAC Scope + Business Invites

- Status: Accepted
- Date: 2026-03-27

## Context
- Business dashboard currently assumes a user can see all of their businesses (owner-only model).
- We need scoped access so invited users only see businesses they are assigned to.
- Invitation flow is required to let owners add team members to a business.
- Layer 8 UI is paused until RBAC scope is defined.

## Decision (Accepted)
1) **Org + Business Structure**
   - When an owner creates their first business, a unique **Org** is created.
   - All businesses created by that owner belong to the same Org.
   - Users can belong to **only one Org** at a time.
   - Managers/staff are invited to the Org; business access is granted when they are added to specific businesses.
   - Org/business access changes trigger notifications to the user.
2) **Scoped Roles**
   - Keep global roles: `admin`, `business`, `customer`.
   - Add business-scoped roles for business users, e.g. `owner`, `manager`, `staff` (exact set TBD).

3) **Access Model**
   - A business user can be linked to one or more businesses with a scoped role.
   - Dashboard only shows businesses where the user has membership.
   - Owners retain full access; non-owners have restricted actions per scope.

4) **Invite Flow**
   - Business owners (and optionally managers) can invite users by email with a scoped role.
   - Invites can be accepted by existing users or via registration.
   - Invites may expire (duration TBD).

5) **Data Model (Proposed)**
   - `orgs` table: `id`, `owner_user_id`, `name`, `created_at`.
   - `org_memberships` table: `org_id`, `user_id`, `role`, `created_at`.
   - `org_invites` table: `org_id`, `email`, `role`, `token`, `expires_at`, `created_at`, `accepted_at`.
   - `business_memberships` table: `business_id`, `user_id`, `role`, `created_at`.
   - `business_invites` table: `business_id`, `email`, `role`, `token`, `expires_at`, `created_at`, `accepted_at`.

6) **RBAC Enforcement**
   - API middleware should resolve “active business” only from memberships.
   - Non-members cannot access business routes even if they are a `business` role.
   - Sensitive actions (e.g. business profile edits, invite creation, archive/restore) require `owner` role.

7) **UI Impact**
   - Dashboard business list is filtered by memberships.
   - Non-owner actions are hidden/disabled based on scoped role.

## Consequences
- Requires schema changes and new auth/membership middleware.
- Existing business users must be backfilled as `owner` members for their businesses.
- Invitation flow introduces token lifecycle and email delivery strategy.

## Questions & Answers

### Questions for User
- Q1: What scoped roles do you want (owner/manager/staff or different set)?
- Q2: Who can invite — owners only, or managers too?
- Q3: How do invites get accepted (magic link, login/register, code)?
- Q4: Do invites expire? If yes, after how long?
- Q5: When a user belongs to multiple businesses, do they select an active business or see a list?
- Q6: Should non-owners be blocked from creating new businesses?
- Q7: Do we need an audit log of invites/role changes now, or defer?
- Q8: Should invite accept/decline trigger notifications to the owner?

### Answers (to be filled by user)
- A1: owner, manager, staff
- A2: owners and managers
- A3: Org invites require existing user email; UI checks DB and disables invite if user does not exist. Existing users must accept via an in-app button; notification deep-links to a **static sample org preview page** (no real org data) with blurred content and Accept/Decline actions.
- A4: It will never expire cause it is used immediately after its creations
- A5: Org model — owner creates a unique org on first business creation; users can belong to only one org; managers/staff are invited to org and then granted business access; users can leave org via a “leave org” action.
- A6: Yes
- A7: We do not need audit logs for this
- A8: Yes to the owner and manager; user notifications are in-app only.

### Role Permissions (Confirmed)
- Owner: create business, edit business, create table, add managers/staff, archive, edit menu, change order status.
- Manager: create table, add staff, edit menu, change order status.
- Staff: change order status.
- Leave org: manager/staff only (owner cannot leave).
