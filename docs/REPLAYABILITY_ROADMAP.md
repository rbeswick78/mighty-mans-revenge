# Replayability Roadmap — Multi-Session Build Plan

This document is the contract for a multi-session effort to make Mighty Man's
Revenge worth playing over and over. **Read this whole file at the start of
every session.** It contains the plan, locked design decisions, the asset
manifest, the end-of-session ritual, and a running session log.

- **Status:** Sessions 1–13 complete (weapons, awards + rivalry stats, mutator expansion, maps + rotation, KOTH + overtime, characters + stat identities, Gun Game + pistol + punch, polish backlog, first playtest response, Rivalry Sets + Revenge Drafts, solo Practice vs Rusty, streak + payback callouts, selectable Rusty difficulty). **The first group playtest happened** — it surfaced two bugs and one feature request (Session 9) but produced NO balance verdicts, so tuning (pistol/punch/RUNG_KILLS, Session 6 character stats) remains untouched and the watch-item list carries forward to the next group night.
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

| #   | Title                                           | Fun payoff                                                     | Status                |
| --- | ----------------------------------------------- | -------------------------------------------------------------- | --------------------- |
| 1   | Weapon system + Shotgun + health pickups        | Fights stop being identical; map control begins                | **DONE** (2026-07-04) |
| 2   | Match awards + persistent rivalry stats         | Bragging rights: the friend-group replay engine                | **DONE** (2026-07-04) |
| 3   | Mutator expansion                               | Matches stop repeating; chaos moments                          | **DONE** (2026-07-04) |
| 4   | Two new maps + rotation                         | New spaces to master                                           | **DONE** (2026-07-04) |
| 5   | King of the Hill + overtime                     | A second way to play; no more anticlimactic ties               | **DONE** (2026-07-04) |
| 6   | New characters + stat identities                | Counterpicks and mains                                         | **DONE** (2026-07-04) |
| 7   | (Stretch) Gun Game + Pistol + melee             | The party mode                                                 | **DONE** (2026-07-04) |
| 8   | Playtest response + polish backlog              | The accumulated small stuff, cleared before group night        | **DONE** (2026-07-04) |
| 9   | Playtest response #1: two bugs + map/mode draft | The game respects your pick — and lets you pick the arena      | **DONE** (2026-07-05) |
| 10  | Rivalry Sets + Revenge Drafts                   | Every rematch becomes a round with stakes and comeback control | **DONE** (2026-07-11) |
| 11  | Practice vs Rusty                               | The game is playable on demand, even when no friend is online  | **DONE** (2026-07-11) |
| 12  | Streaks, Payback + Shutdowns                    | Every kill builds a story and a reason to settle the score     | **DONE** (2026-07-11) |
| 13  | Rusty Difficulty                               | Solo practice stays welcoming, challenging, and worth mastering | **DONE** (2026-07-11) |

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
  - _Sharpshooter_ — best accuracy (min 10 shots fired)
  - _Spray & Pray_ — most shots fired with accuracy < 25%
  - _Demolition Man_ — most grenade kills (≥1)
  - _Buckshot Barber_ — most shotgun kills (≥1; from Session 1's attribution)
  - _Untouchable_ — longest kill streak (≥3)
  - _Pincushion_ — most damage taken
  - _Pin Puller, No Payoff_ — ≥3 grenades thrown, 0 grenade kills
  - _Tourist_ — most distance traveled if cheap to track, else drop
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
  `persistent-stats.json`). New award: _Bare Knuckles_ — most punch
  kills (≥1).
