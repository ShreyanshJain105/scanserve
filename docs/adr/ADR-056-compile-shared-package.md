# ADR-056: Compile `@scan2serve/shared` for Production Runtime

**Date:** 2026-04-12
**Status:** Accepted

## Context
`@scan2serve/shared` is currently consumed as TypeScript source. In production, the API container starts with `tsx` to execute TypeScript directly. This keeps dev dependencies in the runtime image and makes the prod footprint heavier. The new production image build tooling highlights this gap.

## Decision
Compile `@scan2serve/shared` to `dist/` and treat it as a normal JS package in production. Concretely:
- Add a build script in `packages/shared` to emit `dist/` (JS + d.ts).
- Point `packages/shared/package.json` `main` and `types` to `dist/` outputs.
- Update Dockerfiles so API/web images build `@scan2serve/shared` and run without `tsx` (API starts via `node dist/index.js`).
- Add a lightweight dev workflow note to keep `dist/` up to date when shared types/constants change.

## Consequences
- **Pros:** smaller/faster production images, no TS runtime in prod, clearer build/runtime split.
- **Cons:** shared package must be built for local dev changes to take effect; we’ll rely on `pnpm --filter @scan2serve/shared build` (or a watch script) when editing shared code.
- **Neutral:** no behavior changes; this is purely packaging/build pipeline.

## Alternatives Considered
- Keep `tsx` in production: rejected due to heavier images and unnecessary runtime complexity.
- Bundle shared into API build: rejected for now because it complicates build tooling without providing clear benefits over a compiled package.
