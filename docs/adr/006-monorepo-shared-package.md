# ADR-006: pnpm Monorepo with Shared Package

## Context

The authoritative server model (ADR-001) requires that client and server use identical physics, collision, and game logic code. If the client predicts movement using slightly different math than the server, players see rubber-banding as the server constantly corrects the client's prediction.

Options considered:
- **Copy-paste shared code:** Simple, but inevitably drifts. One side gets updated, the other doesn't. Bugs are fixed in one place and persist in the other.
- **Separate npm package:** Strong boundaries, but publishing/versioning overhead for a small team. Every shared change requires a publish-install-update cycle.
- **Monorepo with workspace package:** Single repository, shared code is a workspace package imported by both client and server. Changes to shared code are immediately available to both consumers.

## Decision

We use a pnpm monorepo with three workspace packages:

- `/client` -- Phaser.js game client (depends on `@shared/game`)
- `/server` -- Node.js authoritative server (depends on `@shared/game`)
- `/shared` -- Types, constants, physics/math utilities (no runtime dependencies)

The shared package is imported as `@shared/game` via pnpm workspace aliases. It contains:
- TypeScript types for network messages (discriminated unions)
- Game constants (speeds, damage values, timers) as frozen objects
- Physics functions (movement, collision detection, stamina)
- Map data types and validation

The shared package has no runtime dependencies -- it exports only pure functions and types. This ensures it can be used by both the Vite-bundled client and the Node.js server without dependency conflicts.

## Consequences

**Positive:**
- Single source of truth for all shared logic: change it once, both client and server update
- TypeScript compiler enforces type compatibility across packages at build time
- No publish/version cycle: `pnpm install` links workspace packages locally
- Refactoring shared code is safe: the compiler catches all call sites in both consumer packages
- CI runs typecheck across the entire monorepo, catching cross-package type errors

**Negative:**
- Build ordering matters: shared must build before client and server (handled by TypeScript project references)
- pnpm workspace configuration adds some initial complexity
- All three packages share a single repository, which can make git history noisier
- Developers must be careful not to add runtime dependencies to shared (enforced by code review)
- IDE performance can be slightly slower with TypeScript project references across packages