- **Punch animations are body-level states** (unlike gun overlays):
  `CharacterDef` gains `attackFrames`/`attackFrameCount`; every roster
  character has pack attack sheets (Main Punch Sheet4 — with-hands
  variant; Zombie*Small First-Attack Sheet4; Zombie_Big Sheet8;
  Zombie_Axe Sheet7; Frost Wizard reuses Main). Anims normalize to a
  ~350ms play regardless of frame count. While `weaponId === 'punch'`
  the gun overlay hides. Pistol gets held overlays
  (`pistol*{dir}\_{hold,shoot}`, Mighty Man only — the only
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

- rotation + registry entries; `GameMode.onKill(…, weapon)` signature
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

- [x] Pistol fires semi-auto through lag comp with falloff; reload +
      HUD ammo row work; Mighty Man overlay animates; kills attribute
      to `'pistol'`. Rifle/shotgun behavior unchanged (regression).
- [x] Punch validates through the lag-comp rewind: a rewound graze hits
      Bubba's 30px box and misses a 24px character; walls block it;
      `maxRange` caps it; one damage application per victim per swing;
      a two-victim arc damages both; Iron Hide halves it; kills
      attribute to `'punch'`.
- [x] Full Gun Game match start→results: rung-weapon kills advance per
      `RUNG_KILLS`; wrong-weapon/ability/self kills don't; first
      through the ladder wins immediately; timer expiry crowns the
      highest score; an equal top score enters overtime fought with
      rung weapons; loadout enforcement survives death/respawn/
      overtime resets.
- [x] In Gun Game: shotgun/ammo/grenade pickups never spawn (bandages
      do); `grenades_only`/`infinite_ammo` never roll; grenade rung
      refills; no rung can strand a player without a usable attack.
- [x] Rotation cycles DM → KOTH → GUN GAME (rematch pin included);
      `FORCE_MODE=gun_game` pins; character select + results label the
      mode; results scoreboard/awards render (incl. Bare Knuckles).
- [x] HUD desktop + mobile landscape: ladder position ("PISTOL 1/2",
      rung n/5) always legible; misleading ammo rows hidden on
      grenade/punch rungs; pistol/punch SFX distinct.
- [x] Old `persistent-stats.json` (pre-pistol/punch) loads cleanly with
      new weapon keys defaulted to 0.
- [x] Deterministic unit tests ≥90% on new server/shared logic; DM/KOTH
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

## Session 8 — Playtest response + polish backlog

**Goal:** clear the accumulated cross-session polish backlog so the first
group playtest sees the fullest version of the game. **Balance tuning is
explicitly OUT of this session** — no playtest has happened yet (Session 7
only reached production at the start of this session), so every Gun Game
number (pistol/punch damage, `RUNG_KILLS`) and every Session 6 character
stat stays at its spec value. Changing them now would be guessing twice;
the next session tunes off real group-night data.

**Locked design decisions**

- **Pistol as a DM/KOTH map pickup** (the Session 7 "cheap follow-up"):
  - `PickupType.WEAPON_PISTOL` (`'weapon_pistol'`) + `PickupSpawnType`
    union entry. `WEAPONS.pistol.pickupAmmo` 0 → **36** (mag 12 + reserve
    24 on pickup, mirroring the shotgun's mag-plus-reserve split).
  - **Sidegrade, not power weapon:** spawns ACTIVE at match start (unlike
    the shotgun's announced 30s-delayed first drop), respawns on
    `PICKUP.WEAPON_RESPAWN_TIME` (30s), and is **never announced** — the
    "INCOMING" banner stays reserved for the shotgun so it keeps meaning.
  - One pistol spawn per map, placed away from the center shotgun so it's
    a consolation route, not a mid-fight bonus. Exact tiles picked against
    each map's collision grid in-session.
  - Walkover while holding another special: **last-picked-up wins** (the
    slot is auto-equip by contract; picking up the same weapon refreshes
    ammo to full, same as shotgun-on-shotgun).
  - Gun Game untouched: `isPickupTypeEnabled` is already bandage-only, so
    the pistol pickup never exists there. HUD pistol ammo row (Session 7)
    already renders outside Gun Game — no HUD work needed.
- **Hill Hog award** (Session 5 leftover):
  - `PlayerStats.hillSeconds` + `StatsTracker.recordHillSeconds`.
    Accrues in `KothMode.onTick` for **every living player standing in
    the live hill, contested time included** — deliberately NOT
    sole-occupancy time, which integer-rounds to `score` and would just
    re-award the winner. Hill Hog rewards the brawler who lived on the
    hill even if they never held it alone.
  - Award id `hill_hog`, display name "Hill Hog", min
    `HILL_HOG_MIN_SECONDS: 10`, ranked by hillSeconds (strict max, ties
    disqualify, like every award). Priority slot: right after
    `sharpshooter`, so it reliably surfaces on KOTH results; in DM/Gun
    Game nobody accrues, so the threshold filters it out.
- **Lobby leaderboard** (Session 2 stretch, still unclaimed):
  - **Over geckos, not HTTP.** The lobby already connects on scene
    create, and an HTTP endpoint would need HTTPS termination on the VM
    (the production client is served over HTTPS — mixed-content rules
    block `http://…:3001`). New reliable `server:leaderboard` message:
    top-5 lifetime players by wins (tie-break kills desc, then nickname
    asc), entries `{ nickname, wins, losses, draws, kills, matches }`.
    Sent to a connection on open and rebroadcast to everyone after each
    match's stats are recorded. `PersistentStatsStore.getTopPlayers(n)`
    provides the data.
  - Client: small "ALL-TIME TOP 5" panel in the lobby (MENU_FONTS
    styling), hidden when the store is empty. New players appear after
    their first match.
- **Overtime music** (Session 5 leftover): on `server:overtimeStart`,
  after the existing deep-horn sting, play the **final 30s of the
  gameplay track** (`music-gameplay` with `seek = duration − OVERTIME
length`) — overtime is 30s, so the track's already-tuned finale lands
  exactly at 0:00 again. No new audio file; a kill just stops it early
  like any match end.
- **Real melee/axe SFX** (Session 7 leftover): the pack ships no audio
  and third-party files are a license headache, so the four new sounds
  are **procedurally synthesized** 16-bit WAVs from a deterministic
  seeded script checked in at `client/scripts/gen-sfx.mjs`
  (regeneration is exact): `punch-whoosh` (band-passed noise sweep),
  `punch-impact` (130→55Hz thump + click, replaces the slowed gun-shot),
  `axe-whoosh` (rotation-modulated noise — reads as a spinning blade,
  replaces the pitched grenade-throw), `axe-chop` (thunk + crack on
  `axeResolved`, which previously had no landing sound). SOUND_MAP gains
  matching keys; the Session 7 rate/detune stand-in calls are removed.
- **Jack's no-axe body** (Session 6 leftover): extract the pack's
  `Zombie_Axe/No-Axe` idle (Sheet6) / walk (Sheet8) / First-Attack
  (Sheet7) sheets ×4 directions — frame counts and dims match the
  with-axe sheets exactly, so this is a pure texture-prefix swap.
  `CharacterDef` gains an optional alt-body field (data-only; server
  ignores it); BootScene loads a parallel `jack-noaxe` anim set; the
  renderer swaps prefix while `abilityCooldownSeconds > 0` (the axe is
  in flight or "regrowing" — state already broadcast, zero wire
  changes). The pack's Taking-Axe recovery flourish (Sheet3) is skipped
  in v1.
- **Dry-fire fix** (pre-existing, noted in Session 7): the out-of-ammo
  beep reads the rifle mag even while a special weapon is held — gate it
  on the held weapon's actual mag instead.

**Type/plumbing checklist:** `PickupType.WEAPON_PISTOL` +
`PickupSpawnType`; `WEAPONS.pistol.pickupAmmo: 36`; pistol spawn in all
three map JSONs; `PlayerStats.hillSeconds`; `hill_hog` in
`AWARD_DEFS`/`AWARD_IDS` + `HILL_HOG_MIN_SECONDS`;
`server:leaderboard` in the ServerMessage union +
`LeaderboardEntry` shared type; `CharacterDef` alt-body field (Jack
only); new SOUND_MAP keys. No PlayerState/movement/physics changes —
zero rubber-banding surface.

**Assets:** `Objects/Pickable/Pistol.png` → `pickups/pistol.png`;
`Enemies/Zombie_Axe/No-Axe/*_{Idle-Sheet6,Walk-Sheet8,First-Attack-Sheet7}`
×4 dirs → `enemies/zombie-axe-noaxe_{dir}_{idle,run,attack}.png`;
4 generated WAVs in `audio/`. ATTRIBUTION.md updated (generated WAVs
noted as original, not pack assets).

**Acceptance criteria**

- [x] Pistol pickup spawns on all three maps in DM/KOTH (active at
      start, silent 30s respawn, never announced), auto-equips with
      12+24, refreshes on re-grab, replaces a held shotgun (and vice
      versa); never exists in Gun Game; HUD row and kill attribution
      work unchanged (regression).
- [x] Hill Hog: hillSeconds accrues for every living occupant incl.
      contested time, not for dead players, not outside KOTH; award
      appears on KOTH results at ≥10s with a strict max; DM/Gun Game
      results never show it; old persistent-stats files unaffected
      (hillSeconds is match-scoped only).
- [x] Lobby shows the all-time top-5 panel (desktop + mobile
      landscape); updates after a match ends without reconnecting;
      hidden on an empty store; leaderboard message flows on connect.
- [x] Overtime plays the gameplay track's final 30s after the sting and
      ends cleanly on kill or draw. (Logic shipped; not live-verified —
      needs a 173s tie. See session log.)
- [x] Punch whoosh/impact, axe throw, and axe landing play the new
      generated SFX (stand-in rate/detune calls removed); dry-fire beep
      reads the held weapon's mag.
- [x] Jack renders the no-axe body (idle/run/attack) exactly while his
      ability cooldown runs, for local AND remote clients; with-axe
      body returns at cooldown end; no other character affected.
- [x] Deterministic unit tests ≥90% on new server/shared logic; full
      regression suites green; no shared-physics changes.

**Parallelizable workstreams:** (a) shared config/types/maps + shared
tests (must land first — single writer for `game.ts`); (b) asset
extraction + SFX generation; (c) server — pickup case, hill seconds,
award, store top-N, leaderboard broadcast + tests; (d) client — SFX
wiring, overtime music, no-axe swap, lobby panel, pickup texture,
dry-fire fix. (c) and (d) are independent once (a) and (b) land.

---

## Session 9 — Playtest response #1: two bugs + map/mode draft

**Goal:** respond to the first group playtest (2026-07-05). The notes
surfaced two bugs — the lobby's searching text stamps over the callsign,
and players render as the wrong character from the second match onward —
and one feature request: let the players pick the map and the mode
pre-match, with a random flourish deciding who picks first.

**Balance: explicitly untouched.** The playtest notes contained ZERO
verdicts on the tuning watch items (punch-rung standoffs, grenade-rung
drag, Jack's 8-frame walk feel, the Scrapyard (14,3) ambush nook, the
two green map floors, the 4 generated SFX, overtime music at 0:00) — so
every number in `shared/src/config/game.ts` keeps its spec value and the
watch-item list carries forward verbatim to the next group night. Ask
for those verdicts explicitly next time.

**Locked design decisions**

- **Lobby searching-state overlap (bug):** `LobbyScene` draws
  "SEARCHING FOR OPPONENT" at panel y=70 — inside the callsign input box
  (y 46–82; the nickname text centers at y=64) — and never hides the
  name-entry UI when the search starts. Fix by swapping the panel
  wholesale: hide the callsign label, input-box graphics, nickname text,
  AND the transparent HTML `<input>` overlay (its Phaser DOM wrapper —
  blur alone leaves an invisible focusable element over the panel) while
  searching; restore all of it on stop/cancel/disconnect. No layout
  redesign.
- **Wrong character rendered after the first match (bug):** root cause
  is stale client prediction state, not the select flow.
  `NetworkManager.localPlayerState` is only nulled on `disconnect()`,
  and `applyReconciledLocalState` never forwards `characterId` — so from
  the SECOND match on one connection (rematch or re-queue), the local
  player keeps the previous match's characterId forever. The renderer
  constructs from it (wrong body — exactly what the group saw switching
  to Jack/Bubba after match 1), and `sendInput` feeds the stale id into
  `playerMovementModifiers`, so prediction runs at the old character's
  speed while reconciliation uses the server's — permanent
  jitter/rubber-banding when the speeds differ (Bubba→Frost Wizard is a
  27% mispredict). Abilities were always right (server-authoritative).
  Session smokes never caught it because they only ever play the FIRST
  match on a fresh page. Fix, belt and braces:
  - **Per-match reset on `server:matchFound`:** null `localPlayerState`,
    fresh prediction + interpolation buffers, clear
    remotePlayerIds/latestGrenades/latestAxes. (Also fixes latent
    staleness: ghost grenades/axes rendered at new-match start, dead
    interpolation samples.)
  - `applyReconciledLocalState` forwards
    `characterId: serverState.characterId` (server-authoritative,
    immutable per match).
  - `ClientPlayerManager.updatePlayers` destroys + recreates any
    renderer whose constructed characterId no longer matches the state
    (`PlayerRenderer` gains `getCharacterId()`). Also retires the
    first-frame `?? 'mighty_man'` fallback trap in game-scene.ts — its
    comment claimed "one tick of a placeholder sprite" but construction
    was permanent; correct the comment.
- **Map & mode draft (feature):** every real match — fresh AND rematch —
  opens with a pre-match draft replacing the blind rotation:
  - Server rolls **who picks first** (injectable RNG for tests). The
    first picker claims a category _implicitly by picking_: they click
    EITHER a map card OR a mode card — no separate "choose your
    category" step (one action instead of two; the choice of category is
    the choice). The other player then picks from the remaining
    category.
  - **Lives in `MatchmakingManager`, BEFORE `Match` construction** —
    Match takes mapData/gameMode in its constructor (map manager,
    pickups, mode instance all wire off them), so drafting inside Match
    would mean rebuilding managers post-hoc. New `DraftState` keyed by
    the future matchId (generated up front so `matchFound.matchId`
    correlates), registered in `playerMatchMap` so queue guards and
    disconnect routing work. `Match` is untouched; `server:matchFound`
    keeps its exact meaning: "match exists; here are the FINAL map+mode"
    — the character-select scene needs zero changes.
  - **Wire:** `server:draftState` — full snapshot broadcast per tick
    while drafting (same cadence contract as characterSelectState):
    players, firstPickerId, currentPickerId, mapPick/modePick (null
    until chosen), mapOptions/modeOptions, pickDeadlineMs. Plus
    `client:draftPick` `{ category: 'map'|'mode', value }`; the server
    validates turn + category availability + value against options and
    silently ignores invalid picks.
  - **Timeouts** (`DRAFT` block in shared config): first pick 20s
    (includes the client spectacle), second pick 15s. Expiry = server
    auto-picks uniformly random category+option (mirrors select
    auto-lock) so an AFK player can't stall the match.
  - Disconnect during draft = tear down the DraftState, send
    `opponentDisconnected` to the rest, return them to lobby (same
    contract as post-match state).
  - **`FORCE_MAP` / `FORCE_MODE` skip the draft entirely** (map/mode
    resolved by force + rotation exactly as today) — keeps every
    smoke/e2e pin working and doubles as the kill switch. The rotation
    cursors survive only for that path.
  - **Client:** new `DraftScene` between lobby/results and character
    select. Opens on the first `draftState` received (LobbyScene and
    ResultsScene both route there); transitions to CharacterSelectScene
    on `matchFound` (payload unchanged). The spectacle: "WHO PICKS
    FIRST?" — the two nicknames flash alternately, the ping-pong
    decelerating until it lands on the server-chosen first picker
    (~2.6s, `DRAFT.SPECTACLE_MS`), then the two option columns reveal
    (MAPS / MODES). Cards enabled only on your turn; a pick flips its
    column to a locked badge for both players; countdown ticks from
    pickDeadlineMs. Mobile landscape: two-column card grid inside the
    960×720 FIT canvas, tap targets comfortably >44px.
  - **Results screen:** the "NEXT: <MODE> ON <MAP>" teaser is replaced
    by a draft teaser ("NEXT: COIN TOSS PICKS WHO DRAFTS MAP + MODE") —
    a rematch's map/mode are no longer knowable at results time.
    `MatchResult.nextMapName`/`nextGameMode` stay populated (wire
    compat; the FORCE path still uses the pins) — the draft simply
    overrides them for real play.
  - **N-player:** first/second picker are 2 distinct random entrants;
    any further players would spectate the draft. No 2-player
    assumptions in DraftState (players array + two role ids).

**Type/plumbing checklist:** `DRAFT` frozen config block
(`shared/src/config/game.ts`); `client:draftPick` +
`server:draftState` in the discriminated unions
(`shared/src/types/network.ts`); GameManager routing case;
MatchmakingManager `DraftState` machinery + `handleDraftPick` +
tick-driven deadlines + seeded-RNG constructor injection; GameService
`draftState` event + `sendDraftPick`; new
`client/src/scenes/draft-scene.ts`; ResultsScene teaser text; e2e
fixtures walk the draft (or pin FORCE\_\*).

**Acceptance criteria**

- [x] Searching state never overlaps the callsign UI (desktop + mobile
      landscape); cancelling restores name entry fully (input focusable
      again).
- [x] Rematch/re-queue with a different character renders the correct
      body locally AND remotely, with zero reconciliation jitter from a
      stale speed multiplier. Unit tests: matchFound reset, characterId
      forwarding through reconciliation, renderer rebuild on
      characterId change.
- [x] Draft: full flow in both orders (first picker takes map / takes
      mode); auto-pick on first- and second-pick timeout; disconnect
      teardown; FORCE_MAP/FORCE_MODE skip; a rematch drafts again; the
      drafted map+mode are what the match actually plays. Deterministic
      unit tests (seeded RNG).
- [x] DraftScene spectacle lands on the server-chosen first picker;
      wrong-turn/wrong-category clicks do nothing; opponent's pick
      renders live; mobile landscape legible.
- [x] Full regression: typecheck/lint/unit/Playwright green; no
      shared-physics changes (the bug-2 fix touches prediction _state
      plumbing_, not movement math).

**Parallelizable workstreams:** (a) shared config/types (single writer
to game.ts/network.ts — lands first); (b) the two client bug fixes
(lobby-scene, network-manager/player-manager/player-renderer — lands
second since (c) and (d) touch neighboring files); (c) server draft
phase + tests; (d) client DraftScene + GameService plumbing + results
teaser. (c) and (d) are independent once (a)+(b) land.

---

## Session 10 — Rivalry Sets + Revenge Drafts

**Goal:** turn the strong individual-match experience into a compelling
"one more round" loop. Consecutive rematches become a first-to-3 set, and
the previous round's loser earns first pick in the next map/mode draft.

**Locked design decisions**

- Sets are session-scoped, not lifetime progression: leaving results,
  disconnecting during the next draft, or timing out dissolves the set.
- First to 3 wins clinches. Draws count as rounds played but award no set
  point. Accepting another rematch after a clinch starts a clean set.
- Fresh pairings and post-draw drafts keep the coin toss. After a decisive
  round, the loser gets first pick; this is explicit comeback agency, not
  a hidden weighting.
- Set state lives in `MatchmakingManager`, outside `Match` and every game
  mode. `MatchResult.rivalrySet` is a complete snapshot, so the client is a
  pure projector and all modes behave identically.
- Results combine the immediate set and lifetime rivalry on one compact
  line, name the next revenge picker, and relabel REMATCH as NEXT ROUND or
  NEW SET. Revenge drafts use a short dedicated reveal instead of the
  random ping-pong spectacle.

**Acceptance criteria**

- [x] Consecutive 1v1 rematches accumulate a deterministic first-to-3 set
      across every mode; draws do not grant a point.
- [x] A decisive round gives its loser first pick in the next real draft;
      fresh/post-draw drafts still use seeded randomness.
- [x] A clinch ships a champion, the results action becomes NEW SET, and
      accepting it resets the next round to a clean 0-0 set.
- [x] Leaving the rematch flow releases ephemeral set state; lifetime
      persistence remains unchanged.
- [x] Results and draft treatments fit desktop and mobile landscape, with
      Phaser-free formatting tests and server flow coverage.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 11 — Practice vs Rusty

**Goal:** remove the game's largest replayability dead end: needing a second
human online before any of its combat, characters, maps, or modes can be
played. A one-click solo practice match should exercise the real game rather
than becoming a parallel tutorial implementation.

**Locked design decisions**

- Rusty is server-authoritative and submits ordinary sequenced `PlayerInput`
  through `Match`, so movement, collision, combat, abilities, mutators, and
  mode rules remain identical to human play.
- Practice starts immediately from the lobby and skips the social map/mode
  draft. Rematches rotate directly through the promised next map and mode,
  while retaining the same ephemeral first-to-3 set stakes.
- Practice never writes lifetime stats, rivalries, or leaderboards. Beating a
  training opponent must not become the optimal way to farm social records.
- The bot uses deterministic collision-grid pathfinding, line-of-sight combat,
  range management, grenades, reloads, character abilities, Gun Game rung
  rules, and explicit KOTH objective play. Its tuning lives in the frozen
  shared `BOT` config.
- Synthetic bot identities use the `bot:` prefix and have no transport
  channel; outbound match broadcasts are intentionally discarded for them.

**Acceptance criteria**

- [x] A valid callsign can launch directly into character select against a
      named, already-locked Rusty without entering the human queue or draft.
- [x] Rusty moves around walls, aims, fires, reloads, throws/detonates
      grenades, uses abilities, plays every Gun Game rung, and captures KOTH.
- [x] One human rematch click starts the next practice round directly and
      preserves first-to-3 set scoring; leaving/timeout releases bot state.
- [x] Practice results are explicitly identified and never update persistent
      stats, rivalry records, or the public leaderboard.
- [x] Lobby and match flow pass browser smoke; typecheck, lint, all unit tests,
      production build, and Playwright pass.

---

## Session 12 — Streaks, Payback + Shutdowns

**Goal:** make the middle of a match tell a memorable story. The game already
has good kill impact and end-of-match awards, but consecutive kills and revenge
were invisible until results; live callouts turn those events into goals worth
chasing and moments worth talking about.

**Locked design decisions**

- Streak, ended-streak, and payback context are authored by `Match` and ride
  the existing reliable `server:playerKilled` event. The client never infers
  combat history from snapshots or timing.
- Payback means killing the opponent who most recently killed you. A shutdown
  means ending a 3+ kill life streak and takes presentation priority over a
  simultaneous payback or streak milestone.
- Local celebrations escalate at 2 (`ON A ROLL`), 3 (`RAMPAGE`), and 5
  (`UNSTOPPABLE`) kills. Thresholds live in shared `COMBAT_CALLOUTS` config.
- Callouts use a dedicated upper-map text lane. They cannot overwrite the
  shared event/ability banner used for mutators, overtime, and abilities.
- Only the killer gets a large celebration. The existing kill feed remains the
  compact source of truth for everyone else and suicides never celebrate.

**Acceptance criteria**

- [x] Every kill event carries the killer's post-kill streak, the victim's
      pre-death streak, and authoritative payback status.
- [x] Death resets the live streak while preserving longest-streak awards.
- [x] Pure client formatting covers streak escalation, payback, shutdown
      priority, remote kills, and suicides.
- [x] HUD callouts have an independent animation lane and clean themselves up.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 13 — Rusty Difficulty

**Goal:** keep the new solo loop useful after the first few rounds. A single
fixed opponent inevitably becomes either a wall for new players or solved by
experienced ones; three clear skill profiles let practice grow with the player.

**Locked design decisions**

- Rookie, Scrapper, and Warlord change only decision cadence and aim wobble.
  They never alter damage, health, speed, ammo, cooldown rules, or physics.
- Scrapper is the original Session 11 behavior and remains the default.
- The lobby exposes one compact cycling control below Practice, persists the
  choice locally, and sends it explicitly in `client:startPractice`.
- The server validates untrusted difficulty values and falls back to Scrapper.
  Practice rematches retain the selected profile for the entire Rivalry Set.
- `BOT_PROFILES` and `BotDifficulty` live in shared config; the controller
  consumes a profile without branching combat rules by difficulty.

**Acceptance criteria**

- [x] Lobby cycles Rookie → Scrapper → Warlord, persists the selection, and
      remains usable at desktop and mobile-landscape canvas sizes.
- [x] Difficulty travels on the discriminated network message and is validated
      server-side with a backward-compatible Scrapper default.
- [x] Rematches reconstruct Rusty with the same selected profile.
- [x] Warlord demonstrably fires more aggressively than Rookie in a real Match
      while both still use identical authoritative damage/physics paths.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session Log

### Session 13 — 2026-07-11 — Rusty Difficulty

**Shipped:** solo practice now has three persisted skill levels. Rookie uses
wider aim wobble and slower fire, grenade, ability, and path decisions;
Scrapper preserves the original balanced controller; Warlord tightens aim and
reacts more aggressively. The lobby's compact `RUSTY LEVEL` control cycles the
profiles without adding another scene, and the existing Practice CTA launches
the selected opponent immediately.

The selection crosses the normal client message boundary, is validated by
`MatchmakingManager`, stays attached to direct practice rematches, and is fed
into `BotController`. Profiles never touch shared player movement, weapon
damage, health, ammo, or cooldowns, so changing difficulty cannot create a
second combat ruleset.

**Verified:** typecheck and lint clean; production build green; all 780 unit
tests green. Focused controller/matchmaking/network coverage (52 tests) includes
a real Match comparison proving Warlord fires more shots than Rookie. Chromium
E2E cycles the persisted selector, launches Warlord, verifies Rusty arrives
locked, and reaches GameScene. The 21-case matrix passed every product flow; it
also exposed a pre-existing boot-race in the touch probe (listener attached to
BootScene), which now waits for LobbyScene and passes its focused retry.

**Carry-over:** profile numbers are first-pass accessibility tuning. Ask new
players whether Rookie gives enough breathing room and strong players whether
Warlord feels challenging without becoming laser-accurate.

### Session 12 — 2026-07-11 — Streaks, Payback + Shutdowns

**Shipped:** each authoritative kill now includes three pieces of live combat
context: the killer's current life streak, the streak just ended, and whether
the kill answered the opponent who last killed them. Local kills turn that
context into escalating `ON A ROLL`, `RAMPAGE`, and `UNSTOPPABLE` celebrations,
plus `PAYBACK` and high-value `SHUTDOWN` moments. Shutdown wins presentation
priority when one kill qualifies for several stories at once.

The HUD owns a dedicated callout object above the action, separate from the
existing event/ability banner, so rapid kills cannot erase a final-minute
mutator, overtime announcement, or ability activation. Existing kill audio,
heal flash, hit-stop, and kill feed stay intact underneath the new beat.

**Design decisions made in-session:**

- Streaks are per life and per match; they are not another persistence system.
  The existing `longestKillStreak` stat still powers end-of-match awards.
- Payback follows the most recent killer, not an arbitrary time window. This is
  deterministic for N-player matches and naturally produces back-and-forth in
  the current duel format.
- Large callouts are local-killer celebrations only. Showing every remote
  streak milestone full-screen would punish the player already losing.

**Verified:** focused Match/StatsTracker/client formatting coverage passes (180
tests); typecheck and lint clean; production build green; all 779 unit tests
green. The complete Playwright matrix passed with 12 tests and 9 expected
cross-project skips, including solo practice through live GameScene, two-client
draft/lock-and-go, Firefox smoke, and mobile-landscape canvas/touch coverage.

**Carry-over:** callout thresholds and wording are first-pass tuning. Watch
whether `ON A ROLL` at 2 feels too frequent in Gun Game and whether shutdown
should get a distinct sound after real group play. No combat balance changed.

### Session 11 — 2026-07-11 — Practice vs Rusty

**Shipped:** the lobby now offers `PRACTICE VS RUSTY`, which creates an
immediate authoritative match against a synthetic player. Rusty locks a random
available fighter and drives the same input queue humans use: collision-grid
BFS when sightlines are blocked, distance/strafe behavior in open fights,
weapon range and reload handling, grenades with remote detonation, abilities,
and Gun Game's weapon-specific rungs. In KOTH, Rusty prioritizes entering the
live hill and holds it while fighting rather than chasing kills off-objective.

Practice results carry an explicit `isPractice` flag. They keep the immediate
first-to-3 Rivalry Set loop, but bypass all persistent-stat and leaderboard
writes. Rusty auto-accepts rematches, so one human click launches the map/mode
rotation promised on results without a fake two-player draft. Disconnect,
lobby-return, and timeout paths release the synthetic identity and set state.

**Design decisions made in-session:**

- The bot is intentionally moderate rather than clairvoyant: visible aim
  wobble and fire cadence leave counterplay, while shared pathfinding and real
  inputs prevent rules drift.
- Practice is a full match, not a reduced tutorial. That makes every existing
  map, mode, mutator, pickup, character, and future shared mechanic useful to
  solo players automatically.
- Fullscreen remains a best-effort lobby enhancement. Browser-policy rejection
  is caught so it can never prevent either quick match or practice entry.

**Verified:** typecheck and lint clean; production build green; all 774 unit
tests green. The full Playwright matrix passed (11 passed, 7 expected project
skips), followed by a dedicated Chromium practice regression (1 passed) that
clicks the new lobby CTA, proves Rusty arrives locked, and reaches GameScene. A
real browser smoke launched into Scrapyard Deathmatch, showed
`RUSTY: LOCKED - JACK`, entered live play, and observed Rusty navigate, fire,
and score a kill through the normal death/respawn loop with a clean
post-polish console.

**Carry-over:** Rusty's initial tuning is deliberately conservative and needs
human playtest feedback before difficulty levels or aim/fire changes. The
Session 9 weapon/character/map watch list remains otherwise unchanged.

### Session 10 — 2026-07-11 — Rivalry Sets + Revenge Drafts

**Shipped:** consecutive rematches now form a first-to-3 Rivalry Set. The
authoritative matchmaking layer owns an ephemeral pairing score, attaches a
full set snapshot to every `MatchResult`, records draws as rounds without a
point, declares a champion at 3 wins, and starts a clean set when both players
accept another round after a clinch. A decisive round also gives its loser the
next draft's first pick (`firstPickerReason: 'revenge'`); fresh pairings and
draws keep the original seeded coin toss.

The client turns that state into a tighter social loop: results show the live
set score beside the all-time rivalry, name who gets the revenge pick, and use
NEXT ROUND / NEW SET actions. The next draft opens with a short REVENGE DRAFT
reveal for the previous loser instead of replaying fake-random theater.

**Design decisions made in-session:**

- First-to-3 is intentionally short enough for one hangout but long enough
  for a comeback. The value is centralized in `RIVALRY_SET`.
- Set state is deliberately not written to `persistent-stats.json`; the
  existing all-time line already owns durable history, while a set should
  feel immediate and disposable.
- FORCE_MAP/FORCE_MODE still bypass draft presentation for smoke tests, but
  results continue to score the set.
- A real forfeit counts as a round win (matching lifetime win semantics), so
  rage-quitting cannot erase the opponent's set point.

**Verified:** typecheck and lint clean; production build green; 765 unit tests
green (including a full server-driven 3-0 clinch, loser-first drafts each
round, and post-clinch reset); full Playwright suite green (11 passed, 7
expected project skips). Real two-client browser smoke through the dev server:
fresh coin-toss draft -> Gun Game match -> authoritative disconnect forfeit ->
results showed `SET R1: ALPHA 1-0 BRAVO (FIRST TO 3)`, the named BRAVO revenge
pick, lifetime record, and NEXT ROUND. Desktop 1280x720 and mobile landscape
844x390 screenshots were checked; the combined line and both buttons fit.

**Carry-over:** the Session 9 balance watch list remains unjudged. This
session changes no weapon, character, mutator, map, or mode tuning.

Append one entry per session. Include: date, what shipped (commits), design
deviations from this doc, known issues, tuning notes from play-testing.

### Session 9 — 2026-07-05 — Playtest response #1: two bugs + map/mode draft

**The first group playtest happened.** Its notes drove this whole
session: two bugs and one feature. It produced NO balance verdicts —
so, third session running, every tunable in `shared/src/config/game.ts`
keeps its spec value. The watch-item list (punch-rung standoffs,
grenade-rung drag, Jack's walk feel, Scrapyard (14,3) nook, floor
distinctness, the 4 generated SFX, overtime music at 0:00) carries
forward verbatim — ask for explicit verdicts at the next group night.

**Shipped:**

- **Lobby searching-overlap fix**: "SEARCHING FOR OPPONENT" was drawn
  at panel y=70 — inside the callsign input box (y 46–82) — with the
  name-entry UI left visible. The panel now swaps wholesale: label,
  input-box graphics, nickname text AND the transparent HTML `<input>`
  (its Phaser DOM wrapper — blur alone left an invisible tap-swallower
  over the panel) hide on search start, restore on stop/cancel/
  disconnect.
- **Wrong-character rendering fix** (the "Jack and Bubba show as a
  different character" note): root cause was NOT the select flow —
  `NetworkManager.localPlayerState` survives across matches (only
  nulled on disconnect) and `applyReconciledLocalState` never forwarded
  `characterId`, so from the SECOND match on one page load (rematch or
  re-queue) the local player rendered as their PREVIOUS character…
  and `sendInput` fed the stale id into `playerMovementModifiers`, so
  prediction also ran at the previous character's speed (hidden
  permanent rubber-banding — Bubba→Frost Wizard is a 27% mispredict).
  Abilities were server-side and always right, exactly as the group
  reported. Every prior session smoke missed it because smokes only
  ever play the FIRST match on a fresh page. Fixed belt-and-braces:
  per-match reset of ALL match-scoped client state on
  `server:matchFound` (also kills ghost grenades/axes/pickups at
  new-match countdown), `characterId` forwarded through
  reconciliation, and `ClientPlayerManager` destroys+rebuilds any
  renderer whose baked-in characterId disagrees with the state
  (retiring the "one tick of a placeholder" comment lie in
  game-scene.ts — construction was permanent).
- **Pre-match map/mode draft**: every real match — fresh AND rematch —
  now opens on a draft instead of blind rotation. Server rolls first
  picker (injectable RNG); first picker claims a category implicitly by
  picking a map OR a mode card; the other player picks the remaining
  category; then the Match is constructed exactly as before
  (`server:matchFound` still means "match exists; final map+mode", so
  CharacterSelectScene needed zero changes). Machinery lives in
  MatchmakingManager BEFORE Match construction, mirroring
  PostMatchState; per-tick unreliable `server:draftState` snapshots
  (characterSelectState cadence contract); 20s/15s pick windows with
  rng-uniform auto-pick on expiry; disconnect/returnToLobby tear the
  draft down; FORCE_MAP/FORCE_MODE skip the draft entirely (the smoke
  pins double as the kill switch — rotation cursors survive only
  there). Client: new DraftScene — "WHO PICKS FIRST?" decelerating
  nickname ping-pong rigged to land on the server-rolled winner
  (~2.6s, pure theater), two PixelButton card columns, live badges,
  auto-pick countdown, 900ms locked-in beat, lobby AND results route
  through it; results teaser is now "NEXT: COIN TOSS PICKS WHO DRAFTS
  MAP + MODE" (a rematch's map/mode are unknowable at results time;
  `MatchResult.nextMapName`/`nextGameMode` stay populated for wire
  compat + the FORCE path).

**The one live-debug cycle — wire allowlist:** the draft worked in
unit tests but not end-to-end: `server/src/network/server.ts` has a
VALID_CLIENT_MESSAGE_TYPES gate that silently drops unknown client
message types, and `client:draftPick` was routed in GameManager but
never registered there. Unit tests bypassed it (they call
handleDraftPick directly); the e2e draft walk caught it. The allowlist
is now an exhaustive `Record<ClientMessage['type'], true>` so a shared
union member missing from it is a COMPILE error, and CLAUDE.md's
common-pitfalls entry documents the second registration point.

**Design decisions made in-session (beyond the spec):**

- FORCE-pin draft-skip triggers on env-var PRESENCE, not validity —
  `FORCE_MAP=typo` degrades to rotation with the existing warning, never
  to a surprise draft (kill-switch semantics).
- Rematches now receive a `matchmakingStatus 'matched'` message they
  didn't before (shared launchMatch helper); ResultsScene only reacts
  to 'cancelled', so it's benign.
- Draft badge attribution ("<NICK> PICKED"): a completed snapshot alone
  can't say who picked what, so the scene caches the category of the
  exactly-one-pick window; arriving after completion falls back to a
  nameless "LOCKED IN" badge.
- Lobby/Results draftState handlers tear down listeners IMMEDIATELY
  (not just a transition guard) — draftState rebroadcasts at 20Hz and
  the matchFound-style guard alone would restart the scene per tick.
- e2e drives draft picks by evaluating into the live DraftScene
  (latestDraft + gameService.sendDraftPick) — the server ignores
  wrong-turn picks, so blindly attempting on both pages per poll is
  safe. Canvas-coordinate clicks stay confined to the one throwaway
  smoke that deliberately exercised the real card-click path.

**Verified:** 760 unit tests green (+43: 16 server draft tests — seeded
first-picker roll both directions, both pick orders, claimed-category/
wrong-turn/unknown-value/outsider rejection, drafted map+mode on the
Match, both timeout auto-picks, FORCE skips, rematch re-draft,
disconnect teardown, queue guard; 22 client draft-logic tests —
view derivation + rigged hop schedule; 5 NetworkManager per-match-reset
tests). Typecheck + lint clean. Standard Playwright suite green with the
character-select tests now walking the draft (the desktop-chromium
mobile-controls touch test flaked once under 3-suite CPU load and
passed twice in isolation — same known-flaky family as Session 4's
firefox note). Throwaway two-client smoke (spec deleted after) through
real dev servers with FORCE_MATCH_SECONDS=10: searching-state swap
asserted on/off via ESC; draft #1 by REAL canvas card clicks (Scrapyard
by the roll winner, Deathmatch by the other) → select screen promised
"NEXT: DEATHMATCH - SCRAPYARD"; match 1 on defaults → 0-0 → overtime →
true draw → results; rematch → draft #2 → player A switched
mighty_man→bubba → **both clients rendered bubba for A** (the exact
pre-fix failure); zero page errors on either client. Mobile-landscape
chromium (844×390): draft renders, all 6 cards in-bounds ≥44px, draft
completes to select.

