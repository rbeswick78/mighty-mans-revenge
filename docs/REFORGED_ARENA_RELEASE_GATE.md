# Reforged Arena Release Gate

Batch 39 is a non-deployment release review of the complete Batch 2-38
Reforged Arena contract. Passing this gate does not enable a capability,
change a default, deploy either application, restart production, or authorize
Battle Royale work. Production remains on the separately approved Batch 33
commit until the user reviews this packet and explicitly approves a later
server-first rollout.

## Selected verification tier

Selected on 2026-07-17 before any Batch 39 repository change: **complete
milestone matrix**. This is the broadest roadmap tier because Batch 39 is the
Reforged Arena release gate and must disprove regressions across navigation,
network authority, multi-client lifecycle, world/camera/input, six authored
arenas, atomic presentation, compatibility fallback, and performance together.

The gate includes all of the following:

1. strict `standard-40x24`, compatible old-schema, and stable-order map
   validation for all six successors and all twelve documents;
2. deterministic asset, runtime-import, atlas, and non-runtime provenance
   validation for all six production sets, including byte-identical rebuilds;
3. the complete unit/integration inventory, typecheck, lint, affected and full
   production builds, formatting checks, `git diff --check`, intended-diff
   review, and protected-byte review;
4. the deterministic 624-product and 48 maximum-participant regulation balance
   evidence, plus server tick/snapshot and client frame/resource-quality probes;
5. one complete desktop-Chromium, desktop-Firefox, and mobile-landscape browser
   inventory with all capabilities at their default false values;
6. one complete three-project inventory with `newShell`, `schedules`,
   `largeWorlds`, and `modernArt` coherently literal true while `battleRoyale`
   remains literal false;
7. targeted real multi-client Duel, Rumble, Crew, party/readiness/bot-fill,
   Results/rematch, disconnect/recovery, schedule-boundary, maximum legal
   participant, all-input, all-six-arena, and atomic-fallback journeys; and
8. inspected Boot-through-Results desktop Chromium and mobile-landscape visual
   evidence. Under RFG-003, Chromium is the live/compositor pixel reference;
   Firefox and mobile WebKit retain staged object/input assertions plus direct
   non-black Phaser renderer evidence where their live/compositor path is
   unreliable.

No assertion, validator, authority boundary, fallback, visual-coherence rule,
or performance budget may be weakened to pass this gate. A proven blocker must
record its owner, severity, reproduction, and disposition. Only a narrow fix
inside an already-completed Reforged Arena contract may remain in Batch 39;
larger work stops the release review for a separately scoped follow-up.

## Immutable release constraints

- `newShell`, `schedules`, `largeWorlds`, and `modernArt` remain strict
  server-owned opt-ins and default false.
- `battleRoyale` remains false, unimplemented for this review, and out of scope.
- The complete legacy Lobby, Draft, Character Select, challenge, gameplay,
  Results, rematch, recovery, and old-server journey remains the rollback.
- No production deploy, restart, flag exposure, live-site smoke, or Batch 40
  successor may occur in Batch 39.
- Human tester/release approval is required after the automated and inspected
  evidence below is complete.

## Evidence status

The complete automated and inspected gate is green. Human tester/release
approval is still required, so the status is **AUTOMATED GATE PASSED / ROLLOUT
NOT AUTHORIZED**. No deployment, production restart, capability exposure, live
smoke, or Battle Royale work occurred.

## Automated evidence summary

The complete milestone matrix passed:

- asset, atlas, import, and provenance validation: 30/30;
- compatible validation: all twelve map documents in stable order;
- strict `standard-40x24` validation: all six successors;
- validator CLI suite: 3/3;
- deterministic balance inventory: 624 legal products and 48 maximum-
  participant regulations, all reaching Results without overtime;
- full Vitest inventory: 143 files and 1,634 tests;
- typecheck, lint, shared/server/client builds, and the full production build;
- server baseline: configured 20Hz, 50ms budget, 15.978Hz observed live rate,
  0.011/0.018/0.053/0.610ms synthetic mean/p95/p99/max, and
  2,481/3,762-byte snapshots;
