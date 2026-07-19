# Battle Royale Release Gate

Batch 51 is the complete local automated review of the Batch 40–50 Battle
Royale contract. Passing the automated portion does not expose a capability,
change a default, deploy either application, restart production, run a live
smoke, or substitute for human release approval. Production remains on the
separately approved Batch 33 commit
`f39eb34131f8827f85432aafcc6d6c18a2d0ac51`.

## Selected verification tier

Selected on 2026-07-18 before any Batch 51 repository change: **complete Battle
Royale milestone matrix**. This is the broadest roadmap tier because Batch 51
must disprove regressions across all Battle Royale systems, every preserved
standard path, authority and compatibility boundaries, the authored arena,
eight-entrant performance, and all supported browser projects together.

The automated gate includes:

1. strict compatible and Battle Royale map validation, deterministic map CLI
   tests, asset/runtime-import/provenance validation, and byte-stable generated
   asset evidence;
2. complete deterministic server coverage for one-human-plus-bots,
   partial-human, full-eight-human, one-life lifecycle, loot/rarity/inventory,
   circles, bots, spectator, Results, records, disconnect/recovery, and old-peer
   compatibility;
3. the complete unit/integration inventory, typecheck, lint, server/shared and
   production client builds, formatting, `git diff --check`, intended-diff, and
   production-configuration audits;
4. the deterministic 624-product standard balance matrix, exact standard
   snapshot baseline, and eight-fighter tick/network/memory/cleanup profile;
5. the complete desktop Chromium, desktop Firefox, and mobile-landscape
   Playwright inventory with production-equivalent capabilities default false;
6. a coherent test-only capability inventory, isolated from production; and
7. inspected Chromium visual evidence plus established RFG-003 object/state and
   direct-renderer evidence for native headless paths with unreliable pixels.

No assertion, validator, authority boundary, compatibility rule, visual rule,
or performance ceiling may be weakened. A proven blocker must be reproduced,
recorded, and fixed only when it stays inside the completed Batch 40–50
contract; a larger correction stops the gate for explicit scope review.

## Immutable release constraints

- `newShell`, `schedules`, `largeWorlds`, `modernArt`, and `battleRoyale` remain
  strict server-owned opt-ins, default false, and unexposed.
- The complete standard and legacy journeys remain the rollback contract.
- No capability exposure, deployment, production restart, production-health
  probe, or live-site/live-match smoke is authorized in this batch.
- Human multi-client, real-device, and 6–8 minute playtest sign-off is deferred
  as late as possible and remains required before any later rollout approval.

## Evidence status

The complete local automated gate **PASSED on 2026-07-18**. It establishes a
release candidate boundary; it does not constitute production approval.

### Deterministic content and contract evidence

- All 13 map documents passed compatible validation. Shatterlands passed the
  strict `battle-royale-56x34` profile, including dimensions, connectivity,
  spawn safety, navigability, four-region identity, containers, minimap, and
  tactical-map metadata. All four map-authoring CLI tests passed.
- All six Reforged source manifests passed validation. The asset pipeline's 30
  tests passed, including runtime imports, provenance, deterministic output,
  and stale-output rejection.
- The complete unit/integration inventory passed 550 suites and 1,764 tests.
  This includes the legal Battle Royale queue, lifecycle, elimination,
  placement, loot, rarity, inventory, safe-zone, bot, spectator, Results,
  records, recovery, and compatibility shapes for one through eight entrants.
- Typecheck, ESLint, shared/server/client production builds, the unchanged
  624-product standard balance matrix, formatting, intended-diff review, and
  whitespace checks passed. The inherited Vite large-chunk advisory remains a
  warning rather than a new gate failure.

### Authority and performance evidence

The ordinary server baseline retained configured and rolling 20 Hz, the 50 ms
authority budget, 0.068 ms average live processing, and exact
2,481/3,762-byte two/four-player active snapshots. Synthetic
mean/p95/p99/max work was 0.014/0.029/0.078/0.789 ms. One reported effective
rate window was 15.965 Hz after a host scheduler drift reset; processing stayed
inside budget and did not prove a simulation defect.

The repeated four-human/four-bot profile used 300 warmup plus 3,000 measured
samples and reported:

| Evidence                             |                                 Result | Fail-closed ceiling |
| ------------------------------------ | -------------------------------------: | ------------------: |
| Tick mean / p95 / p99 / max          |       0.274 / 0.482 / 0.907 / 4.473 ms |               50 ms |
| Representative / stressed snapshot   |                  13,551 / 17,892 bytes |        65,536 bytes |
| One client / eight-recipient traffic |                357,840 / 2,862,720 B/s |  10 MiB/s aggregate |
| Human fanout                         | 8 recipients, 1 encoding, 8 deliveries |  At most 1 encoding |
| Settled heap growth                  |                          404,720 bytes |              32 MiB |
| Cleanup                              |                       0 active matches |    0 active matches |

No client-authored lifecycle, hit, loot, zone, placement, or persistence state
entered these measurements. Cosmetic quality reduction remained isolated from
decisive gameplay objects.

### Browser and visual evidence

The complete default-false inventory exercised 279 cases across desktop
Chromium, desktop Firefox, and mobile landscape. Three stale exact legacy
fixture expectations were corrected for Batch 44's hidden, noninteractive
reload control. The corrected inventory passed 152 tests with 126 intentional
capability/project skips; one isolated long-run Firefox keyboard-pointer flake
passed its immediate clean focused rerun.

The complete coherent dormant-capability inventory also exercised 279 cases,
with all five opt-ins set only in isolated local test processes. After the
transition-safe touch fixture correction, the final inventory passed 203 tests
with 75 intentional skips. One long-run Chromium synthetic reload key pulse was
missed after the same test had already proved authoritative inventory, loot,
comparison UI, and pointer fire; Firefox gamepad and mobile touch variants
passed in the complete run, and the exact Chromium journey immediately passed
1/1 on a fresh isolated server. Party bot fill and the corrected touch probe
also passed all three projects. No runtime assertion was weakened and no
product defect was proven.

Chromium desktop and responsive mobile-sized captures supplied inspected pixel
evidence. Native headless mobile WebKit black compositor output remains covered
by RFG-003's established paired object/input and direct-renderer evidence; it
was not misreported as a visual pass.

### Compatibility and configuration audit

- Shared capability normalization still defaults `newShell`, `schedules`,
  `largeWorlds`, `modernArt`, and `battleRoyale` to literal `false`.
- Server flags still require an exact `'true'` environment value. No production
  environment or deployment file changed.
- Standard Duel/Rumble/Crew/Practice, all eight modes, rematches, overtime,
  stats, persistence, old-peer fallback, input, presentation, and exact
  standard snapshot baselines remain unchanged.
- Batch 51 changes only documentation and browser fixtures. The bug ledger is
  unchanged because no new product defect was proven; RFG-003 remains the
  active visual-evidence disposition.

## Held release actions

The following requirements remain **HELD — NOT AUTHORIZED**:

1. human 6–8 minute Battle Royale playtests;
2. real-device and real multi-client sign-off;
3. capability exposure or default changes;
4. server/client production deployment or restart;
5. production-health probes; and
6. live-site or live-match smoke.

Batch 52 cannot begin under the Batch 42–51 development authorization.
Production remains on Batch 33 commit
`f39eb34131f8827f85432aafcc6d6c18a2d0ac51`.
