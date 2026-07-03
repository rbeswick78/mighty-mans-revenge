# Replayability Roadmap — Multi-Session Build Plan

This document is the contract for a multi-session effort to make Mighty Man's
Revenge worth playing over and over. **Read this whole file at the start of
every session.** It contains the plan, locked design decisions, the asset
manifest, the end-of-session ritual, and a running session log.

- **Status:** Session 0 (planning) complete. Next up: **Session 1**.
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
| 1 | Weapon system + Shotgun + health pickups | Fights stop being identical; map control begins | not started |
| 2 | Match awards + persistent rivalry stats | Bragging rights: the friend-group replay engine | not started |
| 3 | Mutator expansion | Matches stop repeating; chaos moments | not started |
| 4 | Two new maps + rotation | New spaces to master | not started |
| 5 | King of the Hill + overtime | A second way to play; no more anticlimactic ties | not started |
| 6 | New characters + stat identities | Counterpicks and mains | not started |
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

- [ ] Rifle behavior is unchanged (regression: existing tests still pass).
- [ ] Shotgun spawns center-map with pre-announcement, auto-equips, racks
      between shots, reverts to rifle on empty.
- [ ] Shotgun kills validate through lag compensation and attribute to
      `'shotgun'` in stats.
- [ ] Bandages heal, cap at max HP, respawn on their own timer.
- [ ] Client prediction/reconciliation shows no new rubber-banding (weapon
      state changes don't touch movement physics).
- [ ] HUD (desktop + mobile landscape) shows special-weapon ammo; pickup
      and shotgun-fire have distinct SFX (rate/detune variants OK).
- [ ] Unit tests for weapon defs, pellet spread determinism, pickup/equip/
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

- [ ] Awards appear on results for both players, deterministic given stats,
      with unit tests over the selection/priority logic.
- [ ] Lifetime records persist across server restarts (integration test with
      a temp DATA_DIR).
- [ ] Rivalry line renders on results (desktop + mobile landscape).
- [ ] File writes are async, at match end only; tick budget unaffected.
- [ ] Draws recorded as draws (don't let Session 5's overtime change land
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

- [ ] Mid-match mutator fires at a random (seeded-in-tests) time with
      warning; final-minute event unchanged; no duplicate mutator per match.
- [ ] `big_heads` scales both hit validation and rendering; a shot that
      misses a normal hitbox hits a big one (server test).
- [ ] `second_wind` produces identical movement client/server (no
      reconciliation snap in manual test).
- [ ] All mutators covered by deterministic unit tests; HUD banner names
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

- [ ] Both maps validate, render themed on desktop + mobile, and play a
      full match without collision/spawn bugs.
- [ ] Collision grids identical client/server (shared loader — no forked
      logic).
- [ ] Rotation cycles all three maps; results screen shows next map.
- [ ] Registry/validator unit tests cover the new maps and theme lookup.

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

- [ ] Full KOTH match playable start→results, hill moves on schedule,
      contested logic correct (unit tests on occupancy/scoring).
- [ ] DM tie now flows into overtime; overtime kill ends match immediately;
      double-timeout = draw, recorded as such in Session 2's persistence.
- [ ] Mode rotation surfaces in lobby; results screen labels the mode.
- [ ] Tick budget unaffected (zone checks are O(players), trivial).

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

- [ ] All five characters selectable with correct sheets/animations
      (8-frame walks animate correctly).
- [ ] Speed differences produce zero reconciliation drift (client/server
      identical — manual + automated where possible).
- [ ] Big hitbox is honored by live hits AND rewound hits (lag-comp test).
- [ ] Iron Hide reduces all damage sources (rifle/shotgun/grenade/fire/axe);
      Axe Throw damages on direct hit, blocked by walls, attributed in
      stats (extend weapon union again).
- [ ] Existing three characters' ability behavior unchanged.

**Parallelizable workstreams:** (a) stat plumbing (HP/speed/hitbox) + tests,
(b) Big Zombie assets + Iron Hide, (c) Axe Zombie assets + projectile.
(b)/(c) are independent after (a).

---

## Session 7 — (Stretch) Gun Game + Pistol + melee

Only start this once 1–6 are live and the group still wants more. Sketch,
to be specced properly when its turn comes:

- **Pistol** weapon from the pack (fast fire, low damage, infinite reserve?)
  — completes the weapon triad.
- **Punch** melee using `Character/Main/Punch` sheets (short-range,
  high-damage, lag-comp validated melee arc).
- **Gun Game mode**: every kill advances your weapon down a ladder
  (rifle → shotgun → pistol → grenades-only → punch); first through the
  ladder wins. Mode rotation includes it.
- Bat-creature map hazard if we're feeling spicy.

---

## Session Log

Append one entry per session. Include: date, what shipped (commits), design
deviations from this doc, known issues, tuning notes from play-testing.

### Session 0 — 2026-07-03 — Planning
- Reviewed game for repetitiveness causes; wrote this roadmap.
- Inventoried the asset pack: PNGs live only inside the zip
  (`PostApocalypse_AssetPack_v1.1.2.zip`); extracted folder is GIF previews.
- Confirmed pack support for: shotgun/pistol (full overlay + pickup + HUD
  art), bandage/first-aid, Zombie_Big, Zombie_Axe (with thrown-axe
  projectile sheets), Helmet variant, punch melee, 2 new floor tilesets,
  buildings/containers/vehicles for cover, hit-splash effects.
- No code changes.
