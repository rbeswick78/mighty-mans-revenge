# ADR-001: Authoritative Server Architecture

## Context

Mighty Man's Revenge is a competitive 1v1 (scaling to N-player) shooter played among friends. Fair gameplay is essential -- even among friends, the temptation to tamper with a client is real, and any perceived unfairness kills the fun. We need an architecture that prevents cheating and ensures all players see a consistent game state, even on varying network conditions.

Client-authoritative models (where each client owns its own state) are simpler but trivially exploitable: speed hacks, teleportation, and invincibility are all possible by modifying the client. Peer-to-peer models introduce trust issues and NAT traversal complexity.

## Decision

We use a fully authoritative server model. The server is the single source of truth for all game state. Clients are "dumb terminals" that send inputs and render the state the server tells them to render.

Key properties:
- Clients send raw inputs (movement direction, aim angle, shoot/reload commands) with sequence numbers
- The server processes all inputs, runs physics, detects hits, and broadcasts authoritative state snapshots at 20 ticks/second
- Clients predict locally for responsiveness but always reconcile against the server's authoritative state
- No game logic runs exclusively on the client -- all simulation code lives in the shared package and is used identically by both client and server

## Consequences

**Positive:**
- Cheat-proof by design: clients cannot forge kills, health, position, or any other state
- Single source of truth eliminates state desynchronization bugs
- Shared physics code in `/shared` guarantees client prediction matches server simulation
- Straightforward to add server-side logging, replays, and anti-abuse detection

**Negative:**
- Higher server complexity: the server must run a full physics simulation every tick
- All gameplay features must be implemented server-side, not just client-side
- Latency is always a factor: inputs must round-trip to the server before being confirmed, requiring client-side prediction and reconciliation to feel responsive
- Server becomes a single point of failure -- if it goes down, all matches end
