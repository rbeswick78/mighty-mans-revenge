# Replayability Roadmap — Multi-Session Build Plan

This document is the contract for a multi-session effort to make Mighty Man's
Revenge worth playing over and over. **Read this whole file at the start of
every session.** It contains the plan, locked design decisions, the asset
manifest, the end-of-session ritual, and a running session log.

- **Status:** Sessions 1–6 complete (weapons, awards + rivalry stats, mutator expansion, maps + rotation, KOTH + overtime, characters + stat identities). Next up: **Session 7** (stretch — only if the group wants more).
- **Rules of the road:** everything in `CLAUDE.md` still applies — shared
  physics are sacred, N-player everywhere, constants in
  `shared/src/config/game.ts`, discriminated-union network messages, mobile
  is first-class, deterministic tests.
- Sessions are ordered by value and dependency. Don't reorder without a
  reason; do record any deviation in the Session Log.

## Why the game got repetitive (diagnosis)

1. **Every fight is the same fight.** One weapon (3-round-burst rifle); all
   characters shoot it identically. Characters differ only by one ability on
   a 30–45s cooldown.
2. **Every match is the same place.** One map, symmetric, memorized.
3. **Nothing pulls players anywhere.** Pickups are ammo top-offs; no healing,
   no objectives, no map control.
4. **Nothing carries over.** Stats die on the results screen. No rivalry
   history, no bragging rights.
5. **The one variance system is predictable.** Final-minute events fire once,
   at a fixed time, from a pool of 4.

Each session below attacks one of these.

## Session overview

| # | Title | Fun payoff | Status |
|---|-------|-----------|--------|
| 1 | Weapon system + Shotgun + health pickups | Fights stop being identical; map control begins | **DONE** (2026-07-04) |
| 2 | Match awards + persistent rivalry stats | Bragging rights: the friend-group replay engine | **DONE** (2026-07-04) |
| 3 | Mutator expansion | Matches stop repeating; chaos moments | **DONE** (2026-07-04) |
| 4 | Two new maps + rotation | New spaces to master | **DONE** (2026-07-04) |
| 5 | King of the Hill + overtime | A second way to play; no more anticlimactic ties | **DONE** (2026-07-04) |
| 6 | New characters + stat identities | Counterpicks and mains | **DONE** (2026-07-04) |
| 7 | (Stretch) Gun Game + Pistol + melee | The party mode | not started |

---

## Asset pack reference

**The full pack is NOT in the repo.** Only a curated subset is checked in at
`client/public/assets/` (see `client/public/assets/ATTRIBUTION.md`).

- **Zip (the real source — PNG sprite sheets):**
  `C:\Users\rybes\Downloads\PostApocalypse_AssetPack_v1.1.2.zip`
- **Extracted folder (GIF previews ONLY — good for eyeballing animations,
  never ship these):** `C:\Users\rybes\Downloads\PostApocalypse_AssetPack_v1.1.2\`
- **License (v1.1.2, TheLazyStone):** free non-commercial; do NOT check the
  whole pack in; extract only files we render. **Every time you add a file,
  add it to the "Files used" list in `ATTRIBUTION.md`.**

Extraction example (Git Bash, from repo root):

```bash
unzip -j "$HOME/Downloads/PostApocalypse_AssetPack_v1.1.2.zip" \
  "Character/Guns/Shotgun/Shotgun_down_shoot-Sheet3.png" -d client/public/assets/player/
mv client/public/assets/player/Shotgun_down_shoot-Sheet3.png \
   client/public/assets/player/shotgun_down_shoot.png
