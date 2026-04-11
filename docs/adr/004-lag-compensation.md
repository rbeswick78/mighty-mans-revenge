# ADR-004: Lag Compensation with Server-Side Rewind

## Context

Players connect from varying network conditions (typical RTT: 10-80ms for NY/NJ area). In a shooter, even small latency differences create unfair advantages: a player on a faster connection sees and reacts to opponents sooner. Without compensation, a player might aim perfectly on their screen but miss on the server because the opponent has already moved.

The core tension: the server is authoritative (ADR-001), but the client renders other players slightly in the past due to entity interpolation. When a player shoots, they're aiming at where the opponent *was*, not where they *are* on the server right now.

## Decision

We implement four complementary latency compensation techniques, following the Valve Source Engine networking model:

1. **Client-Side Prediction:** The client applies its own inputs immediately using shared physics code, without waiting for server confirmation. This eliminates the feeling of input lag.

2. **Server Reconciliation:** When the server's authoritative state arrives, the client compares it against its predicted state. If the difference is small, it smoothly corrects. If large (e.g., collision the client missed), it snaps. Unacknowledged inputs are replayed on top of the server state.

3. **Entity Interpolation:** Other players are rendered by interpolating between the two most recent server states, intentionally one tick behind real-time. This ensures smooth movement even with packet loss. Brief extrapolation (capped at 200ms) handles gaps.

4. **Server-Side Rewind ("Favor the Shooter"):** When the server receives a shoot command, it rewinds other players' positions to the shooter's estimated render time (server time minus half RTT minus interpolation delay). Hit detection runs against this rewound state. If the shot hit on the shooter's screen, it hits on the server.

## Consequences

**Positive:**
- Shooting feels responsive and accurate on all connections up to ~100ms RTT
- Players with different latencies compete on roughly equal terms
- The "what you see is what you get" principle makes the game feel fair to shooters
- Industry-proven approach (used by Counter-Strike, Overwatch, Valorant)

**Negative:**
- Victims can occasionally be "shot around corners" -- they moved behind cover on their screen, but the shooter's rewound view still showed them exposed. This is an inherent tradeoff of favoring the shooter.
- The rewind buffer consumes memory (storing ~1 second of all player states at 20 ticks/sec)
- Rewind logic adds complexity to the server tick loop; must stay within the 50ms tick budget
- Debugging hit registration issues requires understanding the temporal offset between shooter and victim perspectives