**Known issues / notes for later sessions:**

- The balance watch-item list is still unjudged (see top of entry) —
  collect explicit verdicts at the next group night, including SFX
  ear-verdicts and whether the overtime finale music lands at 0:00.
- Wire format changed AGAIN (`server:draftState`, `client:draftPick`):
  old clients paired against the new server will sit in the lobby
  forever (they don't know draftState and never see matchFound). Both
  players must hard-refresh after the deploy.
- Draft auto-pick timeouts (20s/15s) are a first guess — if the group
  finds the draft drags between rematches, shorten SECOND_PICK_SECONDS
  or add a "both players picked early" fast-path (already implicit:
  picks finalize immediately).
- The character-select screen still shows the OLD character-select
  auto-lock timer separately from the draft timer — two consecutive
  countdown screens. Fine for now; a merged pre-match flow (draft +
  select on one screen) is a possible later polish.
- The PlayerRenderer.update dead-code task (separate session) STILL
  hasn't landed; it now needs rebasing over Session 8's setWeapon/
  setAxeless AND this session's getCharacterId addition.
- tsx-watch on Windows can crash its own restart with EADDRINUSE and
  leave the OLD server process serving stale code on :3000 — if a
  server change seems to have no effect in dev, check for an orphan
  listener before debugging the code (cost part of the allowlist
  debug cycle this session).

### Session 8 — 2026-07-04 — Playtest response + polish backlog

**Session opened with the pending Session 7 deploys** (blocked in auto
mode last session): client to Firebase, server via the GCE git-pull
flow, health check green. Then the backlog. **Balance was deliberately
NOT touched** — no playtest has happened, so pistol/punch/RUNG_KILLS
and the Session 6 character stats keep their spec values.

**Shipped:**

- **Pistol as a DM/KOTH map pickup** (`PickupType.WEAPON_PISTOL`,
  `WEAPONS.pistol.pickupAmmo` 0→36): a sidegrade, not a power weapon —
  spawns ACTIVE at match start, silent 30s respawn, never announced
  (the INCOMING banner stays shotgun-only via the renamed
  `isAnnouncedWeapon`). One spawn per map: Wasteland Outpost (9,10),
  Overgrown Suburb (9,1) on the exposed top street, Scrapyard (14,10)
  south corridor. Last-picked-up wins the special slot (shotgun↔pistol
  replace each other). Gun Game vetoes it automatically (bandage-only
  hook, regression-tested). HUD row + kill attribution needed zero
  changes.
- **Hill Hog award** (`hill_hog`, priority right after sharpshooter):
  `PlayerStats.hillSeconds` accrues in `KothMode.onTick` for EVERY
  living occupant of the live hill — **contested time included**,
  deliberately not sole-occupancy time (that integer-rounds into
  `score` and would just re-award the winner). ≥10s
  (`AWARDS.HILL_HOG_MIN_SECONDS`), strict max, detail "42S ON THE
  HILL". Match-scoped only — never persisted.
- **Lobby leaderboard, over geckos not HTTP** (an HTTP endpoint would
  hit mixed-content walls — the production client is HTTPS and /health
  is plain HTTP on :3001): new reliable `server:leaderboard` message,
  top-5 lifetime players by wins (tie-break kills desc → nickname asc)
  from `PersistentStatsStore.getTopPlayers`, sent per-connection on
  open (GameManager, right behind server:welcome) and rebroadcast to
  every connection after each match's stats are recorded. Client:
  "ALL-TIME TOP 5" panel bottom-left in the lobby (rows like
  "1. RYAN 14W 9L", names clipped to 10 chars via the pure
  `formatLeaderboardRow`), hidden on an empty store, updates in place;
  GameService caches entries so a lobby created after the message
  renders immediately.
- **Overtime music**: after the deep-horn sting (~1s), the gameplay
  track restarts at its final stretch via the new
  `AudioManager.playMusicFromEnd`. Deviation from spec: it seeks by the
  clock's REMAINING seconds (already re-anchored to overtime by
  NetworkManager) rather than a fixed 30s, so the track's finale lands
  at 0:00 despite the sting delay and message latency.