```

Conventions (match the existing pipeline):

- Sheets are horizontal strips; `-SheetN` in the filename = N frames. The
  current character pipeline assumes **6-frame** idle/run sheets; frame
  dimensions per direction live in `CHARACTERS` in `shared/src/config/game.ts`.
- Checked-in names are kebab/snake per existing files:
  `{basename}_{direction}_{state}.png` (e.g. `gun_down_shoot.png`,
  `zombie_side-left_run.png`). Directions: `down`, `up`, `side`, `side-left`.
- Single-sprite objects (pickups) have no sheet suffix.

### What the pack offers (gameplay-relevant inventory)

Weapons — full held-overlay support in 4 directions (idle/run + shoot + reload
sheets), matching ground pickups, bullet sprites, and HUD ammo icons:

- **Shotgun**: `Character/Guns/Shotgun/*` (shoot Sheet3, racking Sheet2,
  multi-part reloads), `Character/Guns/Bullets/Shotgun-bullet.png`,
  `Objects/Pickable/Shotgun.png`, `UI/Bullet Indicators/Shotgun-Bullet*.png`
- **Pistol**: `Character/Guns/Pistol/*` (shoot Sheet3, reload Sheet11),
  `Character/Guns/Bullets/Pistol-bullet_*.png`, `Objects/Pickable/Pistol.png`,
  `UI/Bullet Indicators/Pistol-Bullet*.png`
- **Rifle (current "Gun")**: already checked in.

Health/consumables: `Objects/Pickable/Bandage.png`, canned food/soup,
`UI/Inventory/Objects/Icon_First-Aid-Kit_{Red,White}.png`, hearts under `UI/HP/`.

Characters (4-direction idle/walk/attack/death sheets — note some walk sheets
are **8-frame**, see Session 6):

- **Zombie_Big** (`Enemies/Zombie_Big/*`) — tank archetype.
- **Zombie_Axe** (`Enemies/Zombie_Axe/*`) — has a complete thrown-axe
  projectile set: `Axe_{Side,Side-left,Vertical}_Thrown-Sheet9.png`,
  `Axe_*_Landing-Sheet5.png`, `Axe_*_Landed.png`, plus with-axe/no-axe body
  variants.
- **Helmet** (`Character/Helmet/*`) — helmeted human variant (idle/run,
  punch, pick-up, death). No gun-hold sheets.
- Main character extras: `Character/Main/Punch/*` (melee!), `Pick-up/*`,
  `Death/*` (3 side-death variants).
- **Bat** creature (`Character/Bat/*`) — flying critter (attack/death) if we
  ever want a hazard.

Maps/tiles: `Tiles/Background_{Dark-Green,Green}_TileSet.png` (new floor
palettes), `Tiles/Garbage_TileSet.png`, `Tiles/Buildings/Buildings_*_TileSet.png`,
`Tiles/Roof_TileSet.png`, wire-fence gates with open/close animation sheets.
Cover/decoration objects: `Objects/Container/*` (24 files),
`Objects/Vehicles/*` (cars + motorcycle, normal & overgrown variants),
`Objects/Buildings/*`, nature/grass/puddles.

Effects/UI: `Enemies/Shot/shot_{1,2}-Sheet3.png` (hit splashes), menu
buttons/cursor/checkmark under `UI/Menu/`.

Audio: the pack has **no audio**. Current SFX live in
`client/public/assets/audio/`. For new weapons, reuse `gun-shot.wav` with
Phaser rate/detune shifts (acceptable v1) rather than sourcing new files.

---

## End-of-session ritual (run at the end of EVERY session)

1. **Verify:** `pnpm typecheck && pnpm lint && pnpm test` all green. Run
   `pnpm test:e2e` if you touched scenes/HUD/flow. Play-test via `pnpm dev`
   (use `/verify`-style manual smoke: one full match incl. the new feature,
   desktop + mobile-landscape viewport).
2. **Docs:** update `ATTRIBUTION.md` for any new assets; update `CLAUDE.md`
   only if commands/architecture changed; update **this file**: set the
   session's status, check off acceptance criteria, append a Session Log
   entry (what shipped, deviations, known issues, tuning notes).
3. **Cleanup:** remove dead code/temp files; new balance values are in
   `shared/src/config/game.ts` (frozen objects), not inline.
4. **Commit & push to `main`** (Conventional Commits, scoped, several small
   commits over one blob).
5. **Deploy & smoke:** client via Firebase, server via the GCE git-pull flow
   (both in `CLAUDE.md` → Deployment). Then `curl http://34.24.140.207:3001/health`
   and load https://mighty-mans-revenge.web.app for a quick match. If you
   can't deploy, say so explicitly in the handoff prompt.
6. **Hand off:** print the next-session prompt (template below) filled in
   with the next session number/title plus any carry-over warnings.

### Next-session prompt template

```
Continue the replayability build for Mighty Man's Revenge.

Read docs/REPLAYABILITY_ROADMAP.md first — full plan, current status,
session log, and end-of-session ritual. This session: implement
**Session <N>: <title>** as specced there, honoring CLAUDE.md.

Carry-over notes from last session: <none | list>

When done and verified, run the end-of-session ritual from the roadmap
and give me the paste-ready prompt for Session <N+1>.
```

---

## Session 1 — Weapon system + Shotgun + health pickups

**Goal:** break the "one gun" monotony and give players a reason to move:
a generic weapon system, the Shotgun as a contested map-spawned power
weapon, and Bandage health pickups.

**Locked design decisions**

- **Loadout model:** every player always carries the rifle (current gun).
  There is **one special-weapon slot**. Walking over a weapon pickup
  auto-equips it; when its ammo hits 0 it vanishes and you revert to the
  rifle. **No weapon-switch key** — auto-equip/auto-revert keeps mobile
  controls untouched.
- **Weapon definitions** live in `shared/src/config/game.ts` as a frozen
  `WEAPONS` record keyed by `WeaponId` (`'rifle' | 'shotgun'`). Migrate the
  existing `GUN` constants to `WEAPONS.rifle` (update call sites; don't keep
  a legacy alias). Fields: damage min/max, falloff range min/max, burst
  size/interval, magazine size, reload time, `pelletCount`, `spreadAngle`,
  pickup ammo amount.
- **Shotgun tuning (starting point, tune in playtest):** 6 pellets/shot,
  per-pellet damage 8→3 over falloff 32→180px (brutal close, useless far),
  magazine 2, 0.6s racking between shots, 1.5s reload, picked up with 8
  shells total. Single-shot per click (burstSize 1).
- **Shotgun spawn:** one pickup at map center (replace one `gun_ammo`
  center spawn), respawn 30s, with a HUD banner + sound 5s before it lands:
  "SHOTGUN INCOMING". Reuse the final-minute-event banner component.
- **Bandage:** +30 HP (cap `PLAYER.MAX_HEALTH`), two spawns on opposite map
  edges, respawn 20s. Art: `Objects/Pickable/Bandage.png`.
- **Hit validation:** shotgun = N pellet rays through the existing lag-comp
  rewind validation (`server/src/game/lag-compensator.ts`). Pellet spread
  angles must be deterministic from the input (seeded/derived), so server
  validation and any client preview agree.
- Kill attribution: extend the `weapon` union in
  `server/src/game/stats-tracker.ts` (`'gun' | 'grenade' | 'fire'`) to
  include `'shotgun'` — session 2's awards will consume it.

**Type/plumbing checklist:** `PickupType` gains `WEAPON_SHOTGUN` and
`BANDAGE` (`shared/src/types/pickup.ts`); `MapData.pickupSpawns` union +
`map-validator` updated; `PlayerState` carries `weaponId` + special ammo;
new/changed `ClientMessage`/`ServerMessage` members added to the
discriminated unions in `shared/src/types/network.ts`; HUD shows the
special weapon's ammo using `UI/Bullet Indicators/Shotgun-Bullet*.png`.

**Assets to extract:** Shotgun held overlays (idle-and-run + shoot + racking
for all 4 directions — skip the multi-part reload sheets, a fixed reload
timer is fine), `Shotgun-bullet.png`, `Objects/Pickable/Shotgun.png`,
`Objects/Pickable/Bandage.png`, shotgun HUD bullet indicators (regular +
Small). Rename per convention (`shotgun_down_shoot.png`, …).

**Acceptance criteria**

- [x] Rifle behavior is unchanged (regression: existing tests still pass).
- [x] Shotgun spawns center-map with pre-announcement, auto-equips, racks
      between shots, reverts to rifle on empty.
- [x] Shotgun kills validate through lag compensation and attribute to
      `'shotgun'` in stats.
- [x] Bandages heal, cap at max HP, respawn on their own timer.
- [x] Client prediction/reconciliation shows no new rubber-banding (weapon
      state changes don't touch movement physics; firing/ammo are not
      client-predicted).
- [x] HUD (desktop + mobile landscape) shows special-weapon ammo; pickup
      and shotgun-fire have distinct SFX (rate/detune variants OK).
- [x] Unit tests for weapon defs, pellet spread determinism, pickup/equip/
      revert state machine; ≥90% on new server/shared logic.

**Parallelizable workstreams:** (a) shared weapon defs + server combat/pickup
logic + tests, (b) client rendering (held overlay, muzzle, projectiles) +
HUD, (c) asset extraction/renaming + ATTRIBUTION. (b) and (c) can start from
the type definitions agreed in (a)'s first commit.

---

## Session 2 — Match awards + persistent rivalry stats

**Goal:** make matches leave a mark: end-of-match awards on the results
screen and lifetime head-to-head records that survive restarts.

**Locked design decisions**

- **Awards** are computed server-side at match end from `StatsTracker` data
  and shipped in `MatchResult` (extend the shared type). Display the top 3
  applicable by priority order. Starting set (names final, thresholds
  tunable):
  - *Sharpshooter* — best accuracy (min 10 shots fired)
  - *Spray & Pray* — most shots fired with accuracy < 25%
  - *Demolition Man* — most grenade kills (≥1)
  - *Buckshot Barber* — most shotgun kills (≥1; from Session 1's attribution)
  - *Untouchable* — longest kill streak (≥3)
  - *Pincushion* — most damage taken
  - *Pin Puller, No Payoff* — ≥3 grenades thrown, 0 grenade kills
  - *Tourist* — most distance traveled if cheap to track, else drop
- **Persistence:** a JSON file on the server (`server/data/persistent-stats.json`,
  path via env `DATA_DIR`, default `server/data/`; gitignored). Keyed by
  **lowercased nickname** (fine for <10 friends). Schema: per-player lifetime
  totals (kills, deaths, wins, losses, matches, per-weapon kills) +
  `headToHead["alice|bob"] = { winsA, winsB, draws }` (keys sorted
  alphabetically). Written asynchronously at match end — **never inside the
  tick loop**. Corrupt/missing file → start fresh, log a warning.
- **Results scene** gains: awards banners (pixel styling to match
  `MENU_FONTS` / `WastelandStreet` look) + one line of lifetime rivalry:
  "ALL-TIME: RYAN 14 — 9 DAVE".
- **Lobby (stretch, only if time):** tiny leaderboard panel (top 5 by wins).
- The VM deploy is git-pull based; an untracked `server/data/` survives
  deploys. Confirm `.gitignore` covers it.

**Acceptance criteria**

- [x] Awards appear on results for both players, deterministic given stats,
      with unit tests over the selection/priority logic.
- [x] Lifetime records persist across server restarts (integration test with
      a temp DATA_DIR).
- [x] Rivalry line renders on results (desktop + mobile landscape).
- [x] File writes are async, at match end only; tick budget unaffected.
- [x] Draws recorded as draws (don't let Session 5's overtime change land
      first — if it did, adjust).

**Parallelizable workstreams:** (a) server awards computation + persistence +
tests, (b) results-scene UI. Agree on the `MatchResult` extension first.

---

## Session 3 — Mutator expansion

**Goal:** generalize the final-minute event system into mutators that can
fire at random times, and grow the pool, so no two matches feel alike.

**Locked design decisions**

- Rename/extend the `EVENT` config into a mutator system (keep the shared
  purity of `shared/src/utils/event-modifiers.ts` — movement-affecting
  mutators MUST stay expressed as `MovementModifiers`).
- **Timing:** each match rolls ONE mid-match activation at a random time
  in the 40%–70% elapsed window (server RNG, seedable for tests) **plus**
  keeps the guaranteed final-minute event. Warning banner 5s before each,
  as today. Two total per match.
- **New pool entries (all server-authoritative):**
  - `big_heads` — hitboxes ×1.5 and render scale ×1.3 for everyone.
    Server-side hit validation + client visual only; movement untouched.
  - `vampire` — heal for 50% of damage dealt.
  - `turbo_grenades` — grenade throw speed ×1.5 and grenades refill every
    5s up to max.
  - `second_wind` — respawning grants 1.3× speed for 3s (via
    `MovementModifiers`, shared).
  - (stretch) `ice_rink` — acceleration/friction model; ONLY attempt if
    `shared/utils/physics.ts` can express it cleanly for prediction AND
    server identically; otherwise skip — this is the rubber-banding
    landmine.
- Existing 4 events stay in the pool. No repeats within a match.
- Mutator pool/timing constants in `shared/src/config/game.ts`.

**Acceptance criteria**

- [x] Mid-match mutator fires at a random (seeded-in-tests) time with
      warning; final-minute event unchanged; no duplicate mutator per match.
- [x] `big_heads` scales both hit validation and rendering; a shot that
      misses a normal hitbox hits a big one (server test).
- [x] `second_wind` produces identical movement client/server (no
      reconciliation snap in manual test).
- [x] All mutators covered by deterministic unit tests; HUD banner names
      via `eventDisplayName`.

**Parallelizable workstreams:** (a) timing/scheduler + pool refactor,
(b) individual mutators (each is small and independent once (a) lands),
(c) client VFX/scaling.

---

## Session 4 — Two new maps + rotation

**Goal:** two visually and tactically distinct arenas, and a rotation so
consecutive matches don't repeat a map.

**Locked design decisions**

- **Map A: "Overgrown Suburb"** — `Background_Green_TileSet` floor,
  buildings (`Tiles/Buildings/*` or `Objects/Buildings/*`) as wall clusters,
  vehicles (`Objects/Vehicles/*`, overgrown variants) as `COVER_LOW`
  centerpieces. Longer sightlines than Wasteland Outpost, open mid.
- **Map B: "Scrapyard"** — `Background_Dark-Green_TileSet` or
  `Garbage_TileSet` floor accents, `Objects/Container/*` as tight corridor
  walls. Close-quarters maze — shotgun heaven.
- Both maps: same 20×12 viewport-fit dimensions (`MAP.TILE_SIZE` 48), ≥4
  spawn points (N-player rule), pickup spawns including exactly one
  shotgun spawn + two bandages + ammo/grenades (Session 1 types), pass
  `map-validator` (add reachability check if it lacks one).
- **Theming:** map JSON gains an optional `theme` field mapping to a
  tileset/texture set; the client tile renderer resolves textures via the
  theme (study how `wasteland-outpost` textures are currently bound before
  designing this — keep it dumb: a record of theme → texture keys).
- **Rotation, not voting (v1):** server picks the next map round-robin per
  match (registry order), results screen shows "NEXT MAP: SCRAPYARD".
  Lobby map voting is a stretch goal only.
- Update `shared/src/maps/registry.ts` + tests. Tile semantics reminder:
  `TileType` 0..4; `spawnPoints`/`pickupSpawns` arrays are authoritative
  (the 3/4 tiles are informational).

**Acceptance criteria**

- [x] Both maps validate, render themed on desktop + mobile, and play a
      full match without collision/spawn bugs.
- [x] Collision grids identical client/server (shared loader — no forked
      logic).
- [x] Rotation cycles all three maps; results screen shows next map.
- [x] Registry/validator unit tests cover the new maps and theme lookup.

**Parallelizable workstreams:** (a) tile/theme renderer support, (b) map A
authoring, (c) map B authoring, (d) rotation + registry. (b)/(c) are fully
independent once (a)'s theme shape exists.

---

## Session 5 — King of the Hill + overtime

**Goal:** a second game mode that forces constant engagement, plus sudden-
death overtime so ties stop being decided arbitrarily.

**Locked design decisions**

- **KothMode** implements the existing `GameMode` interface
  (`server/src/game/modes/`) — this is the interface's first real test;
  refactor `MatchContext` only if genuinely required.
- **Hill:** a 2×2-tile zone; per-map hill positions (extend map JSON with
  optional `kothHills: {x,y}[]`, ≥3 per map; add to both new maps and
  Wasteland Outpost). Hill relocates every 25s round-robin with a 3s
  warning marker at the next spot.
- **Scoring:** 1 point per full second as sole living occupant; contested
  (both inside) = nobody scores. First to 60 points or highest at the
  3-minute timer. Kills don't score but obviously enable occupancy.
- **Mode selection:** simplest thing that works — lobby rotates DM → KOTH →
  DM…, shown before character select ("NEXT: KING OF THE HILL"). A real
  mode-vote UI is a stretch goal.
- **Overtime (all modes):** if `isMatchOver` would end in a tie, enter
  OVERTIME: 30s, sudden death (single life, no respawn), first kill wins;
  if nobody dies, true draw. Banner + music sting (reuse an existing SFX).
  Fix `DeathmatchMode.determineWinner`'s arbitrary tie-break (the comment
  at `deathmatch-mode.ts:68` admits it) to return a real tie so overtime
  triggers.
- HUD: hill marker + capture progress bar + mode-appropriate score line;
  works on mobile landscape.

**Acceptance criteria**

- [x] Full KOTH match playable start→results, hill moves on schedule,
      contested logic correct (unit tests on occupancy/scoring).
- [x] DM tie now flows into overtime; overtime kill ends match immediately;
      double-timeout = draw, recorded as such in Session 2's persistence.
- [x] Mode rotation surfaces in lobby; results screen labels the mode.
      (Surfaced on the character-select screen — the lobby fades straight
      into it, so that IS the pre-match surface.)
- [x] Tick budget unaffected (zone checks are O(players), trivial).

**Parallelizable workstreams:** (a) KothMode + tests, (b) overtime state
machine, (c) HUD/lobby UI. (a) and (b) are independent.

---

## Session 6 — New characters + stat identities

**Goal:** make character select a real decision: distinct stats per
character and two new roster members with ability art from the pack.

**Locked design decisions**

- **Stat identities** (new per-character fields in `CHARACTERS`, consumed
  via shared physics `MovementModifiers` and server combat; starting
  values, tune in playtest):
  | Character | HP | Speed | Hitbox | Ability (existing) |
  |---|---|---|---|---|
  | Mighty Man | 100 | 1.00× | 24 | X-ray (unchanged) |
  | Bruce | 115 | 0.95× | 24 | Fire breath (unchanged) |
  | Frost Wizard | 85 | 1.08× | 24 | Freeze (unchanged) |
  | **Big Zombie** | 150 | 0.85× | 30 | **Iron Hide** — 50% damage reduction for 4s, cooldown 30s |
  | **Axe Zombie** | 100 | 1.00× | 24 | **Axe Throw** — thrown-axe projectile, 60 dmg direct hit, travels ~6 tiles, cooldown 12s |
- Axe Throw uses the pack's full projectile set (Thrown Sheet9 / Landing
  Sheet5 / Landed). It's the first non-hitscan character projectile —
  server-simulated like grenades (no client prediction of damage), flight
  speed constant in shared config.
- **Per-character hitbox** must flow through server hit validation AND the
  lag-comp rewind snapshots (rewind buffer stores per-player hitbox dims or
  reads them from character id — verify `rewind-buffer.ts`).
- **Per-character max HP + speed** are shared-physics-relevant: speed goes
  through `MovementModifiers` so client prediction stays exact.
- **Sprite pipeline caveat:** Zombie_Big / Zombie_Axe **walk sheets are
  8-frame** (`-Sheet8`), idles are 6-frame; current pipeline assumes 6.
  Extend `CharacterDef`/BootScene with a per-state frame count instead of
  cropping frames.
- Character select screen: show HP/speed pips per character so the
  differences are legible; verify the roster grid handles 5 entries
  (it must already be dynamic — confirm).
- Naming: pick display names in-session ("Big Zombie"/"Axe Zombie" are
  placeholders — check `memory` note on character naming: human = Mighty
  Man, zombie = Bruce; keep the theme).

**Acceptance criteria**

- [x] All five characters selectable with correct sheets/animations
      (8-frame walks animate correctly).
- [x] Speed differences produce zero reconciliation drift (client/server
      identical — manual + automated where possible).
- [x] Big hitbox is honored by live hits AND rewound hits (lag-comp test).
- [x] Iron Hide reduces all damage sources (rifle/shotgun/grenade/fire/axe);
      Axe Throw damages on direct hit, blocked by walls, attributed in
      stats (extend weapon union again).
- [x] Existing three characters' ability behavior unchanged.

**Parallelizable workstreams:** (a) stat plumbing (HP/speed/hitbox) + tests,
(b) Big Zombie assets + Iron Hide, (c) Axe Zombie assets + projectile.
(b)/(c) are independent after (a).

---

## Session 7 — (Stretch) Gun Game + Pistol + melee

**Goal:** the party mode — a third rotation mode where every kill marches
you down a weapon ladder ending in bare fists, plus the two attacks that
ladder needs: a Pistol and a Punch melee.

**Locked design decisions**

- **Ladder:** `rifle → shotgun → pistol → grenades → punch`, kills
  required per rung `[2, 2, 2, 2, 1]` (9 ladder kills total; first
  punch-rung kill wins immediately). Config in
  `shared/src/config/game.ts` as `GUN_GAME` (`LADDER`, `RUNG_KILLS`,
  grenade refill interval, ammo reserve floors). Only kills made **with
  your current rung weapon** advance the ladder (ability kills — axe,
  fire — and self-kills never advance). No demotion on death (v1).
- **Score = ladder kills.** `PlayerState.score` carries total ladder
  kills; a pure shared helper (`shared/src/utils/gun-game.ts`:
  `rungForScore(score)` → `{ rungIndex, killsIntoRung, weapon }`) derives
  the rung on BOTH server and client, so no new per-player wire state is
  needed — the HUD reads `score` + the already-broadcast `weaponId`.
- **GunGameMode** (`server/src/game/modes/gun-game-mode.ts`) implements
  `GameMode`. `GameMode.onKill` gains a `weapon: KillWeapon` parameter
  (DM/KOTH ignore it). The mode is the loadout authority: `onTick`
  enforces each living player's rung loadout (weaponId, mag/reserve
  floors, grenade refill), which also self-heals the rifle reset done by
  death/respawn/overtime. On rung advance the killer's pending bursts /
  racking / reload state are cleared and the new weapon arrives with a
  full mag. No score accrual during overtime (guard `match.isOvertime`);
  overtime is fought with rung weapons — a genuine tie means equal
  score, hence the same rung, hence a fair duel.
- **Ammo never strands anyone:** rifle reloads are already free;
  shotgun/pistol rungs keep `specialReserve` topped to a floor
  (shotgun 6 / pistol 24) so auto-revert can't fire; the grenade rung
  refills 1 grenade per 3s up to max (fill on rung entry). Rung-weapon
  rendering on the grenade rung keeps the rifle in hand but gun fire is
  gated (see mode hooks) — the HUD ladder line is the source of truth.
- **New `GameMode` extension points** (all optional, other modes
  untouched):
  - `excludedMutators?: readonly MutatorId[]` — Gun Game excludes
    `grenades_only` + `infinite_ammo` from BOTH mutator rolls
    (`FORCE_EVENT`/`FORCE_MIDMATCH_MUTATOR` pins still bypass — they're
    smoke tools).
  - `isPickupTypeEnabled?(type)` — Gun Game disables `weapon_shotgun`,
    `gun_ammo`, `grenade` pickups (never spawn, never announce);
    bandages stay.
  - `areGunsDisabled?(match, player)` — grenade-rung fire gate, OR'd
    with the existing `grenades_only` mutator check in the input loop.
- **Rotation:** `GameModeType.GUN_GAME = 'gun_game'`, display name
  "GUN GAME", rotation `DM → KOTH → GUN GAME` (same cursor/rematch-pin
  contract), `FORCE_MODE=gun_game` for smokes. Character select
  ("NEXT: GUN GAME - MAP") and results labels come free via
  `gameModeDisplayName`.
- **Pistol** (`WEAPONS.pistol`, starting values — tune in playtest):
  damage 14→7 over falloff 48→320px, semi-auto (burstSize 1,
  `fireCooldown` 0.22s via the racking-timer mechanism), magazine 12,
  reload 1.0s, `pickupAmmo` 0 — **not a map pickup in v1** (Gun Game
  only; a DM pickup is a cheap follow-up if the group wants the triad
  everywhere). Rides the special-weapon slot fields
  (`specialAmmo`/`specialReserve`) and the generalized reload path.
- **Punch** (`WEAPONS.punch`): flat 60 damage, range 56px (~1.2 tiles),
  arc ~100° validated as **7 deterministic even-fan rays** (new pure
  helper `evenFanAngles` next to the pellet-spread util — NO jitter, so
  the fan can't gap past a 24px hitbox) through
  `processMultiShotWithRewind` — per-victim character hitboxes
  (Bubba 30px), big_heads scale, wall blocking, and lag-comp rewind all
  come free. `WeaponDef` gains optional `maxRange` (hard ray cap —
  without it rays extend to `falloffRangeMax * 2`). One damage
  application per victim per swing (dedupe across rays; an arc CAN hit
  multiple victims — N-player). Swing cooldown 0.5s via the same
  fire-cooldown timers. Accuracy bookkeeping mirrors the shotgun: one
  swing = 1 shot fired, 1 hit if anyone was struck. Iron Hide applies
  via `applyDamage` (consume returned `damageApplied`). No bullet
  trails; instead a one-shot punch event rides gameState (mirroring the
  `axeThrown` message-granularity pattern) driving remote+local swing
  anims and SFX.
- **Fire dispatch generalizes:** input loop routes `firePressed` by
  `player.weaponId` — rifle/pistol → parametrized hitscan path
  (burst only when `burstSize > 1`), shotgun → existing pellet path,
  punch → melee path. `WeaponId` grows `'pistol' | 'punch'`;
  `KillWeapon` + `KILL_WEAPONS` grow `'pistol' | 'punch'` (persistence
  must default missing `killsByWeapon` keys to 0 when loading an older
  `persistent-stats.json`). New award: *Bare Knuckles* — most punch
  kills (≥1).
- **Punch animations are body-level states** (unlike gun overlays):
  `CharacterDef` gains `attackFrames`/`attackFrameCount`; every roster
  character has pack attack sheets (Main Punch Sheet4 — with-hands
  variant; Zombie_Small First-Attack Sheet4; Zombie_Big Sheet8;
  Zombie_Axe Sheet7; Frost Wizard reuses Main). Anims normalize to a
  ~350ms play regardless of frame count. While `weaponId === 'punch'`
  the gun overlay hides. Pistol gets held overlays
  (`pistol_{dir}_{hold,shoot}`, Mighty Man only — the only
  `hasGun` character; skip the Sheet11 reloads, fixed timer like the
  shotgun).
- **Mobile untouched:** right-stick release already fires; the server
  decides what firing means from the rung. Grenade rung uses the
  existing grenade button. HUD ladder element + pistol ammo row must
  work in mobile landscape; rifle-ammo row hides on grenade/punch rungs
  so it can't mislead.
- **SFX:** rate/detune variants of existing files (pack has no audio):
  pistol = gunshot pitched up, punch whoosh = grenade-throw pitched
  up hard, punch impact = existing hit sound.
- Bat-creature hazard: **skipped** (stretch-of-a-stretch; roadmap ends
  at Session 7 unless the group asks for more).

**Type/plumbing checklist:** `WEAPONS.pistol`/`WEAPONS.punch` +
`WeaponDef.maxRange?`; `GUN_GAME` config block; `GameModeType.GUN_GAME`
+ rotation + registry entries; `GameMode.onKill(…, weapon)` signature
change; three optional mode hooks (mutator exclusion, pickup filter,
gun gate); punch one-shot event on the gameState message
(`shared/src/types/network.ts`); `KillWeapon`/`KILL_WEAPONS` growth;
`CharacterDef.attackFrames`/`attackFrameCount`; shared
`gun-game.ts` + `evenFanAngles` utils (100% coverage, deterministic).

**Assets to extract:** pistol hold/shoot overlays (4 dirs × 2 states),
`UI/Bullet Indicators/Pistol-Bullet{,_Empty}.png` (+ Small variants if
the HUD needs them), per-character attack sheets (Main Punch
with-hands Sheet4 ×4 dirs, Zombie_Small First-Attack Sheet4 ×4,
Zombie_Big First-Attack Sheet8 ×4, Zombie_Axe First-Attack Sheet7 ×4).
Rename per convention; update ATTRIBUTION.md "Files used".

**Acceptance criteria**

- [ ] Pistol fires semi-auto through lag comp with falloff; reload +
      HUD ammo row work; Mighty Man overlay animates; kills attribute
      to `'pistol'`. Rifle/shotgun behavior unchanged (regression).
- [ ] Punch validates through the lag-comp rewind: a rewound graze hits
      Bubba's 30px box and misses a 24px character; walls block it;
      `maxRange` caps it; one damage application per victim per swing;
      a two-victim arc damages both; Iron Hide halves it; kills
      attribute to `'punch'`.
- [ ] Full Gun Game match start→results: rung-weapon kills advance per
      `RUNG_KILLS`; wrong-weapon/ability/self kills don't; first
      through the ladder wins immediately; timer expiry crowns the
      highest score; an equal top score enters overtime fought with
      rung weapons; loadout enforcement survives death/respawn/
      overtime resets.
- [ ] In Gun Game: shotgun/ammo/grenade pickups never spawn (bandages
      do); `grenades_only`/`infinite_ammo` never roll; grenade rung
      refills; no rung can strand a player without a usable attack.
- [ ] Rotation cycles DM → KOTH → GUN GAME (rematch pin included);
      `FORCE_MODE=gun_game` pins; character select + results label the
      mode; results scoreboard/awards render (incl. Bare Knuckles).
- [ ] HUD desktop + mobile landscape: ladder position ("PISTOL 1/2",
      rung n/5) always legible; misleading ammo rows hidden on
      grenade/punch rungs; pistol/punch SFX distinct.
- [ ] Old `persistent-stats.json` (pre-pistol/punch) loads cleanly with
      new weapon keys defaulted to 0.
- [ ] Deterministic unit tests ≥90% on new server/shared logic; DM/KOTH
      regression suites green; no client-prediction changes (movement
      physics untouched — zero new rubber-banding).

**Parallelizable workstreams:** (a) shared config/types/utils
(`GUN_GAME`, weapons, `evenFanAngles`, `rungForScore`, mode enum,
network type) + tests; (b) server — generalized fire dispatch, punch
melee, pistol path, `GunGameMode` + mode hooks + tests; (c) client —
asset extraction/ATTRIBUTION, pistol overlay + HUD row, punch body
anims + event FX/SFX, Gun Game HUD ladder + mode surfaces. (b) and (c)
are independent once (a) lands.

---

## Session Log

Append one entry per session. Include: date, what shipped (commits), design
deviations from this doc, known issues, tuning notes from play-testing.

### Session 6 — 2026-07-04 — New characters + stat identities

**Shipped:** the roster grew from 3 to 5 and character select became a
real decision. **Bubba** (pack Zombie_Big — display name keeps the
horror-icon first-name theme next to Bruce): 150 HP, 0.85× speed, 30px
hit-validation box, ability **Iron Hide** — 50% damage reduction for 4s
on a 30s from-activation cooldown, applied inside
`CombatManager.applyDamage` (the single choke point every damage source
flows through: rifle, pellets, grenades, fire breath, axes — covered by
per-source tests). **Jack** (pack Zombie_Axe, with-axe body variant):
baseline 100/1.0×/24px, ability **Axe Throw** — the roster's first
non-hitscan character projectile, server-simulated like grenades (no
client damage prediction): 60 dmg direct hit, 6-tile range, wall-blocked,
per-victim character hitbox × big_heads scale, kills attributed to the
new `'axe'` KillWeapon, cleared on overtime entry, 12s instant-cast
cooldown. Whole-roster stat identities live on `CHARACTERS`
(maxHealth / speedMultiplier / hitbox + per-state sheet frame counts —
the new zombies' walk sheets are 8-frame). Character select shows
normalized HP/SPD stat bars per card and shrinks cards/type when the
roster exceeds 3 (5×172px cards fit the 960px canvas). Client: axe
flight/landing renderer, Iron Hide steel aura + shield HUD icon +
banner, Jack axe HUD icon + pitched-up throw SFX.

**Design decisions made in-session (roadmap was silent or amended):**
- Display names: **Bubba** and **Jack** (Bruce/Bubba/Jack — horror-icon
  first names; "Big Zombie"/"Axe Zombie" were placeholders).
- Per-character hitbox affects HIT VALIDATION ONLY. Movement collision
  keeps `PLAYER.HITBOX_*` for the whole roster (same contract as
  big_heads' "movement untouched") so map geometry plays identically —
  documented on CharacterDef.
- Per-character speed flows through a new shared
  `playerMovementModifiers(characterId, mutators, secondWindTimer)` —
  THE function all three movement call sites (server input loop, client
  prediction, client reconciliation) now use, so prediction can't drift.
  Composes multiplicatively with mutator speed (super_speed Bubba =
  0.85 × 1.6). Zero-drift replay covered by a reconciliation unit test.
- Per-character max HP commits at the select→lock moment (before ACTIVE,
  so low_health can't have touched maxHealth yet); low_health still
  clamps everyone to 1 (Bubba included) and respawn uses the live
  `player.maxHealth`, so the mutator interplay needed no special cases.
- Iron Hide anchors its cooldown at activation (Bruce-style, 30s total
  cycle); `applyDamage` now returns `damageApplied` and every call site
  records stats/vampire healing off the post-reduction value.
- Axe Throw is instant-cast like Frost Lock (no active window) — the
  activation banner keys off the cooldown leading edge; the cooldown
  edge handler was generalized for both.
- **Axes get an "armed" spawn tick** (hold position for one tick before
  moving): spawn and updateAxes run in the same match tick, so an axe
  thrown point-blank at a wall used to spawn AND retire before a single
  broadcast — the thrower saw nothing. Found live by the smoke (spawn
  nooks are fenced; Jack kept eating the fence).
- **Axe throw/landing FX are message-granularity client events**
  (`axeThrown`/`axeResolved`, diffed per gameState in NetworkManager —
  exact mirror of `grenadeExploded`'s rationale): a one-snapshot flight
  can be overwritten by bursty message delivery before a render frame
  samples it, so frame-polling alone swallowed the whole flight. Flight
  sprites stay frame-driven; landing anim + throw SFX ride the events.
- `RewindPlayerState` dropped its hitbox field — it stored a hardcoded
  24 that NOTHING read (the lag-comp hybrid states carry characterId,
  and validation derives dims from it; characterId is immutable
  per-match so the derivation is exact). Contract documented in
  rewind-buffer.ts; a new lag-compensator test proves a rewound graze
  hits Bubba's 30px box and misses a 24px character.
- The aim-line preview (`predictBulletRay`) uses per-victim character
  hitboxes so the preview marks exactly what the server counts.
- Fire breath now computes per-victim hitbox sums (Bubba eats more cone).

**Fixed in passing:**
- `rewind-buffer.ts` line 37 stored `state.maxHealth !== undefined ? 24
  : 24` — a hardcoded hitbox pretending to be conditional, never read.
- HUD health bar (`game-scene.ts`) and world-space health bars
  (`player-manager.ts`) passed `PLAYER.MAX_HEALTH` instead of the
  player's own `maxHealth` — wrong for the whole roster now, previously
  only wrong during low_health.

**Verified:** 592 unit tests green (+46 this session: stat-identity
accessors + roadmap-table values, playerMovementModifiers composition,
per-character speed through the match loop, live + fire-breath hitbox
grazes, Iron Hide over all five damage sources incl. expiry/cooldown/
death-cancel, axe spawn/flight/wall/range/thrower-exclusion/
invuln-skip/big_heads/armed-tick/overtime-clear, lag-comp rewound
30px-box hit/miss pair, reconciliation zero-drift replay for Bubba).
Typecheck + lint clean; full Playwright suite green. Throwaway
two-client Playwright smokes (spec deleted after) through the real dev
servers: 5-card select screen with stat bars (desktop + mobile-landscape
viewport, screenshots eyeballed), Bubba locked → 150 HP bar, IRON HIDE!
banner + steel aura + shield icon with active countdown; Jack → AXE
THROW! banner, axe HUD icon with 12s cooldown arc, axe render asserted
via a display-list probe + a wire tap counting axe-carrying snapshots;
zero page errors on both clients across both viewports.

**Known issues / notes for later sessions:**
- Point-blank wall throws show only the landing animation at the
  thrower's feet (the axe lives one snapshot). Acceptable — it was
  fully invisible before the armed-tick + event fixes.
- Axe SFX is the grenade throw pitched up (detune 700 / rate 1.5) —
  the pack ships no audio; revisit if the group notices.
- The zombies' 8-frame walks play at the same 12fps as the 6-frame
  originals → slightly slower stride cycle. Reads right for Bubba (slow
  tank); watch whether Jack's walk feels sluggish in playtest.
- Jack always renders the with-axe body, even while his axe is in
  flight/cooldown — cosmetic simplification (no-axe variant sheets
  exist in the pack if it ever bothers anyone).
- Session 5 leftovers still unclaimed: "Hill Hog" award (needs a
  StatsTracker hill-seconds column) and overtime music (plays over
  silence after the sting).
- **e2e gotcha (recorded in memory):** Playwright's
  `reuseExistingServer` leaves the dev servers RUNNING after a suite
  finishes on this machine — a later run silently reuses a stale server
  built from older code. Kill anything on 3000/3001/5173 before every
  e2e run, not just at session start (cost a full debug cycle this
  session).
- **Deploys NOT run this session:** the auto-mode permission classifier
  blocked the Firebase hosting deploy (and would block the GCE ssh the
  same way — same as Session 4). All commits are pushed to origin/main
  and the client bundle builds clean — run the two deploy commands from
  CLAUDE.md → Deployment in an interactive session, then
  `curl http://34.24.140.207:3001/health` and play a match at
  https://mighty-mans-revenge.web.app. Both clients must refresh
  together after the deploy: old clients don't know the new
  characterIds or the gameState `axes` field.

### Session 5 — 2026-07-04 — King of the Hill + overtime

**Shipped:** `KothMode` (`server/src/game/modes/koth-mode.ts`) — the
`GameMode` interface's first real second implementation: one 2×2-tile
hill live at a time, 1 point per full second as sole living occupant
(contested = nobody scores; fractional progress resets whenever sole
occupancy breaks), hill relocates round-robin through the map's
`kothHills` every 25s with a 3s blinking warning marker at the next
spot, first to 60 or highest at time-out. Hill points ride in
`PlayerState.score`, so the HUD score line, results scoreboard, and
persistence all worked unchanged. Plus sudden-death **overtime for all
modes**: `DeathmatchMode.determineWinner`'s arbitrary tie-break now
returns a genuine tie, and a tie at match end sends the match into a
30s single-life overtime (everyone respawned fresh, live grenades
cleared, no new mutator activations, hill retired) — first kill wins
immediately, a kill-less overtime is a true draw recorded in the
Session 2 persistence. Mode rotation DM → KOTH mirrors the map-rotation
contract exactly: global cursor for fresh matches, `nextGameMode`
pinned into PostMatchState at match end and shipped in `MatchResult`,
`FORCE_MODE=<deathmatch|koth>` smoke pin. Client: pulsing corner-bracket
hill zone overlay (`koth-hill-renderer.ts`, occupancy-colored), HUD
capture-progress bar between score and timer (CONTESTED blink state),
blood-red overtime clock, "OVERTIME! SUDDEN DEATH" banner with a deep
slow horn, "NEXT: KING OF THE HILL - <MAP>" line on character select,
and results-screen mode label + "- OVERTIME" callout + "NEXT: <MODE>
ON <MAP>" teaser. All three maps gained 5 hills each (validator checks
bounds/2×2-walkability; the registry requires hills on every shipped
map).

**Design decisions made in-session (roadmap was silent or amended):**
- "3-minute timer" is interpreted as the existing MATCH.TIME_LIMIT
  (173s, music-synced) — no per-mode time limit.
- KOTH ties break on hill points ONLY (no deaths tie-break — hill time
  IS the score); DM keeps score-then-deaths and ties only when both
  are equal.
- `GameMode` interface grew `determineWinner` (Match consults it at end
  to detect ties without computing full results) and optional
  `getKothState`; `MatchContext` grew `isOvertime`, `getMapData()`, and
  `getElapsedSeconds()` (duration can't be derived from matchTimer once
  overtime resets it). Modes must NOT accrue score during overtime, or
  an overtime timeout would crown a camper instead of drawing.
- Overtime entry does a full fresh-life reset via respawnPlayer for ALL
  players (a player mid-respawn at the tie moment would otherwise start
  sudden death with no life). Regulation leftovers (bursts, pump
  racking, live grenades) are cleared.
- `MatchResult` gained `nextGameMode` and `wentToOvertime`;
  `server:matchFound` gained `gameMode`; gameState gained `isOvertime`
  + optional `koth` (KothHudState); new one-shot `server:overtimeStart`
  re-anchors the client clock exactly like matchStart.
- The client's local 0:00 fade-out now waits a 600ms grace window
  (END_FADE_GRACE_MS) before firing — a tied match re-anchors the clock
  to overtime within ~1 tick + RTT, and the old instant trigger would
  have faded out over a match that was actually entering sudden death.
  Real ends fade via server:matchEnd inside the window, so nothing is
  slower in practice.
- "Mode rotation surfaces in lobby" landed on the character-select
  screen — the lobby fades straight into it, so it IS the pre-match
  surface. The lobby itself shows nothing new.
- 5 hills per map (spec floor was 3): center-ish opener, then N/E/S/W
  spread so the fight relocates meaningfully. First hill is always the
  contested center (shotgun room on Scrapyard).

**Fixed in passing:**
- gameState broadcasts run from COUNTDOWN onward, but KothMode's hills
  are only initialized by onStart at the COUNTDOWN→ACTIVE transition —
  the countdown snapshots carried `koth.hill: undefined` (JSON drops
  it), which the smoke caught as a per-frame client TypeError. Match
  now returns null hill state outside ACTIVE, and the client renderer/
  HUD treat a hill-less payload as "no hill" defensively.

**Verified:** 546 unit tests green (+48 this session: KothMode
occupancy/scoring/relocation/contested, overtime state machine incl.
respawn freeze + no-new-mutators gate + fresh-life reset, DM tie fix,
mode rotation + FORCE_MODE pinning + overtime broadcast + KOTH snapshot
plumbing, kothHills validation, rotation-config helpers, and a
regression test for the countdown hill-state bug). Typecheck + lint
clean; full standard Playwright suite green. Throwaway two-client
Playwright smokes with FORCE_MODE=koth (spec deleted after), driven
through the real dev servers + netcode:
- Desktop KOTH: character-select "NEXT: KING OF THE HILL - WASTELAND
  OUTPOST" line, hill zone overlay at (9,5), BFS-walked a client onto
  the hill → occupantId flipped, capture bar filled mint, +2 score in
  3.2s of sole occupancy (screenshot showed 9→17 points accruing),
  relocation warning fired and the hill moved on cadence, ZERO uncaught
  page errors, forfeit → VICTORY results with the mode label + "NEXT:
  KING OF THE HILL ON OVERGROWN SUBURB" teaser + a rivalry line showing
  3 recorded DRAWS from earlier tied smoke matches.
- Mobile-landscape (844×390): KOTH HUD + hill overlay render (Phaser
  snapshot eyeballed).
- Overtime: two idle clients ran the full 173s to a genuine 0-0 tie —
  server logged "Match tied — entering sudden-death overtime", clock
  re-anchored to 0:30, hill retired (koth state null), then a kill-less
  overtime ended as a true draw on both results screens.

**Known issues / notes for later sessions:**
- The smoke surfaced and fixed a real bug in review: countdown-phase
  gameState carried koth.hill undefined (onStart hadn't run) → client
  TypeError per frame. Fixed server-side + defensive client guards +
  regression test.
- Awards in KOTH are the DM set (kills/accuracy-based) — a hill-time
  award ("Hill Hog": most hill seconds) would need a StatsTracker
  column; cheap polish for Session 6+.
- The KOTH capture bar's CONTESTED blink is unit-tested but wasn't
  live-verified (needs two players in the zone simultaneously) — have
  the first group playtest eyeball it.
- Overtime music: the gameplay track ends with regulation (tuned to
  173s); overtime currently plays over silence after the sting. If it
  feels dead, loop the last 30s of the track or reuse the countdown
  loop in a later session.
- e2e/dev-machine gotchas discovered (recorded in memory + smoke spec
  comments): GameScene screenshots need Phaser renderer.snapshot
  (page.screenshot is black over WebGL); the server tick loop drifts
  ~25% under Playwright load so timed match waits need headroom;
  page.close() does NOT drop the WebRTC transport (close the browser
  context to trigger forfeit detection).

### Session 4 — 2026-07-04 — Two new maps + rotation

**Shipped:** two new 20×12 arenas — **Overgrown Suburb** (green floor,
corrugated-roof building clusters, two overgrown-car COVER_LOW
centerpieces, open mid with 18-tile street sightlines) and **Scrapyard**
(dark-green floor, red corrugated container-wall maze, garbage-pile
cover, containers + scrap cars, central 4-entrance shotgun room, max
8-tile sightlines) — plus round-robin map rotation. Fresh matches
advance a global cursor over registry order; a rematch plays the map
AFTER the one just played, pinned into PostMatchState at match end and
shipped as `MatchResult.nextMapName` so the results screen's new
"NEXT MAP: X" line (under the outcome banner) can never disagree with
the map the rematch actually starts on. `FORCE_MAP=<name>` pins every
match for manual smokes (mirrors FORCE_EVENT; invalid names warn and
fall back).

**Theming plumbing:** map JSON gained optional `theme` +
`decorations[]` fields (shared type is data-only; the server ignores
both). All pure auto-tiling/theming logic moved out of MapRenderer into
Phaser-free `client/src/rendering/map-themes.ts`: per-theme floor/cover
variant pools, wall styles (brick perimeter, iron fence, and a new
roof tiler — top-cap/fill/bottom-cap by N/S neighbor mask, dark and
red (+8 frame offset) sets), and `getTheme()` with wasteland fallback
for absent/unknown ids. Decorations are cosmetic sprites centered on
tile rects whose underlying tiles carry collision; unknown texture
keys are skipped; cells under a decoration render plain floor.
Validator gained a decoration bounds/size check.

**Design decisions made in-session (roadmap was silent or amended):**
- The Background_Green/Dark-Green sheets are exact layout twins of the
  bleak-yellow sheet, so floor theming is a texture swap reusing the
  same variant/scorch frame indices.
- `Tiles/Buildings/*` (side-view facades) didn't fit top-down wall
  clusters; the Roof tileset is what buildings/containers read as from
  above, so both new wall styles come from it. Containers-as-walls per
  the spec became red corrugated wall texture + real container sprites
  as cover decorations.
- COVER_LOW blocks movement AND bullets (single shared `solid` grid),
  so any sightline break is also a route break — both maps were
  authored with a scratch checker (BFS reachability incl. every
  walkable cell, per-row/col sightline caps, spawn openness ≥3 open
  cardinal neighbors, decoration/cover alignment, dead-end count).
  These maps are the first real users of COVER_LOW.
- Cover cells (and inner walls, as before) now get a floor underlay —
  garbage-pile frames have soft transparent edges.
- Decoration sprites overflow their collision rects by up to ~14px
  (art is not tile-quantized); documented as reads-as-clutter, favors
  the shooter.
- Rotation is intentionally split: global cursor for fresh matches,
  per-chain pinning for rematches (concurrent matches can't steal the
  promised next map).

**Verified:** 498 unit tests green (typecheck + lint clean; one
non-reproducible failure right after killing dev servers — suspected
port contention with the geckos integration tests — followed by four
consecutive green runs), full Playwright suite green (the desktop-
firefox touch-emulation test flaked once and passed in isolation +
on rerun; known-unreliable per its own comments). Throwaway two-client
Playwright drive-throughs (spec deleted after): rotation smoke (fresh
match on Wasteland → suburb; forfeit → results screen shows VICTORY +
"NEXT MAP: SCRAPYARD"), and per-map render/movement smokes via
FORCE_MAP on both new maps — desktop + mobile-landscape screenshots
eyeballed, WASD wandering, zero page errors.

**Known issues / notes for later sessions:**
- Suburb vs Scrapyard floor greens are closer in tone than the sheet
  names suggest once the CRT/lighting wash is applied; identity comes
  mostly from wall color + clutter. If the group can't tell them apart
  at a glance, swap scrapyard floor variants toward garbage-accent
  frames (theme pools are tunable in map-themes.ts).
- Scrapyard has one intentional ambush nook at (14,3) (behind the
  gray scrap car). Watch whether it plays as a camp spot.
- Smokes covered ~40s of play + forfeit, not a full 3-minute match on
  the new maps; kill/respawn on them is exercised only by unit-level
  spawn validation. First group playtest should watch respawns.
- Session 5 (KOTH) needs `kothHills` positions added to ALL THREE map
  JSONs — pick hill spots when authoring that; the scrapyard center
  room + suburb mid-street are obvious candidates.
- e2e note: the geckos disconnect → forfeit → results transition takes
  ~30s after a hard page close (WebRTC detection latency); any future
  spec waiting on ResultsScene needs a 60s allowance.
- **Deploys NOT run this session:** the auto-mode permission classifier
  blocked both production deploys (Firebase hosting + GCE ssh). All
  commits are pushed to origin/main and the client bundle builds clean —
  run the two deploy commands from CLAUDE.md → Deployment in an
  interactive session, then health-check + load the web app.

### Session 3 — 2026-07-04 — Mutator expansion

**Shipped:** the final-minute event system generalized into a two-slot
mutator scheduler (`server/src/game/match.ts`): one mid-match activation
at a random time in the 40–70% elapsed window (rolled from the match's
injectable rng at the COUNTDOWN→ACTIVE transition) plus the guaranteed
final-minute event on its unchanged 65s/60s thresholds, each with a 5s
warning banner, no repeats per match. Pool grown from 4 to 8:
`big_heads` (hit-validation AABB ×1.5 server-side + aim-line preview,
sprite render ×1.3), `vampire` (attacker heals 50% of damage dealt —
rifle, pellets, grenades, fire-breath; never self; capped at maxHealth),
`turbo_grenades` (throw speed ×1.5 incl. the client preview arc, +1
grenade per 5s up to max), `second_wind` (1.3× speed for 3s after
respawn via a new `secondWindTimer` on PlayerState, applied through the
shared `mutatorsToMovementModifiers`). All constants in
`shared/src/config/game.ts` under `MUTATORS`.

**Design decisions made in-session (roadmap was silent):**
- **Mutators stack.** The 70% window edge (51.9s remaining at
  TIME_LIMIT 173) lies inside the final minute, so both slots can be
  live at once — active state is an ordered list (`activeMutators` in
  the gameState message, replacing `activeEvent`). Both run to match
  end. Composition rules: speed multipliers multiply (super_speed ×
  second_wind = 2.08×), grenade regen takes the fastest active interval,
  grenades_only's gun gate wins over infinite_ammo, low_health's 1-HP
  cap makes vampire moot but harmless. HUD label joins both names
  ("BIG HEADS + SUPER SPEED").
- `FinalMinuteEvent` renamed to `MutatorId`, now derived from
  `MUTATORS.POOL` in shared config (no legacy alias, same as the
  Session 1 `GUN`→`WEAPONS` migration).
- `server:eventWarning`/`server:eventStart` gained `isFinalMinute` —
  drives the "MUTATOR INCOMING" vs "FINAL MINUTE INCOMING" headline and
  lets the clock-alignment regression test filter out the mid-match
  start. Wire type names kept (`eventWarning`/`eventStart`).
- `FORCE_EVENT` still pins the FINAL-MINUTE pick (its old semantics —
  the matchmaking clock test depends on it); new `FORCE_MIDMATCH_MUTATOR`
  pins the mid-match pick. The random mid-match draw excludes
  FORCE_EVENT's value so a forced final pick can't be stolen.
- second_wind client/server parity: the boost timer is broadcast in
  every snapshot and fed to the same shared modifier function on both
  sides. Prediction consumes the last-snapshot value, which matches the
  server's processing order exactly in steady state; at the expiry
  boundary the worst-case divergence is ~RTT/2 of 30% extra speed
  (a few px, absorbed by the smooth-correction lerp, far under the 50px
  snap threshold). Unit tests assert the 1.3× movement server-side and
  the modifier composition shared-side.
- big_heads scales the victim-hitbox term everywhere hits are
  validated (rifle rays, shotgun pellets through lag-comp rewind,
  fire-breath cone) but NOT movement collision or pickup radii, per the
  spec's "movement untouched".
- `ice_rink` stretch skipped, as the roadmap sanctioned — an
  acceleration/friction model can't be expressed in the current shared
  `calculateMovement` without forking prediction physics (the
  rubber-banding landmine the spec warned about).

**Verified:** 475 unit tests green (three consecutive full runs), full
Playwright e2e suite green (desktop-chromium/firefox + mobile-landscape),
plus a throwaway two-client Playwright drive-through with
`FORCE_MIDMATCH_MUTATOR=big_heads`: mid-match banner fired ~59% elapsed,
both clients synced the HUD label, sprites visibly scaled on both ends,
no snap/rubber-banding while moving, screenshots eyeballed. Spec deleted
after the run.

**Known issues / notes for later sessions:**
- Mutator activation VFX is the existing flash + banner + horn; no
  per-mutator world VFX (e.g. no heal number popups for vampire). Cheap
  polish later — HealFlash exists and could fire on vampire heals.
- The mid-match roll is uniform per match; across a rematch session the
  same mutator can recur match-over-match (only within-match repeats are
  prevented). If the group notices, add a per-pairing recent-mutator
  memory in a later session.
- A stray Vite dev server on 5173 hijacked e2e AGAIN this session —
  killed PID before the suite. The gotcha note in Session 2's log
  stands.

### Session 2 — 2026-07-04 — Match awards + persistent rivalry stats

**Shipped:** end-of-match awards (all 8 from the spec, incl. Tourist —
distance tracking turned out to be one `Math.hypot` per processed input in
the movement loop), computed in `server/src/game/awards.ts` and shipped in
`MatchResult.awards`; persistent lifetime stats + head-to-head records in
`server/src/persistence/persistent-stats-store.ts`
(`server/data/persistent-stats.json`, `DATA_DIR` env override, gitignored,
temp-file + rename writes queued on a promise chain — match-end path never
touches fs synchronously); results screen renders the top-3 award rows and
the amber "ALL-TIME: RYAN 14 - 9 DAVE" rivalry line, verified on desktop +
mobile-landscape viewports via a throwaway Playwright drive-through.

**Design decisions made in-session (roadmap was silent):**
- `PlayerStats.grenadeKills`/`shotgunKills` were replaced by a
  `killsByWeapon: Record<KillWeapon, number>` (runtime key list
  `KILL_WEAPONS` in shared config) so lifetime per-weapon kills and
  Session 6's axe come free. `KillWeapon` moved semantics: still the same
  union, now with a runtime companion list.
- Award ties: an award needs a **strict maximum** — a tie means nobody
  earns it (deterministic without inventing an arbitrary winner). Also
  Sharpshooter requires ≥1 hit, and Spray & Pray gained the same 10-shot
  minimum as Sharpshooter.
- Awards are computed inside `DeathmatchMode.getResults` via the pure
  `computeAwards()` (future modes just call it); the rivalry record is
  attached afterwards by `MatchmakingManager.onMatchEnded`, the only
  component with store access. `MatchResult.rivalry` is null for non-1v1.
- **Forfeit fix:** a match that ends because the opponent disconnected now
  awards the win to the player who stayed, overriding the scoreboard —
  otherwise a leaver who was ahead would bank a now-persistent win.
- Draws are fully plumbed + tested in persistence, but currently
  unreachable in DM play (`determineWinner`'s arbitrary tie-break —
  Session 5 fixes that and awards/overtime will just work).
- Rivalry line uses a plain "-" instead of an em dash (Press Start 2P
  glyph coverage).
- Head-to-head pairs are only recorded for exactly-2-player matches.

**Fixed in passing:**
- Session 1's last commit left `pnpm lint` red: the Playwright
  `_fixtures` fix introduced empty destructuring patterns
  (`no-empty-pattern`) in `e2e/tests/character-select.test.ts` — now
  suppressed with targeted disables (Playwright forces that shape).

**Known issues / notes for later sessions:**
- Lobby leaderboard (stretch goal) skipped — the store already has the
  data (`getLifetime`); a `/stats` HTTP endpoint or lobby panel is a
  cheap follow-up.
- **Dev-loop gotcha discovered:** `@shared/game` resolves to `dist/` at
  runtime (server tsx + Playwright webServer). After editing shared
  source, run `pnpm --filter @shared/game build` or dev/e2e behavior
  won't change. Vitest aliases to src and is unaffected.
- e2e teardown of any test that reaches GameScene records a real
  (forfeit) match into the server's store — harmless locally (data dir
  is disposable), but don't point a dev server's DATA_DIR at the
  production file.
- Persistence is keyed by lowercased nickname — friends changing
  nicknames fork their history; fine for the <10-player use case.

### Session 1 — 2026-07-04 — Weapon system + Shotgun + health pickups

**Shipped:** generic weapon system (`WEAPONS` frozen record in
`shared/src/config/game.ts`, `GUN` fully migrated to `WEAPONS.rifle`, no
legacy alias), Shotgun as a contested center-map power weapon with
"SHOTGUN INCOMING" banner + down-pitched horn, Bandage pickups on both
map edges, HUD shell indicators, held-overlay/racking animations, and
deterministic pellet spread (`shared/src/utils/pellet-spread.ts`,
mulberry32 seeded by the firing input's sequence number).

**Design decisions made in-session (roadmap was silent):**
- `WeaponDef` gained a `fireCooldown` field — the 0.6 s pump-racking is a
  between-trigger-pulls delay, which none of the spec'd fields could
  express. Rifle: 0.
- Special ammo is two fields on PlayerState: `specialAmmo` (mag) +
  `specialReserve`. Rifle `ammo` is never touched while the shotgun is
  held, so revert is lossless.
- Weapon pickups start the match INACTIVE on their full 30 s respawn
  timer, so the first drop gets the same pre-announcement as every
  respawn (also stops spawn-camping mid at the opening whistle).
- Shotgun auto-reloads when the mag empties (there is no switch key — a
  dead trigger would strand the player), and picking up a second shotgun
  while holding one refreshes shells to full 8.
- Death drops the shotgun; you respawn on the rifle.
- The infinite_ammo final-minute event pins the shotgun mag too — the
  holder keeps it until match end (consistent with the event's promise).
- Accuracy bookkeeping: one blast = 1 shot fired, 1 hit if ≥1 pellet
  lands (else the shotgun would wreck the accuracy stat / Session 2's
  Sharpshooter award).
- Kill-feed weapon union became shared `KillWeapon`; `PlayerStats` gained
  `shotgunKills` now so Session 2's Buckshot Barber can consume it.

**Fixed in passing:**
- Pre-existing double-count: every kill incremented `PlayerState.deaths`
  in BOTH `CombatManager.applyDamage` and `Match.onKill` (surfaced by the
  multi-pellet kill test). `onKill` now owns the counter.
- Removed dead `Match.tryCollectPickup` (no callers).
- Pre-existing lint error (NBSP inside a lobby-scene comment) and a
  pre-existing Playwright collection error in
  `e2e/tests/character-select.test.ts` (`_fixtures` positional arg —
  newer Playwright requires destructuring) that had the whole e2e suite
  failing before any test ran.

**Known issues / notes for later sessions:**
- Bruce and Frost Wizard have `hasGun: false`, so they show no held
  shotgun overlay (same as the rifle today). Pellets/SFX still fire.
- Shotgun pellet trails reuse the rifle tracer visuals; the extracted
  `shotgun-bullet.png` is loaded (`'shotgun-bullet'` texture) but not yet
  wired into a distinct trail renderer. Cosmetic only.
- `server/src/game/player-manager.ts` is dead code (only its test
  imports it) and duplicates reload/respawn logic — candidate for
  deletion in a cleanup pass.
- Tuning untouched from the spec (6 pellets, 8→3 dmg over 32→180 px,
  mag 2, 0.6 s rack, 1.5 s reload, 8 shells, 30 s respawn, bandage +30 HP
  / 20 s). Playtest with the group before tweaking.

### Session 0 — 2026-07-03 — Planning
- Reviewed game for repetitiveness causes; wrote this roadmap.
- Inventoried the asset pack: PNGs live only inside the zip
  (`PostApocalypse_AssetPack_v1.1.2.zip`); extracted folder is GIF previews.
- Confirmed pack support for: shotgun/pistol (full overlay + pickup + HUD
  art), bandage/first-aid, Zombie_Big, Zombie_Axe (with thrown-axe
  projectile sheets), Helmet variant, punch melee, 2 new floor tilesets,
  buildings/containers/vehicles for cover, hit-splash effects.
- No code changes.
