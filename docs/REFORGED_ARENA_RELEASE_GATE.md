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

Evidence results, exact commands, artifacts, blocker disposition, protected
byte findings, and the human walkthrough/rollout checklist are recorded here
as the gate runs. Until every required row is complete and reviewed, the gate
status is **BLOCKED / NOT AUTHORIZED FOR ROLLOUT**.

## Automated evidence summary

The non-browser matrix passed before the browser blocker stopped the gate:

- asset, atlas, import, and provenance validation: 30/30;
- compatible validation: all twelve map documents in stable order;
- strict `standard-40x24` validation: all six successors;
- validator CLI suite: 3/3;
- deterministic balance inventory: 624 legal products and 48 maximum-participant regulations, all reaching Results without overtime;
- full Vitest inventory: 143 files and 1,634 tests;
- typecheck, lint, shared/server/client builds, and the full production build;
- server baseline: configured 20Hz, 50ms budget, 15.978Hz observed live rate, 0.011/0.018/0.053/0.610ms synthetic mean/p95/p99/max, and 2,481/3,762-byte snapshots;
- coherent-enabled client baseline: Chromium live full quality over a 1920x1152 world, Firefox staged full quality, and mobile staged reduced quality.

The complete default-false three-project inventory produced 144 passes and 110 intentional project/capability skips. One mobile fixture timed out before its canvas existed; the exact case passed on immediate isolated rerun. Legacy Lobby, Draft, Character Select, activities, gameplay, Results, recovery, and input coverage therefore remain green with every capability false.

The coherent-enabled inventory first exposed release-harness assumptions that still targeted the retained legacy Lobby or injected partial handshakes. Batch 39 corrected only that evidence routing: legacy-only tests remain mandatory in the default-false matrix, enabled tests select `ReforgedShellScene`, large-world expectations use the 1280x720 logical gameplay surface, and the all-six-arena journey starts each coherent case from a clean shell. Focused reruns passed for shell intent submission, validated direct launch, match menu, Results input, modern UI, recovery, and owner-aware combat feedback.

## Blocker disposition

**Gate status: BLOCKED / ROLLOUT NOT AUTHORIZED.**

- **ID:** RFG-004
- **Owner:** client `GameScene` large-world fallback and minimap lifecycle
- **Severity:** release blocker
- **Reproduction:** run `gameplay-viewport.test.ts` with `CAPABILITY_NEW_SHELL=true`, `CAPABILITY_SCHEDULES=true`, `CAPABILITY_LARGE_WORLDS=true`, `CAPABILITY_MODERN_ART=true`, and `CAPABILITY_BATTLE_ROYALE=false`; exercise all six successor arenas, then inject the test's literal `largeWorlds:false` fallback for Wasteland Outpost.
- **Observed:** the viewport contract changes to `mode: legacy` and 960x576 bounds, but `getMinimapRenderState()` still exposes the prior 1920x1152 world, ten successor landmarks, and the large-world panel.
- **Expected:** the complete legacy owner has no large-world minimap or successor resources.
- **Disposition:** stop Batch 39 and request a separately scoped Reforged Arena fallback correction. Do not weaken the `minimap: null` assertion. After correction, rerun the focused reproduction, both complete browser inventories, visual inspection, and final static/protected-byte gates.

RFG-001 and RFG-002 remain closed historical proofs. RFG-003 remains gate-dispositioned under the paired Chromium live/compositor plus staged Firefox/mobile direct-renderer rule. No other product blocker was proven before RFG-004 stopped the matrix.

## Human walkthrough and rollout checklist

Human release walkthrough is deferred until RFG-004 is fixed and the complete automated matrix is green. The eventual approval pass must confirm:

1. five-tab navigation and every preserved activity with pointer, keyboard, standard gamepad, and touch where owned;
2. explicit Duel, Rumble, and Crew setup, real multi-client party/readiness/bot-fill, schedule boundaries, fighter persistence, Results/rematch, and recovery;
3. all eight modes and all six arenas, including maximum legal participant shapes;
4. readable Boot-through-Results desktop and mobile-landscape presentation with no mixed owner or black required scene;
5. literal false, absent, partial, malformed, old-server, and reconnect handshakes returning atomically to the complete legacy journey.

Only after that human sign-off may a separately authorized rollout deploy server support first with every flag false, deploy the capability-aware client, verify health, coherently enable `newShell`, `schedules`, `largeWorlds`, and `modernArt` while keeping `battleRoyale=false`, and smoke production. Rollback must set the server flags false first. None of those rollout steps occurred in Batch 39.