- **Real melee/axe SFX, procedurally synthesized** (pack has no audio;
  third-party files are a license headache): `client/scripts/gen-sfx.mjs`
  (deterministic, seeded mulberry32 noise — byte-exact regeneration)
  writes punch-whoosh (band-passed noise sweep 2400→450Hz),
  punch-impact (130→55Hz thump + click), axe-whoosh (rotation-modulated
  noise, reads as a spinning blade), axe-chop (thunk + crack). All four
  wired into SOUND_MAP; Session 7's rate/detune stand-ins removed. The
  axe LANDING now has a sound at all (previously silent).
- **Jack's no-axe body**: pack `Zombie_Axe/No-Axe` idle/walk/attack
  sheets ×4 dirs extracted (frame counts match with-axe exactly: 6/8/7;
  dims differ and are measured into the new optional
  `CharacterDef.altBody`). BootScene loads a parallel `jack-noaxe` anim
  set via a `createBodyAnimationSet` refactor; `PlayerRenderer.
setAxeless` swaps the body prefix while `abilityCooldownSeconds > 0`
  (driven per-frame next to setWeapon — works for local AND remote).
  The pack's Taking-Axe recovery flourish is skipped (v1).
- **Dry-fire fix**: the out-of-ammo beep now reads the HELD weapon's
  mag (shotgun/pistol → specialAmmo; punch never beeps), mirroring
  Session 7's aim-line tint fix.

