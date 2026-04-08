# ADR-046: API Gateway Layer

**Date:** 2026-04-08  
**Status:** Accepted

## Context
We want a forward-compatible way to introduce load balancing, rate limiting, and reverse proxying in front of the API and web services. Today, requests hit `apps/api` and `apps/web` directly. We need a minimal, low-risk foundation that enables future edge controls without entangling application code.

## Decision
Introduce an API Gateway layer as **infrastructure**, not application code. The gateway will sit in front of `apps/api` (and optionally `apps/web`) and will be configured to:
- Route `/api/*` to the API service.
- Route all other traffic to the web service.
- Be the future home for rate limiting, request logging, and load balancing rules.
- Inject an **internal API key** header on API-bound requests; the API will reject requests missing or invalid header. This key is shared only between gateway/web services and is **never exposed to the browser**.

The gateway should be initially minimal (routing-only), with rate limiting and LB features added later.

### Recommended Initial Policy
- Gateway fronts both web and API (single public origin).
- Internal API key required **only for non-public routes**.
- API service should not be exposed publicly in production.

## Consequences
- Adds a new infrastructure component (dev + prod), but keeps app services clean.
- Centralizes cross-cutting concerns at the edge.
- Enables gradual adoption of rate limiting and load balancing without code changes.
- Requires secure storage and rotation of the internal API key; browser clients must never receive this secret.
- Requires agreement on gateway technology and deployment integration.

## Options Considered
1. **No gateway now**: keep direct access to API/web  
   - Pros: zero change  
   - Cons: delays edge controls, harder to adopt later without disruption
2. **Gateway as infrastructure (preferred)**  
   - Pros: clean separation, scalable, future‑proof  
   - Cons: adds component + config
3. **Gateway embedded in API app**  
   - Pros: fewer moving parts  
   - Cons: couples infrastructure to app, harder to scale/secure

## Questions & Answers

### Questions for User
- Q1: Which gateway do you prefer for **dev** and initial rollout: Nginx or Traefik?
- Q2: Should the gateway front **both** API and web, or **API only**?
- Q3: Do you want **rate limiting** enabled in the first iteration, or only routing?
- Q4: Should the internal API key be required for **all** API routes or only **non-public** routes?

### Answers (to be filled by user)
- A1: Nginx
- A2: both
- A3: right now just configure the api gateway 
- A4: only non-public routes