- complete default-false three-project inventory: 144 passes and 110
  intentional project/capability skips. One cold auxiliary Chromium client
  exceeded an inherited 5-second service-readiness poll; after restoring the
  owned 30-second readiness budget, the exact real three-client Rumble Draft
  Rally authority journey passed in 30.7 seconds;
- complete coherent-enabled inventory: 181 passes and 74 intentional
  project/capability skips with `newShell`, `schedules`, `largeWorlds`, and
  `modernArt` literal true and `battleRoyale` literal false;
- focused post-correction enabled evidence: 22 passes and 2 intentional
  project skips across live Chromium and staged Firefox/mobile journeys; and
- exact RFG-003 direct-renderer evidence: Firefox and mobile passed, with the
  Chromium-only project intentionally skipped.

The enabled client baselines retained a 1280x720 logical viewport, 1920x1152
world, 15 dynamic chunks, and full desktop quality. The staged mobile baseline
entered reduced quality as designed. Headless Chromium software-rendered frame
rates remain diagnostic rather than hardware FPS; server tick/snapshot budgets
and the client quality-transition assertions did not regress.

The inventory covers five-tab navigation, every retained activity, explicit
Duel/Rumble/Crew setup, schedules, parties, readiness, explicit bot fill,
persistent fighters, Results/rematches, disconnect/recovery, every standard
mode, all six successors, responsive viewport/camera/coordinates/HUD/minimap,
all owned input families, maximum legal participant products, server-owned
selection and authority, strict/partial/malformed/old-server capability
handling, and atomic restoration of the complete legacy journey.

Visual review found readable, non-black Chromium gameplay, shell,
mobile-landscape-sized shell, Challenges, and Results captures with one modern
owner. Native Firefox/mobile compositor captures remain black on the known
unreliable path; RFG-003 therefore remains satisfied by staged object/input
assertions plus the passing direct-renderer non-black proofs, with Chromium as
the live/compositor pixel reference.

## Blocker disposition

**Gate status: AUTOMATED GATE PASSED / HUMAN APPROVAL REQUIRED / ROLLOUT NOT
AUTHORIZED.**

- **ID:** RFG-004
- **Owner:** client `GameScene` large-world fallback and minimap lifecycle
- **Severity:** resolved release blocker
- **Root cause:** Phaser reused the same `GameScene` instance across successor
  and literal-false restarts. `init()` cleared the viewport and render-plan
  owners but retained the prior `minimapRenderer` reference.
- **Correction:** `GameScene.init()` now clears `minimapRenderer` with the
  other per-run presentation owners. No map, asset, wire contract, capability,
  default, gameplay mechanic, or performance budget changed.
- **Proof:** the strict all-six-arena coherent journey now restores legacy
  mode, 960x576 bounds, no successor resources, and `minimap: null`; the
  complete enabled inventory and the exact focused reproduction pass without
  weakening the assertion.

RFG-001 and RFG-002 remain closed historical proofs. RFG-003 remains
gate-dispositioned under the paired Chromium live/compositor plus staged
Firefox/mobile direct-renderer rule. No open Reforged Arena release blocker
remains in automated evidence.

## Human walkthrough and rollout checklist

The automated gate is ready for the human release walkthrough. Approval must confirm:

1. five-tab navigation and every preserved activity with pointer, keyboard, standard gamepad, and touch where owned;
2. explicit Duel, Rumble, and Crew setup, real multi-client party/readiness/bot-fill, schedule boundaries, fighter persistence, Results/rematch, and recovery;
3. all eight modes and all six arenas, including maximum legal participant shapes;
4. readable Boot-through-Results desktop and mobile-landscape presentation with no mixed owner or black required scene;
5. literal false, absent, partial, malformed, old-server, and reconnect handshakes returning atomically to the complete legacy journey.

Only after that human sign-off may a separately authorized rollout deploy server support first with every flag false, deploy the capability-aware client, verify health, coherently enable `newShell`, `schedules`, `largeWorlds`, and `modernArt` while keeping `battleRoyale=false`, and smoke production. Rollback must set the server flags false first. None of those rollout steps occurred in Batch 39.