**Design decisions / deviations:**

- Session scoped as "clear the polish backlog, defer all balance" —
  the roadmap's session title says "playtest response", but Session 7
  only reached production at the START of this session, so there was
  no playtest to respond to. Tuning without data would be guessing
  twice.
- The prompt's plan assumed a PlayerStats literal in
  combat-manager.ts needed hillSeconds — that literal is
  `AxeState.distanceTraveled` (axe projectile). Only stats-tracker and
  test fixtures construct PlayerStats; the compiler confirmed.
- Leaderboard rebroadcast uses per-connection reliable `sendTo` (like
  every other one-shot lifecycle message), NOT `GameServer.broadcast()`
  — that helper is unreliable geckos io.emit.

**Verified:** 717 unit tests green (+32 this session: config invariants
incl. altBody frame-dim integrity and hill*hog priority slot, KOTH
hill-seconds accrual matrix incl. contested-both-accrue-score-frozen,
Hill Hog threshold/tie/DM-never, pistol equip/replace/refresh/
starts-active/never-announced/gun-game-veto, getTopPlayers ordering +
tie-breaks + empty store, on-connect + post-match leaderboard delivery
incl. an idle third lobby client, leaderboard row formatting).
Typecheck + lint clean; standard Playwright suite green (11 passed).
Throwaway two-client Playwright smoke (spec deleted after) through the
real dev servers with FORCE_MODE=deathmatch + FORCE_MAP="Wasteland
Outpost": lobby ALL-TIME TOP 5 panel rendered from the dev store's
persisted players (desktop AND an 844×390 chromium mobile-landscape
viewport), pair-up with Jack locked via 3×ArrowRight, pistol pickup
present at match start, a BFS waypoint-walker drove a client onto
(9,10) → weaponId flipped to pistol with exactly 12 mag + 24 reserve,
Jack's axe throw flipped BOTH clients' body anims to `jack-noaxe*_`for the cooldown window and back to`jack\__` at expiry, zero uncaught
page errors on either client.

**Known issues / notes for later sessions:**

- **The four generated SFX have not been heard by a human.** They were
  judged by synthesis parameters (envelopes/RMS/spectra), not ears.
  If any lands wrong at group night, retune the constants in
  `client/scripts/gen-sfx.mjs` and rerun it (deterministic output).
- **Overtime music is not live-verified** — reaching it needs a
  genuine 173s tie. Logic is small (delayedCall → playMusicFromEnd)
  and the seek math rides the already-tested clock re-anchor; the
  first overtime at group night should confirm the finale lands at
  0:00. FORCE_MATCH_SECONDS pins still desync it, as ever.
- The desktop smoke's waypoint-walker stalls on wall corners
  occasionally (2 of 3 final runs green; failures were walker
  scripting, not game bugs). Lessons folded into this log for future
  bots: skip-ahead waypoint matching (full speed covers ~18px between
  90ms polls, blowing past tight arrival windows) and a perpendicular
  nudge on 1.5s of zero movement.
- The webkit-based mobile-landscape Playwright project can't reliably
  complete the geckos WebRTC handshake (same class of flake as the
  fixme'd Firefox pair-up) — mobile smokes that need a live connection
  should use chromium with an 844×390 viewport.
- Character select still shows Jack WITH his axe while the no-axe swap
  is in-match only — by design, out of scope.
- The frozen-VFX/nameplate dead-code task (PlayerRenderer.update) from
  Session 7 still hasn't landed; it now needs rebasing over this
  session's setAxeless additions too.
- Remaining backlog is now purely playtest-driven: balance tuning
  (pistol/punch/RUNG_KILLS, character stats), plus whatever group
  night surfaces. Nice-to-haves parked indefinitely: Taking-Axe
  recovery flourish, per-mutator world VFX, mode/map voting,
  per-pairing mutator-recency memory.

### Session 7 — 2026-07-04 — Gun Game + Pistol + Punch melee

**Shipped:** the party mode. **Gun Game** (`GameModeType.GUN_GAME`,
rotation DM → KOTH → GUN GAME): every kill made with your current rung
weapon marches you down rifle → shotgun → pistol → grenades → punch
(`GUN_GAME.RUNG_KILLS` [2,2,2,2,1] = 9 ladder kills); the first player
through the final rung wins instantly. `PlayerState.score` = total
ladder kills; the shared `gunGameRungForScore` derives the rung on both
server (loadout enforcement) and client (HUD ladder), so no new
per-player wire state exists. **Pistol** (`WEAPONS.pistol`, 14→7 dmg
over 48→320px, semi-auto 0.22s, mag 12/1.0s reload) rides the
special-weapon slot + generalized reload; Gun-Game-only in v1
(pickupAmmo 0). **Punch** (`WEAPONS.punch`, flat 60 dmg, 56px reach,
0.5s swing): validated as 7 jitter-free even-fan rays
(`evenFanAngles`) through `processMultiShotWithRewind` — per-victim
character hitboxes, big_heads scale, wall blocking, and the lag-comp
rewind all came free; new `WeaponDef.maxRange` hard-caps ray length
(without it rays extend to falloffRangeMax × 2). One damage application
per victim per swing; an arc can hit multiple victims; x-ray never
pierces a punch. Swings broadcast as the transient `punches` array on
gameState (delivery like bulletTrails — whiffs included, `hit` flag for
impact SFX); the client plays per-character body-level attack anims
(`CharacterDef.attackFrames`/`attackFrameCount`, all four pack attack
sheets extracted, playback normalized to ~350ms across 4/4/8/7-frame
sheets). HUD: ladder line ("PISTOL 1/2 - LVL 3/5") in the mode-exclusive
middle slot, pistol row (icon + "12 +24"), FISTS label, rifle-ammo row
hidden on grenade/punch rungs. New award _Bare Knuckles_ (most punch
kills). `KillWeapon` grew 'pistol'/'punch'; persistence back-fills
missing killsByWeapon keys from older stats files.

**Design decisions made in-session (beyond the locked spec):**

- `GameMode` grew `onKill(…, weapon)` + optional `excludedMutators`
  (Gun Game: grenades*only, infinite_ammo — FORCE*\* pins still bypass),
  `isPickupTypeEnabled` (Gun Game: bandages only; vetoed spawns never
  exist so they never announce), `areGunsDisabled` (the grenade rung
  holds a gated rifle for rendering), and
  `MatchContext.clearWeaponTransients` (rung swaps arrive with a clean
  fire state).
- GunGameMode is the loadout authority: onTick enforces the rung
  weapon + reserve floors every tick, which self-heals the generic
  rifle resets from death/respawn/overtime (those paths untouched).
  Grenade rung: fill on entry + 1 refill per 3s.
- Overtime is fought with rung weapons, ladder score frozen — a genuine
  tie means equal score, hence the same rung, hence a fair duel.
- Ability kills (axe/fire), wrong-weapon kills, and self-kills never
  advance. Deviation noted: a suicide-credited grenade kill (Match
  credits a self-blow-up to the sole opponent) DOES advance the
  opponent's grenade rung — consistent with DM scoring. turbo_grenades
  is NOT excluded (only its regen overlaps; fastest interval wins).
- `rackingTimers` → `fireCooldownTimers` (now shotgun racking + pistol
  0.22s pacing + punch 0.5s swing cooldown).
- **FORCE_MATCH_SECONDS** env pin added (FORCE\_\* family): overrides
  regulation length server-side for manual smokes — the client clock
  re-anchors from snapshots so no client change is needed. Used to
  live-verify the full 9-kill ladder without the 173s ceiling. Music
  sync is knowingly off while pinned.

**Fixed in passing:**

- `PlayerRenderer.setWeapon`/`update()` had ZERO call sites — the
  shotgun held-overlay swap has been silently dead since Session 1.
  setWeapon is now driven per-frame by ClientPlayerManager (this
  session's smoke was the overlay swap's first time live). The rest of
  the dead `update()` path (frozen-target VFX, nameplates) was spun off
  as a separate task rather than folded in.
- Aim-line out-of-ammo tint read the rifle mag while a special weapon
  was held; HUD destroy() leaked the special-row/KOTH/ladder elements.
- Punch impact SFX deviation: SOUND_MAP's `playerHit` entry has no
  shipped asset (never loaded — would silently skip), so impact is a
  slowed gun-shot variant; whoosh is grenade-throw at rate 1.8.

**Verified:** 685 unit tests green (+93 this session: shared ladder
math/even-fan/config invariants, punch rewound-graze pair vs Bubba's
30px box, wall block, maxRange cap, per-victim dedupe, two-victim arc,
Iron Hide via damageApplied, cooldown/frozen gating, event semantics,
pistol falloff/pacing/auto-reload/attribution, GunGameMode advance
rules + loadout enforcement + floors + regen + winners + tie→overtime,
mutator-roll exclusion rng-sweep + FORCE bypass, pickup veto + no
announcement, 3-mode rotation + FORCE_MODE=gun_game,
FORCE_MATCH_SECONDS, bare_knuckles, persistence back-compat with an
old-shape stats file). Typecheck + lint clean; standard Playwright
suite green (11 passed). Throwaway two-client Playwright bot (spec
deleted after) drove a REAL full Gun Game match through dev servers +
netcode with FORCE_MODE=gun_game + FORCE_MATCH_SECONDS=600 +
FORCE_MIDMATCH_MUTATOR=big_heads: all 9 ladder kills (rifle ×2,
shotgun ×2, pistol ×2, grenade ×2, punch), asserting per rung the HUD
ladder text, broadcast weaponId, overlay texture swap (shotgun +
pistol; hidden for FISTS), gun gate + grenade refill on the grenade
rung, punchSwung event delivery to the remote client, the remote
attack animation actually playing, instant win on the punch kill,
GUN GAME/VICTORY results, excluded mutators never rolling, and zero
page errors on both clients — plus a mobile-landscape (844×390)
ladder-HUD render. Earlier bot iterations also incidentally verified
the timeout-victory results path (with a Buckshot Barber award) and a
0-0 Gun Game timeout entering sudden-death overtime.

**Known issues / notes for later sessions (the polish backlog):**

- Balance is UNTESTED with humans: pistol/punch numbers and
  RUNG_KILLS [2,2,2,2,1] are the spec's starting values — get a group
  night in before tuning. Watch: punch-rung standoffs in 1v1 (both
  players near the ladder top means fists vs guns), and whether the
  grenade rung drags.
- Pistol exists only in Gun Game; a DM/KOTH map pickup is a cheap
  follow-up (PickupType + map spawns).
- Punch impact SFX uses a gun-shot variant (pack ships no audio;
  `playerHit` asset was never shipped — consider sourcing real melee
  SFX). Dry-fire beep still reads the rifle mag while specials are
  held (pre-existing).
- The frozen-VFX/nameplate dead-code task (PlayerRenderer.update) was
  started in a separate session from a task chip — it branches from
  pre-Session-7 main and WILL need a rebase over these changes.
- Still unclaimed from earlier sessions: Hill Hog award (StatsTracker
  hill-seconds column), overtime music (silence after the sting), axe
  SFX is pitched-up grenade throw, Jack's no-axe body sheets during
  axe flight, lobby leaderboard.
- Smoke-bot lessons (for anyone scripting live drive-throughs):
  player positions live on `renderer.container` (sprites sit at local
  0,0); the world→canvas input mapping is exactly linear 960×720 (the
  CRT PostFX inset is render-only — trust `input.activePointer`, with
  a settle wait before reading it back); dead remotes VANISH from the
  renderer map (interpolation drops them); a chased victim heals on
  trampled bandages; an 85HP victim survives any grenade landing
  > 29px off-centre, so lob at stationary targets.
- **Session 7 deploys NOT run:** the auto-mode permission classifier
  allowed the start-of-session Session 6 carry-over deploys but blocked
  the NEW Session 7 production deploys (its stated reasoning: a fresh
  deploy wants an interactive prompt). All commits are pushed to
  origin/main and the client bundle builds clean — run the two deploy
  commands from CLAUDE.md → Deployment interactively, then
  `curl http://34.24.140.207:3001/health` and play a Gun Game match at
  https://mighty-mans-revenge.web.app. Wire format changed again: old
  clients don't know `gameState.punches`, the pistol/punch weaponIds,
  or `gun_game` — both players must refresh after the deploy.

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
  - optional `koth` (KothHudState); new one-shot `server:overtimeStart`
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
