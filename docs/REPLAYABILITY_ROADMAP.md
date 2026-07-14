# Replayability Roadmap — Multi-Session Build Plan

This document is the contract for a multi-session effort to make Mighty Man's
Revenge worth playing over and over. **Read this whole file at the start of
every session.** It contains the plan, locked design decisions, the asset
manifest, the end-of-session ritual, and a running session log.

- **Status:** Sessions 1–91 complete. Completed work includes weapons, awards + rivalry stats, mutator expansion and activation rule callouts, maps + rotation, KOTH + overtime, character identities and death-animation variety, roster-authentic duel/Rumble results, Gun Game, Rivalry Sets, Quick Match 1v1 plus 2–4 player Wasteland Rumble with all-player group draft rallies, a rematch-chain Rumble Crown, live lead-change drama, personal rematch Grudges, authoritative Rumble Assists with K/A/D, a solo four-fighter Scrap Pit whose three server-authoritative rivals have distinct readable tactics, answer player taunts with signature banter, and feed a device-local win/run record chase, a 2v2 Crew Battle with friendly-fire protection and an optional six-second real-friend join window, a four-objective Crew Clash rotation, and a device-local four-patch Crew Tour, and visible bounded Wasteland Signal Recovery, Practice vs Rusty with favorite-mode, choose-your-rival, and custom-chaos selectors plus Scavenger Instincts, the three-stage Wasteland Gauntlet with score attack, performance bonuses, route drafts, rival drafts, chaos forecasts, danger bounties, run-long boon drafts, a browsable six-build codex with per-build bests, style bonuses, live style callouts, and a deterministic Daily Run with local bests, clear streaks, a shared server-authoritative Daily Top 5, and locked nearest-rival chase targets, six arenas including the breachable Rusted Refinery, persistent Arena Mastery, gameplay-neutral Wasteland Taunts, eight modes, contracts/reputation/fighter mastery, dynamic destruction, scavenger caches, Wasteland Warp, Last Laugh, Bounty Hunt, Power Weapon Drops, Clutch Kills, Scavenger Rush, Wasteland Bat, Radiation Storm, Scrap Armor, Scrapstorm, Demolition Wave, Blood Rush, Ability Overdrive, Overcharge Cells, twin-stick controller support, and the six-fighter roster. **The first group playtest happened** — it surfaced two bugs and one feature request (Session 9) but produced NO balance verdicts, so tuning (pistol/punch/RUNG_KILLS, character stats) remains untouched and the watch-item list carries forward to the next group night.
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

| #   | Title                                           | Fun payoff                                                                    | Status                |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- |
| 1   | Weapon system + Shotgun + health pickups        | Fights stop being identical; map control begins                               | **DONE** (2026-07-04) |
| 2   | Match awards + persistent rivalry stats         | Bragging rights: the friend-group replay engine                               | **DONE** (2026-07-04) |
| 3   | Mutator expansion                               | Matches stop repeating; chaos moments                                         | **DONE** (2026-07-04) |
| 4   | Two new maps + rotation                         | New spaces to master                                                          | **DONE** (2026-07-04) |
| 5   | King of the Hill + overtime                     | A second way to play; no more anticlimactic ties                              | **DONE** (2026-07-04) |
| 6   | New characters + stat identities                | Counterpicks and mains                                                        | **DONE** (2026-07-04) |
| 7   | (Stretch) Gun Game + Pistol + melee             | The party mode                                                                | **DONE** (2026-07-04) |
| 8   | Playtest response + polish backlog              | The accumulated small stuff, cleared before group night                       | **DONE** (2026-07-04) |
| 9   | Playtest response #1: two bugs + map/mode draft | The game respects your pick — and lets you pick the arena                     | **DONE** (2026-07-05) |
| 10  | Rivalry Sets + Revenge Drafts                   | Every rematch becomes a round with stakes and comeback control                | **DONE** (2026-07-11) |
| 11  | Practice vs Rusty                               | The game is playable on demand, even when no friend is online                 | **DONE** (2026-07-11) |
| 12  | Streaks, Payback + Shutdowns                    | Every kill builds a story and a reason to settle the score                    | **DONE** (2026-07-11) |
| 13  | Rusty Difficulty                                | Solo practice stays welcoming, challenging, and worth mastering               | **DONE** (2026-07-11) |
| 14  | Collapsed Overpass                              | A fourth arena adds fresh routes and riskier objective fights                 | **DONE** (2026-07-11) |
| 15  | Blackout                                        | Darkness turns familiar fights into close-range cat-and-mouse                 | **DONE** (2026-07-11) |
| 16  | Fresh-Chaos Rematches                           | Back-to-back rounds cannot repeat the same two mutators                       | **DONE** (2026-07-11) |
| 17  | Last Stand                                      | Every death spends a life, building pressure toward elimination               | **DONE** (2026-07-11) |
| 18  | Kill Confirmed                                  | Every kill creates a risky confirm-or-deny scramble                           | **DONE** (2026-07-11) |
| 19  | Mode Briefings                                  | Every mode teaches its win condition before the fight begins                  | **DONE** (2026-07-11) |
| 20  | Character Death Animations                      | Every elimination lands with a readable, satisfying corpse pose               | **DONE** (2026-07-11) |
| 21  | Authoritative Hit Confirmation                  | Every accurate shot feels crisp, legible, and unquestionably earned           | **DONE** (2026-07-12) |
| 22  | Blastable Cover                                 | Grenades permanently carve new routes through each round's arena              | **DONE** (2026-07-12) |
| 23  | Chain-Reaction Barrels                          | Every arena gains tactical traps, ambushes, and explosive reversals           | **DONE** (2026-07-12) |
| 24  | Wasteland Contracts                             | Optional side goals change tactics and build a persistent career chase        | **DONE** (2026-07-12) |
| 25  | Combat Medals                                   | First Blood, rapid chains, and posthumous kills become stories worth chasing  | **DONE** (2026-07-12) |
| 26  | Wasteland Reputation                            | Contract clears build a visible career ladder and recurring promotion chase   | **DONE** (2026-07-12) |
| 27  | Hot Streaks                                     | Consecutive wins survive restarts, giving every rematch another stake         | **DONE** (2026-07-12) |
| 28  | Fighter Mastery                                 | Every roster pick gains its own persistent goal and identity                  | **DONE** (2026-07-12) |
| 29  | Fists Only                                      | Mid-round gunfights collapse into frantic close-range brawls                  | **DONE** (2026-07-12) |
| 30  | Weapon Roulette                                 | Every ten seconds demands a fresh fighting style and new positioning          | **DONE** (2026-07-12) |
| 31  | One in the Chamber                              | One precious shot turns every aim, miss, and recovery punch into drama        | **DONE** (2026-07-12) |
| 32  | Shootable Arena Gates                           | Every firefight can permanently reveal a shortcut or surprise sightline       | **DONE** (2026-07-12) |
| 33  | Rook + Breach Dash                              | A sixth main turns every fight into a positioning puzzle                      | **DONE** (2026-07-13) |
| 34  | Scavenger Caches                                | Shooting cover open creates fair loot races and round-to-round surprise       | **DONE** (2026-07-13) |
| 35  | Core Run                                        | A moving objective turns every second of possession into a chase              | **DONE** (2026-07-13) |
| 36  | Wasteland Warp                                  | Synchronized position swaps turn settled fights into instant reversals        | **DONE** (2026-07-13) |
| 37  | Last Laugh                                      | Every death leaves one final explosive threat and chain-reaction story        | **DONE** (2026-07-13) |
| 38  | Bounty Hunt                                     | A rotating marked fighter makes every chase and reversal worth more           | **DONE** (2026-07-13) |
| 39  | Power Weapon Drops                              | Every armed death creates a brief, ammo-honest scramble at the corpse         | **DONE** (2026-07-13) |
| 40  | Clutch Kills                                    | Critical-health victories land as memorable, exact-HP highlight moments       | **DONE** (2026-07-13) |
| 41  | Scavenger Rush                                  | Rotating short-lived supplies repeatedly pull fighters into fresh contests    | **DONE** (2026-07-13) |
| 42  | Wasteland Bat                                   | Four brutal swings create a scarce close-range map-control prize              | **DONE** (2026-07-13) |
| 43  | Radiation Storm                                 | A shrinking safe zone turns passive corners into urgent closing fights        | **DONE** (2026-07-13) |
| 44  | Rusty's Scavenger Instincts                     | Practice opponents contest the arena's weapons and supplies like real rivals  | **DONE** (2026-07-13) |
| 45  | Scrap Armor                                     | A contested shield pickup rewards proactive center control                    | **DONE** (2026-07-13) |
| 46  | Scrapstorm                                      | Telegraphed debris strikes turn settled positions into urgent dodges          | **DONE** (2026-07-13) |
| 47  | Overcharge Cells                                | Ability refreshes turn signature powers into repeatable center-map contests   | **DONE** (2026-07-13) |
| 48  | Twin-Stick Controller Support                   | Console-style controls make every fight and rematch easier to settle into     | **DONE** (2026-07-13) |
| 49  | Wasteland Gauntlet                              | A three-fight solo climb turns Practice into a run with escalating stakes     | **DONE** (2026-07-13) |
| 50  | Gauntlet Score Attack                           | Every solo clear leaves a personal target worth one more run                  | **DONE** (2026-07-13) |
| 51  | Gauntlet Performance Bonuses                    | Cleaner, faster victories keep even strong personal bests worth chasing       | **DONE** (2026-07-13) |
| 52  | Gauntlet Route Draft                            | Every cleared stage offers a meaningful next-fight choice                     | **DONE** (2026-07-13) |
| 53  | Gauntlet Rival Drafts                           | Route previews turn each branch into a readable matchup decision              | **DONE** (2026-07-13) |
| 54  | Gauntlet Chaos Forecasts                        | Every branch reveals a different mid-fight twist worth planning around        | **DONE** (2026-07-13) |
| 55  | Gauntlet Chaos Bounties                         | Dangerous route choices become explicit high-score gambles                    | **DONE** (2026-07-13) |
| 56  | Demolition Wave                                 | Familiar lanes erupt into exposed, permanently rewritten battlefields         | **DONE** (2026-07-13) |
| 57  | Gauntlet Style Bonuses                          | Combat highlights become capped score-chase rewards worth mastering           | **DONE** (2026-07-13) |
| 58  | Live Gauntlet Style Callouts                    | Every highlight immediately teaches the score chase it can bank               | **DONE** (2026-07-13) |
| 59  | Blood Rush                                      | Every kill can ignite a fast, aggressive chase for the next                   | **DONE** (2026-07-13) |
| 60  | Mutator Rule Callouts                           | Every surprise teaches its rule before players must react                     | **DONE** (2026-07-13) |
| 61  | Death Animation Variety                         | Repeated eliminations stop replaying the same canned fall                     | **DONE** (2026-07-13) |
| 62  | Favorite Mode Sparring                          | A favorite ruleset becomes deliberately replayable without losing map variety | **DONE** (2026-07-13) |
| 63  | Choose Your Rival                               | Any roster matchup becomes deliberate practice instead of a lucky random roll | **DONE** (2026-07-13) |
| 64  | Checkpoint Zero                                 | A fifth arena turns readable barricade lanes into destructible route choices  | **DONE** (2026-07-13) |
| 65  | Daily Gauntlet                                  | One fair shared challenge creates a reason to return and improve every day    | **DONE** (2026-07-13) |
| 66  | Ability Overdrive                               | Faster signature-power cycles make every fighter identity erupt repeatedly    | **DONE** (2026-07-13) |
| 67  | Daily Scoreboard                                | Every fair daily clear becomes a friend-group score worth chasing             | **DONE** (2026-07-13) |
| 68  | Daily Rival Chase                               | Every attempt gets one attainable friend score to hunt                        | **DONE** (2026-07-13) |
| 69  | Custom Chaos Sparring                           | Favorite mid-fight twists become deliberate, remixable solo practice          | **DONE** (2026-07-13) |
| 70  | Gauntlet Boon Drafts                            | Every route choice builds a different run worth replaying                     | **DONE** (2026-07-13) |
| 71  | Gauntlet Build Codex                            | Every two-boon clear can discover one more named build                        | **DONE** (2026-07-13) |
| 72  | Gauntlet Build Mastery                          | Every discovered build gains its own score chase and trophy                   | **DONE** (2026-07-13) |
| 73  | Rusted Refinery                                 | A breachable power vault creates a fresh contest from every route             | **DONE** (2026-07-13) |
| 74  | Arena Mastery                                   | Every battlefield gains a persistent identity and rivalry chase               | **DONE** (2026-07-14) |
| 75  | Wasteland Taunts                                | One-button battle cries turn live fights into social rivalry moments          | **DONE** (2026-07-14) |
| 76  | Wasteland Rumble                                | 2–4 friends turn every arena into a replayable free-for-all                   | **DONE** (2026-07-14) |
| 77  | Rumble Crown                                    | Every direct group rematch gains a champion to defend or dethrone             | **DONE** (2026-07-14) |
| 78  | Rumble Draft Rally                              | Every fighter helps choose the next group battleground                        | **DONE** (2026-07-14) |
| 79  | Rumble Lead Drama                               | Every takeover and tie becomes a shared live-match story                      | **DONE** (2026-07-14) |
| 80  | Rumble Grudges                                  | Every group finish leaves each fighter a personal rematch score to settle     | **DONE** (2026-07-14) |
| 81  | Rumble Assists                                  | Meaningful setup damage earns visible credit in chaotic group fights          | **DONE** (2026-07-14) |
| 82  | Wasteland Signal Recovery                       | Brief server trouble becomes visible and recoverable instead of a frozen loop | **DONE** (2026-07-14) |
| 83  | Scrap Pit                                       | Solo players can enter the full four-fighter Rumble chaos on demand           | **DONE** (2026-07-14) |
| 84  | Scrap Pit Rivals                                | Every bot presents a different threat instead of feeling like a renamed clone | **DONE** (2026-07-14) |
| 85  | Scrap Pit Banter                                | Talking trash becomes a two-way rivalry beat against the crew                 | **DONE** (2026-07-14) |
| 86  | Scrap Pit Records                               | Every solo brawl builds a persistent win-run target worth defending           | **DONE** (2026-07-14) |
| 87  | Roster Victory Lineups                          | Every finish preserves the actual cast that made the match memorable          | **DONE** (2026-07-14) |
| 88  | Crew Battle 2v2                                 | Protecting an ally creates the game's first true team-play loop               | **DONE** (2026-07-14) |
| 89  | Crew Clash Rotation                             | Four cooperative objectives keep the same crews changing strategy             | **DONE** (2026-07-14) |
| 90  | Crew Tour                                       | Winning every team objective turns the rotation into a repeatable patch chase | **DONE** (2026-07-14) |
| 91  | Crew Up                                         | A friend can join the team instantly without taking solo Crew away            | **DONE** (2026-07-14) |

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

## Session 15 — Blackout

**Goal:** add a high-contrast fight state that changes how players read and
approach the arena without guessing at weapon, character, or physics balance.

**Locked design decisions**

- Blackout is a normal shared mutator id and can occupy either activation
  slot; the server remains the authority for when it starts.
- Visibility is client-rendered only. Blackout changes no damage, movement,
  collision, input, aim, pickups, or serialized player state.
- Ambient darkness rises from 0.20 to 0.78. Each living local player receives
  one 140px soft light pool; remote players never emit a tracking light.
- Existing pickup glows, muzzle flashes, and explosion flashes still cut
  through the overlay, turning combat actions into temporary reveals.
- Dead players lose the personal light and regain it on authoritative respawn;
  the HUD stays readable above the playfield overlay throughout.

**Acceptance criteria**

- [x] `blackout` participates in typed mutator selection, labels, banners,
      flashes, no-repeat scheduling, and FORCE smoke tooling.
- [x] Normal lighting is byte-for-byte behaviorally unchanged when inactive.
- [x] Blackout has a tested, immutable client profile with a playable local
      light and no authoritative gameplay branch.
- [x] A live forced match verifies activation, distance concealment, pickup
      beacons, death darkness, and respawn light restoration.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 16 — Fresh-Chaos Rematches

**Goal:** make the REMATCH button deliver a meaningfully different chaos mix
instead of allowing the same mid-match or final-minute twist twice in a row.

**Locked design decisions**

- A completed round contributes only its two active mutators; the next direct
  rematch excludes both from random selection.
- The exclusion crosses human revenge drafts, direct Practice rematches, and
  FORCE map/mode rematches. Returning to the lobby starts clean.
- Memory is server-only and ephemeral. It adds no persistent schema, player
  state, network message, client branch, or pairing database.
- Existing mode exclusions and within-match no-repeat rules still compose.
  The nine-item pool always leaves ample candidates for both rematch slots.
- `FORCE_EVENT` and `FORCE_MIDMATCH_MUTATOR` remain absolute smoke tools and
  intentionally override the recent-mutator exclusion.

**Acceptance criteria**

- [x] Both prior mutators are carried through human and Practice rematches.
- [x] Both random slots exclude the prior pair while still excluding each
      other and respecting mode-level bans.
- [x] Explicit FORCE pins can reproduce a recent mutator for diagnostics.
- [x] Fresh matches have no inherited exclusion state.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 17 — Last Stand

**Goal:** add a compact stock-lives mode where every death matters and a lead
can turn into a tense final-life comeback.

**Locked design decisions**

- Every fighter begins with five lives. Every death removes one, including a
  suicide; the authoritative remaining-life count rides in `PlayerState.score`.
- Positive-life fighters use the normal respawn loop. A fighter at zero stays
  dead as an eliminated spectator while any N-player match continues.
- The last fighter with lives wins immediately. If regulation expires first,
  highest lives wins; a top-score tie uses the existing sudden-death overtime.
- Already-eliminated fighters do not return for overtime. Overtime itself
  remains first-kill-wins and does not spend stock. If a simultaneous final
  exchange eliminates everybody, the match ends as a draw instead of opening
  an empty overtime.
- Maps, characters, weapons, mutators, Rusty, drafts, rivalry sets, and
  persistent results all reuse their existing authoritative paths.
- The HUD explicitly labels the score as `LIVES REMAINING`; a zero-life local
  player sees `ELIMINATED` instead of a misleading respawn timer.

**Acceptance criteria**

- [x] Last Stand is a typed mode available in drafts, rotation, rematches, and
      `FORCE_MODE=last_stand` smoke tooling.
- [x] Deaths, suicides, respawns, immediate wins, timed wins, ties, overtime,
      and N-player elimination have deterministic server coverage.
- [x] Rusty can play through the normal input path without mode-specific
      combat shortcuts.
- [x] The four-card mode draft and in-match five-life HUD fit the desktop UI.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 18 — Kill Confirmed

**Goal:** turn kills into contested map objectives so the winning move is not
just landing damage, but deciding when to risk the confirmation.

**Locked design decisions**

- Every regulation death drops one dog tag at the victim's authoritative
  position. Raw kills do not score.
- Any living opponent can collect a tag for one point; its owner can recover
  it to deny the point. This remains meaningful and deterministic for N players.
- Tags expire after 20 seconds and collect within a 30px radius. The first
  fighter to eight confirmations wins; highest confirmations wins on time.
- A tied clock uses the normal first-kill sudden death. Tags are retired in
  overtime so a previous-life objective cannot decide the duel.
- Rusty routes toward the nearest live tag even while the opponent is dead,
  using the same collision grid and ordinary movement inputs as human players.
- Gold `CONFIRM` and green `DENY` tokens communicate ownership. Authoritative
  one-tick events drive explicit callouts and pitched pickup feedback.

**Acceptance criteria**

- [x] Kill Confirmed is typed and available in drafts, fallback rotation,
      rematches, results, and `FORCE_MODE=kill_confirmed` smoke tooling.
- [x] Spawn, confirm, deny, expiry, N-player collection, target wins, timed
      ties, and overtime retirement are authoritative and deterministic.
- [x] Rusty actively pursues tags without bypassing normal input or movement.
- [x] The client renders local-relative tag intent, objective HUD copy, and
      authoritative confirm/deny feedback.
- [x] A forced Warlord Practice match verifies preview, HUD, scoring, Rusty
      collection, feedback callout/SFX path, and a clean browser console.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 19 — Mode Briefings

**Goal:** make every mode immediately understandable without adding a tutorial
wall or asking players to remember rules from the draft screen.

**Locked design decisions**

- Every mode owns one concise objective line beside its display name in the
  shared `GAME_MODES` registry; victory-rule copy must not drift between UI
  surfaces.
- The selected mode and objective appear beneath the existing 3/2/1 countdown,
  then fade away with `FIGHT` so they teach without delaying control.
- The treatment stays intentionally lightweight: one gold mode title, one
  high-contrast objective line, no modal, input gate, or extra network message.
- Countdown snapshot repair remains the timing authority, so a dropped first
  countdown packet still produces the briefing on a later countdown snapshot.

**Acceptance criteria**

- [x] All five modes define non-empty shared objective copy with unit coverage.
- [x] The countdown presents the selected mode and objective exactly once per
      scene lifecycle and clears them when the match starts.
- [x] Kill Confirmed's longest objective fits and remains readable in desktop
      and mobile-landscape layouts.
- [x] Live Practice inspection shows the briefing during countdown and a clean
      browser console.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 20 — Character Death Animations

**Goal:** make every kill visually land instead of having the defeated fighter
vanish on the first dead snapshot.

**Locked design decisions**

- Every roster entry owns measured horizontal death-sheet dimensions and a
  frame count in `CHARACTERS`; BootScene loads and creates these animations
  through the same registry-driven path as idle/run/attack.
- The asset pack supplies side and side-left deaths only. Continuous aim is
  projected onto that horizontal pair so vertical-facing fighters fall toward
  their actual horizontal lean rather than snapping to one universal pose.
- An authoritative alive-to-dead edge plays the 650ms first-death sheet once,
  hides weapon/wand/name/health UI, and holds the final corpse frame for the
  complete respawn window. Repeated dead snapshots never restart or hide it.
- Respawn restores the current authoritative body variant, weapon, cosmetics,
  and normal invulnerability presentation. Jack uses matching no-axe death art
  while his axe is out; Frost Wizard retains its shared-body tint.
- This is presentation only: no combat, collision, respawn, network, or balance
  rules change.

**Acceptance criteria**

- [x] All six fighters have measured death metadata and curated attributed
      sheets; Jack's with-axe and no-axe bodies both resolve valid frames.
- [x] Local and remote renderers transition only on authoritative life edges,
      hold corpses until respawn, and cannot have death animation overwritten
      by movement, aim, weapon, attack, or body-variant snapshot updates.
- [x] Horizontal death direction is deterministic and unit-covered.
- [x] A live forced Last Stand Practice match shows death, corpse hold, respawn,
      and clean desktop/mobile-landscape presentation with no console warnings.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 21 — Authoritative Hit Confirmation

**Goal:** make accurate gunfire feel unmistakably satisfying without letting
the client guess whether a ray actually damaged a fighter.

**Locked design decisions**

- `BulletTrail` carries explicit `hitPlayerId` and `damageApplied` fields.
  CombatManager initializes every trail as unconfirmed; Match stamps the fields
  only after `applyDamage()` succeeds, using the post-mitigation amount.
- A ray endpoint alone is never proof of a player hit. Confirmed trails use the
  pack's two three-frame `Enemies/Shot` splashes; misses and scenery contacts
  keep the existing spark, dust, and wall-decal presentation.
- Bullet arrival owns impact timing. The 200ms trail tween invokes its arrival
  callback after the bullet head reaches the endpoint, eliminating the old
  effect-before-projectile causality mismatch.
- Only the shooter hears the short, original hit-confirm tick. Rifle and pistol
  rounds confirm individually; a shotgun blast may show several pellet splashes
  but collapses to one sound on the first confirmed pellet.
- This adds no client damage prediction and changes no weapon, hitbox, health,
  mitigation, lag-compensation, or scoring rules.

**Acceptance criteria**

- [x] Rifle, pistol, and every applied shotgun pellet broadcast the victim and
      post-mitigation damage; misses and discarded pellets remain null/zero.
- [x] The network client forwards the new fields unchanged and old/undefined
      fields safely fall through to ordinary impact feedback.
- [x] Confirmed-hit art, arrival timing, local-only audio, and shotgun sound
      grouping work in live desktop and mobile-landscape play.
- [x] Curated art and original synthesized audio are fully attributed and
      reproducible.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 22 — Blastable Cover

**Goal:** let grenades reshape a round's routes and sightlines by destroying
low cover without weakening the arena boundary or changing combat numbers.

**Locked design decisions**

- A grenade destroys `COVER_LOW` or a decoration-backed interior solid whose
  tile centre is inside the configured blast radius and is the first solid
  tile on that ray from the detonation. Ordinary walls can shield cover/props;
  a target behind another solid cannot be destroyed by the same blast.
- Damage resolves against the pre-explosion collision grid. The cover protects
  fighters from the blast that breaks it, then becomes passable for subsequent
  movement, shots, grenades, and bot line-of-sight.
- Decorations backed by multiple solid cells are atomic props: exposing any
  one cell destroys the whole wreck/container and every solid under it. Plain
  low cover remains independently destructible; perimeter walls stay immune.
- The server mutates only the match's live collision grid and reuses the
  existing transient `server:tilesDestroyed` event. Registry JSON is immutable,
  direct rematches start fresh, and no new protocol message is introduced.
- Clients reveal the already-rendered floor underlay, remove an atomic prop
  once, and clear prediction collision for every authoritative tile. Outer and
  interior `WALL` rules, Bruce's fire breath, weapon values, and character
  values are unchanged.

**Acceptance criteria**

- [x] Manual and fuse grenade detonations destroy only exposed cover inside
      `GRENADE.BLAST_RADIUS`; walls and nearer solids shield later cover.
- [x] Multi-cell decoration props disappear atomically and all backing solids
      become passable; undecorated cover breaks one cell at a time.
- [x] The destroying blast still uses the pre-destruction LOS result, while
      later movement/rays use the newly open collision grid.
- [x] Destruction renders cleanly and prediction stays synchronized in live
      desktop and mobile-landscape play, including direct rematches.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 23 — Chain-Reaction Barrels

**Goal:** turn cover into an authored tactical opportunity that rewards map
awareness, accurate shots, and risky chain-reaction plays without changing any
weapon, character, or grenade tuning.

**Locked design decisions**

- Every shipped arena has exactly two red barrels, declared as one-cell
  `MapDecoration` entries with `hazard: "explosive_barrel"` and backed by
  `COVER_LOW`. The map validator rejects oversized or non-cover barrels.
- A non-piercing rifle, pistol, or shotgun ray that terminates on a barrel
  detonates it. Grenade and barrel blasts trigger any exposed barrel inside
  the existing grenade radius. Punches, axes, fire breath, and X-ray shots do
  not trigger barrels because they do not terminate on that solid cell.
- Barrels reuse grenade damage, falloff, radius, Iron Hide handling, and LOS.
  The consumed barrel's collision disappears before its own blast; ordinary
  walls and nearer solids still shield later barrels. Each barrel is removed
  from the round's active set before recursion, so it can explode only once.
- The server owns barrel state, damage, chains, and tile destruction. A
  transient `barrelExplosions` snapshot list reuses the existing grenade VFX,
  audio, scorch, and shockwave path; reliable `server:tilesDestroyed` remains
  the collision/art synchronization path. New matches rebuild the map cleanly.
- Barrel kills use a distinct `KillWeapon` entry. They score in normal modes
  and persist in lifetime weapon totals, but cannot accidentally satisfy a Gun
  Game weapon rung or inflate grenade-specific awards.

**Acceptance criteria**

- [x] Rifle, pistol, and shotgun impacts can consume a barrel exactly once;
      multiple pellets in one blast still produce one detonation.
- [x] Grenades and barrels recursively chain only into exposed barrels, while
      ordinary walls shield hazards behind them.
- [x] Damage, kill credit, persistent stats, collision removal, VFX, and fresh
      rematch state are server-authoritative and covered by regressions.
- [x] All four maps place two readable, validator-approved barrels outside
      spawn, pickup, and objective cells.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 24 — Wasteland Contracts

**Goal:** give every round a fresh optional side objective and a persistent
career chase, encouraging players to change tactics without changing who wins.

**Locked design decisions**

- One shared contract is selected from seven: Hot Shot (8 landed attacks),
  Heavy Hitter (300 damage), On a Roll (3-kill streak), Road Warrior (25 map
  tiles traveled), Powder Keg (both barrels), Hill Dweller (20 hill seconds),
  and Tag Hunter (3 confirmed tags). Hill/Tag contracts only enter compatible
  mode pools; all other contracts work in every mode.
- Selection hashes match id + mode and consumes no gameplay RNG. A direct
  rematch excludes the previous contract; an explicit `FORCE_CONTRACT` smoke
  pin bypasses recency, matching the existing mutator-pin contract.
- Progress is server-authoritative and monotonic, derived from StatsTracker,
  Kill Confirmed score, or credited barrel detonations. It rides every
  `server:gameState` snapshot for reconnect safety and clamps at the target.
- Contracts are side bets only: they never modify score, damage, movement,
  ammo, pickups, awards, mode rules, or match outcome. Both players can finish
  the same contract independently. Practice shows/celebrates progress but
  never writes career stats.
- The HUD uses a compact card over the non-playable top perimeter plus a
  dedicated completion-callout lane, so it cannot erase mutator/overtime or
  streak messaging. Results show local completion/progress and the updated
  career total; lobby leaderboard rows add `C = CONTRACTS` totals.
- `PersistentStatsStore` keeps `contractsCompleted` in its existing version-1
  shape and back-fills zero for old files. One completed contract adds exactly
  one career completion at non-Practice match end.

**Acceptance criteria**

- [x] Every mode receives an achievable contract; objective-specific entries
      never appear in incompatible modes.
- [x] Hits, damage, longest streak, distance, barrels, hill time, and confirmed
      tags update independently per player and complete exactly at target.
- [x] Direct rematches cannot repeat the previous contract unless explicitly
      pinned; selection remains deterministic and does not perturb match RNG.
- [x] Live HUD, completion payoff, results summary, career persistence, old-file
      migration, and leaderboard totals degrade safely on partial/old payloads.
- [x] Contracts do not affect match balance or Practice persistence.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 25 — Combat Medals

**Goal:** recognize the improbable combat beats players retell after a round,
turning clean openers, rapid chains, and dead-man explosives into immediate
celebrations without changing the fight underneath them.

**Locked design decisions**

- The server stamps First Blood on the first non-suicide kill only. A suicide
  neither earns nor consumes it, so every match still has a real opener.
- Each killer owns a rolling rapid chain based on simulated match time. Kills
  at or before six seconds from the previous kill chain; anything later starts
  over at one. Counts 2/3/4+ present as Double Kill, Triple Kill, and Mayhem.
- From the Grave is true when the killer is already dead as the victim is
  eliminated, covering delayed grenades, barrels, axes, and other authoritative
  damage paths without weapon-specific client inference.
- `KillFeedEntry` carries optional `isFirstBlood`, `rapidKillCount`, and
  `isPosthumous` fields. Old clients ignore them; new clients gracefully retain
  the Session 12 streak/payback behavior when the fields are absent.
- Presentation priority is deterministic: Shutdown > From the Grave > rapid
  chain > First Blood > Payback > ordinary streak. This preserves the rarest
  story when one kill qualifies for several labels.
- Medals stay in the existing dedicated combat lane, with a subtle zoom pulse
  and pitch-shaped version of the existing kill sound. They never alter score,
  damage, vampire healing, respawns, awards, contracts, or mode rules.

**Acceptance criteria**

- [x] First Blood is once per match and cannot be stolen by a suicide.
- [x] Rapid chains use deterministic simulated time, include the six-second
      boundary, reset just beyond it, and scale without an N-player cap.
- [x] Delayed kills from an already-dead attacker are marked posthumous.
- [x] Local presentation resolves overlapping medals by the locked priority,
      stays silent for remote kills/suicides, and adds audiovisual emphasis.
- [x] Existing partial/old kill events retain streak/payback compatibility.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 26 — Wasteland Reputation

**Goal:** turn the contract completion total into a legible long-term identity,
giving every optional objective another reason to matter without introducing a
power grind or another persistence migration.

**Locked design decisions**

- Six ranks are derived from lifetime contract clears: Drifter (0), Scavenger
  (3), Road Dog (8), Marauder (15), Wasteland Veteran (25), and Legend of the
  Waste (40). The ordered frozen config is the sole threshold source.
- Rank is never persisted. Existing `contractsCompleted` data is sufficient,
  malformed values safely normalize to zero, and thresholds can evolve without
  migrating player files.
- The all-time board adds compact unique badges (`DRF`, `SCV`, `DOG`, `MAR`,
  `VET`, `LEG`) while preserving rank, W/L, and contract-total readability.
- Results show current progress to the next rank. Completing a contract exactly
  across a threshold replaces that copy with `RANK UP!` and a restrained pulse.
- Practice and old partial results show no rank line because they cannot bank a
  career clear. Max-rank players see their total clears rather than a fake next
  milestone.
- Reputation is cosmetic. It changes no stats schema, matchmaking, contract
  RNG, score, damage, movement, rewards, or mode rules.

**Acceptance criteria**

- [x] Thresholds, badges, titles, normalization, and next-rank math are covered
      by deterministic shared tests.
- [x] Results distinguish ordinary progress, a real threshold crossing, max
      rank, Practice, and old partial payloads without false promotions.
- [x] Leaderboard rows retain compatibility with stats that lack a contract
      total and remain within the compact lobby panel.
- [x] Desktop and mobile-landscape results keep reputation, controls, and
      rematch space visually separate with zero browser warnings/errors.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 27 — Hot Streaks

**Goal:** make winning the next real match matter beyond one result screen by
preserving active and personal-best win streaks across rematches and restarts.

**Locked design decisions**

- Every persisted player owns a current and best win streak. Wins extend both,
  losses reset only the current run, and draws hold the run rather than erasing
  it after a double-timeout stalemate.
- The existing version-1 stats file is extended in place. Older records backfill
  both fields to zero; writes remain asynchronous and outside the tick loop.
- Match results carry optional per-player before/after snapshots so the client
  can distinguish a genuinely new best, a tied old best, and a streak that just
  ended without guessing from totals.
- Practice neither advances nor breaks a streak and ships no streak snapshot.
  Forfeits retain their existing authoritative winner, so leaving cannot protect
  a run from the recorded loss.
- Each player's compact streak story sits beneath their nickname inside the
  stats panel. It does not consume the rivalry/contract/reputation/award lanes.
- Hot Streaks are bragging rights only. They never alter matchmaking, draft
  priority, rivalry-set score, combat, rewards, or mode rules.

**Acceptance criteria**

- [x] Consecutive wins, loss reset, draw preservation, restart persistence, and
      old-file backfill are deterministic and covered by store tests.
- [x] Match end ships authoritative before/current/previous-best/best snapshots
      to both real players and omits them from Practice.
- [x] Pure presentation distinguishes new best, active/tied best, ended, held,
      first-win, quiet, and old partial-result states.
- [x] A live seeded match shows winner and loser stories together at desktop and
      mobile-landscape sizes without colliding with names or stat rows.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 28 — Fighter Mastery

**Goal:** give every fighter a persistent, visible mastery chase so players have
a reason to build a main, revisit neglected characters, and make the next lock-in
feel like career progress rather than a disposable menu choice.

**Locked design decisions**

- Only real-match wins count, credited to the winner's server-authoritative
  locked fighter. Losses and draws do not move any character total.
- Five frozen cosmetic tiers use deliberately early milestones: Untested (0),
  Blooded (1), Proven (3), Veteran (7), and Master (15). Master continues to
  show open-ended wins.
- Per-character wins extend the existing version-1 lifetime record and backfill
  every roster key to zero. No separate mastery file or client persistence exists.
- Each reliable `matchFound` privately carries the receiving nickname's complete
  roster totals. Rematches therefore show the just-earned win immediately, and an
  old server safely produces an all-zero roster on the new client.
- Every character-select card shows tier plus progress to the next threshold in
  the existing name/stat gap. The line is informational and never changes which
  characters may be hovered, locked, or auto-selected.
- Practice may show the player's existing roster history to help choose a fighter,
  but its result never advances mastery. Mastery changes no combat or matchmaking.

**Acceptance criteria**

- [x] Tier thresholds, exact boundaries, invalid input, full-roster zero creation,
      and compact card copy are covered by deterministic pure tests.
- [x] Persistence credits only a winning locked fighter, survives restarts, and
      backfills the complete current roster in older files.
- [x] Initial and rematch `matchFound` messages carry local-only normalized totals;
      the rematch reflects the win recorded moments earlier.
- [x] All five tier/progress variants fit simultaneously on the live five-card
      roster without touching names, stats, ability copy, locks, or hit zones.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 29 — Fists Only

**Goal:** add a dramatic mid-match rule change that forces everyone into the
same readable, frantic close-range fight and makes familiar arenas play
differently without introducing another weapon or changing baseline balance.

**Locked design decisions**

- Activation equips every living or respawning fighter with punch, removes all
  grenades and special ammo, cancels reload state, and keeps enforcing that
  loadout after pickups and mode hooks until the match ends.
- Character abilities stay active. Fists Only changes the shared weapon layer,
  not the identity or signature move of the selected fighter.
- Random scheduling never combines Fists Only with Grenades Only, in either
  slot order. Gun Game also excludes it because the party mode's weapon ladder
  and the mutator's forced loadout cannot both own progression.
- Explicit FORCE pins continue to bypass random-roll exclusions and conflicts
  for focused development smoke tests, consistent with every existing mutator.
- Rusty recognizes punch range and closes into melee instead of circling at its
  normal rifle distance. No ranged bot behavior or shared physics changes.

**Acceptance criteria**

- [x] Activation strips guns and grenades, routes ordinary fire through the
      existing authoritative punch attack, and blocks grenade throws.
- [x] Respawns, pickups, and per-mode loadout hooks cannot escape the forced
      punch loadout while the mutator is active.
- [x] Random mid/final selection rejects the Fists Only + Grenades Only pair in
      both orders, including when the other slot is explicitly forced.
- [x] Gun Game excludes Fists Only from random rolls and Rusty can close, swing,
      and deal damage with punch through normal player input processing.
- [x] Two live clients synchronize the combined mutator label, FISTS loadout,
      zero grenades, and gun-free presentation with clean browser consoles.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 30 — Weapon Roulette

**Goal:** make the full polished weapon roster matter inside ordinary matches
by repeatedly changing the shared fighting style, while keeping every swap fair,
readable, and independent of baseline weapon-balance changes.

**Locked design decisions**

- Every fighter shares the same deterministic shotgun → pistol → punch → rifle
  cycle. Each step lasts ten seconds and restocks equal, deliberately limited
  ammo only when the step begins.
- Empty shotgun or pistol magazines remain empty until the next shared step;
  they never auto-revert to rifle and then refill themselves on enforcement.
- Respawns and compatible mode hooks cannot escape the current shared weapon.
  Gun-ammo, shotgun, and pistol pickups disappear when Roulette activates;
  grenades, bandages, character abilities, and objective rules remain live.
- Random scheduling never combines Roulette with Fists Only or Grenades Only,
  and Gun Game excludes it because both systems must own the weapon sequence.
  Explicit FORCE pins retain their existing safety-bypass semantics.
- Each authoritative local weapon change produces a compact cyan banner, a
  short pickup sting, and a zoom pulse. The first activation snapshot stays
  quiet because the normal mutator-start banner already owns that beat.

**Acceptance criteria**

- [x] Activation gives every fighter a fully stocked shotgun even if someone
      already held a partially depleted shotgun, then advances all fighters
      through pistol, punch, and rifle on the frozen ten-second cadence.
- [x] Dry special weapons do not revert early; respawns rejoin the current step;
      obsolete ammo and weapon pickups are retired for the rest of the match.
- [x] Random scheduling prevents every pair of loadout-owning mutators in both
      slot orders, including forced-final constraints, and Gun Game vetoes
      Roulette from random rolls.
- [x] Pure presentation tests cover silent seeding, inactive/same-weapon states,
      and every visible weapon transition.
- [x] A live two-player forced match renders the combined mutator label and
      visibly advances a stocked shotgun to a stocked pistol.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 31 — One in the Chamber

**Goal:** add a tense, instantly understandable party mode where one accurate
shot can decide an exchange, a miss forces a dangerous melee comeback, and
every kill creates the satisfying promise of another loaded chamber.

**Locked design decisions**

- First to 8 opponent kills wins. Every fighter receives exactly one pistol
  round on match start, respawn, and scored kill; the round has no reserve and
  cannot reload normally.
- Pistol and punch hits are lethal only after the existing authoritative
  lag-comp validation succeeds. Spawn invulnerability remains intact. A missed
  pistol round swaps to fists; a pistol-triggered barrel kill also scores and
  earns the chamber because no other enabled action can trigger that hazard.
- The mode owns the full combat economy: only bandages spawn; grenades and
  character abilities are disabled; respawn and overtime re-chamber before the
  next playable snapshot. Existing weapon and ammo fields carry all state, so
  there is no parallel client timer or new network event.
- Random rolls exclude Grenades Only, Infinite Ammo, Fists Only, Weapon
  Roulette, Low Health, Vampire, and Turbo Grenades. The first four conflict
  with scarcity/loadout ownership; the last three are redundant no-effect
  rolls. Big Heads, Blackout, Super Speed, and Second Wind remain meaningful.
  Explicit FORCE pins keep their development safety-bypass semantics.
- The middle HUD names `CHAMBER LOADED`, `FISTS - EARN A ROUND`, and the
  countdown/death pending states. Desktop and touch input suppress grenade,
  reload, and ability actions client-side as well as server-side; touch hides
  those buttons. Rusty uses ordinary inputs and naturally closes to punch range
  after spending its shot.

**Acceptance criteria**

- [x] Match start, respawn, scored kill, and tied overtime each provide exactly
      one pistol round with zero reserve; missing transitions to punch without
      exposing the generic rifle.
- [x] Direct pistol and punch hits kill through the normal lag-comp/damage path;
      spawn protection survives; pistol-triggered barrels score; suicides and
      disabled/off-rule weapons do not.
- [x] Grenades, detonation, abilities, reloads, weapon/ammo pickups, and their
      misleading client controls are unavailable; bandages remain.
- [x] Rotation, draft cards, countdown briefing, score/results surfaces, Rusty,
      first-to-8 ending, and sudden-death overtime all recognize the mode.
- [x] HUD pure tests cover loaded, fists, countdown, and respawn copy; live
      browser QA renders the briefing, loaded state, missed-shot fists state,
      meaningful stacked mutators, and results with a clean console.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 32 — Shootable Arena Gates

**Goal:** make arenas evolve through deliberate player choices, turning a
single shot into a permanent shortcut, flank, escape route, or fresh sightline
that changes how the rest of the round is played.

**Locked design decisions**

- Every arena authors rotationally paired one-cell gates on interior `WALL`
  tiles. Wasteland Outpost, Overgrown Suburb, and Scrapyard carry two; the
  denser Collapsed Overpass carries four. Each gate bridges walkable cells on
  opposite sides, and every map remains fully connected while gates are closed.
- A non-piercing rifle, pistol, or shotgun ray that terminates on a closed gate
  opens it permanently. Exposed grenade/barrel blasts and Bruce's fire breath
  also open gates through their existing destruction paths. Punches and
  Mighty Man's piercing rays do not stop on scenery and therefore do not open
  gates; this keeps the rule consistent with existing hit semantics.
- The server owns the closed-gate set and live collision mutation. Gate openings
  reuse the reliable `server:tilesDestroyed` message, so there is no parallel
  wire state, client timer, respawn reset, or new network message. Rusty reads
  the same live grid and naturally replans through newly opened routes.
- `MapDecoration.interaction: "shootable_gate"` carries the authored gameplay
  meaning. Validation requires a one-cell interior wall and forbids combining
  an interaction with a hazard. Registry tests enforce pairing, solid backing,
  and meaningful opposite-side walkability on every shipped map.
- The client starts the 21×22 art on closed frame 6, scales by frame height to
  fit one 48px tile, plays frames 6→0 at 18 FPS, and retains frame 0 as open
  fence posts after removing the wall layer and prediction collision.

**Acceptance criteria**

- [x] Every shipped map has validator-approved, rotationally paired gates that
      bridge real lanes without breaking closed-map spawn reachability.
- [x] Rifle/pistol, multi-pellet shotgun, grenade/barrel blasts, and Bruce's
      fire breath open a gate once and broadcast one authoritative cell update.
- [x] Client collision clears on the existing reliable event while the gate
      animates from closed to open and remains visibly open afterward.
- [x] Pure presentation tests cover reverse frame order and tile-fit scaling;
      match tests cover every supported destruction route and one-shot state.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 33 — Rook + Breach Dash

**Goal:** add a sixth main whose ability changes moment-to-moment positioning,
giving aggressive players a frequent tool for flanks, escapes, and sudden angle
changes without adding another damage source.

**Locked design decisions**

- Rook is a 95 HP, 1.10× speed flanker. Breach Dash moves three tiles along
  the current aim angle on an 8-second cooldown. It deals no damage, grants no
  invulnerability, ignores other players like ordinary movement, and stops at
  the last safe point before live map collision.
- `calculateDashEndpoint()` is shared physics. Server activation, immediate
  client prediction, and unacknowledged-input reconciliation all call the same
  sweep. A point-blank obstruction refunds the cooldown; a legal partial dash
  consumes it. One in the Chamber disables both authority and prediction.
- Rook reuses Mighty Man's body and shared weapon overlays, then layers the
  asset pack's real Helmet strips through `CharacterDef.bodyOverlay`. The
  overlay stays synchronized through idle, run, punch, death, freeze tint, and
  big-head scaling. Only the curated rendered sheets are checked in.
- The six-card selector remains a single readable row at 960px. Rook receives
  the same persistent Fighter Mastery path automatically through the dynamic
  `CHARACTER_IDS`/`createEmptyCharacterWins()` contracts.

**Acceptance criteria**

- [x] Rook can dash instantly in any aim direction, travel the full three
      tiles on open floor, stop before walls/bounds, and cannot recast during
      the 8-second cooldown.
- [x] Prediction and reconciliation reproduce the server endpoint exactly;
      ability-disabled modes do not predict a dash.
- [x] Helmet art animates over every living/combat/death state and appears in
      the six-fighter selector; attribution lists every curated source family.
- [x] HUD cooldown, activation callout, local streak/ring effect, bots, roster
      selection, stats, and mastery all accept Rook without special persistence
      migration.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 34 — Scavenger Caches

**Goal:** turn ordinary cover into an optional tactical bet: spend attention
and ammunition opening a route, reveal a shared unknown reward, then decide
whether to claim it immediately or bait the opponent into the new sightline.

**Locked design decisions**

- Every shipped arena gets exactly two one-cell caches arranged as a 180°
  rotational pair. Each uses the existing red ammo-crate art over
  `COVER_LOW`; opening it permanently clears that match-local collision cell.
- Rifle, pistol, and shotgun scenery hits can open caches. Exposed grenade and
  barrel blasts use the same blastable-cover path. Bruce remains wall-only,
  while punches and Mighty Man's piercing shots retain their existing scenery
  semantics; this feature does not silently broaden unrelated abilities.
- Both caches in one match contain the same deterministic reward, selected
  from a frozen weighted table without consuming spawn/mutator RNG: two slots
  each for ammo, bandage, and grenade, plus one each for pistol and shotgun.
  The first opened cache reveals the round's hidden value without creating an
  asymmetric loot roll.
- Mode pickup filters apply before selection, so Gun Game and One in the
  Chamber caches contain bandages only. If a loadout-owning mutator activates
  before a cache opens, stale gear becomes sustain; infinite-ammo and
  low-health edge cases swap a redundant reward to a grenade.
- Cache drops are active one-shot `PickupState`s. After collection they remain
  inactive for one snapshot (preserving typed positional SFX), then disappear
  forever. They do not respawn or participate in shotgun incoming warnings.
- The client needs no parallel cache-open message: the reliable existing
  tile-destruction event clears prediction collision, crushes/fades the crate,
  emits a gold burst, and the next authoritative pickup snapshot reveals loot.

**Acceptance criteria**

- [x] Every arena has one validator-approved rotational cache pair on low
      cover, without overlapping spawns or authored pickup locations.
- [x] Rifle/shotgun impacts and exposed explosions open each cache once,
      clear live collision, and spawn exactly one reward at tile centre.
- [x] Paired caches share a deterministic weighted reward; incompatible modes
      and mutators cannot leak unusable weapons or ammo.
- [x] Cache rewards collect through normal pickup effects and retire without
      respawning; the live client renders both crates and their open burst.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 35 — Core Run

**Goal:** add a mobile objective mode where taking control is only the start;
the scoring player must survive and move while every opponent has a clear,
urgent reason to hunt them.

**Locked design decisions**

- A neutral glowing core begins at each arena's geometric centre. Any living
  fighter inside 30px may claim it; simultaneous claims resolve by distance,
  then stable player id, so authority is deterministic and N-player safe.
- The carrier earns one score point per full second. First to 45 wins; ties at
  regulation retire the objective and use the shared first-kill overtime.
- Carrier death drops the core at that exact position. If nobody reclaims it
  within 12 seconds it returns home, preventing an abandoned objective from
  hiding indefinitely in a remote corner.
- Ordinary weapons, grenades, abilities, mutators, ammo, healing, and grenade
  pickups stay live. Pistol and shotgun pickups are disabled so the central
  objective does not also grant a special-weapon advantage; cache filtering
  follows the same mode contract automatically.
- The persistent `CoreRunState` snapshot is the sole presentation contract.
  It drives the world marker, possession HUD, transition callouts, Blackout
  light beacon, and reconnect-safe state without a fragile transient event.
- Rusty prioritizes a loose core even when no opponent is alive, then resumes
  normal combat pursuit once somebody carries it. The mode adds the Core
  Runner contract for 15 authoritative seconds of possession.

**Acceptance criteria**

- [x] Core collection, second-based scoring, deterministic contested claims,
      death drops, timed returns, target wins, and overtime retirement are
      authoritative and covered by isolated plus Match integration tests.
- [x] Mode draft, FORCE/no-draft rotation, rematches, results, contracts,
      pickup filtering, and snapshots all accept Core Run.
- [x] The live client renders loose/local/rival states, possession HUD and
      callouts, plus Blackout visibility, without inferring objective state.
- [x] Rusty pursues a loose core using the normal movement/input pipeline.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 36 — Wasteland Warp

**Goal:** add a legible chaos mutator that repeatedly overturns positioning,
making players improvise around new sightlines, pickups, hazards, and moving
objectives instead of settling into one dominant route.

**Locked design decisions**

- Activation starts an 8-second warning clock; every 12 seconds afterward,
  all living fighters rotate through one another's current positions.
- Rotation order is stable player id, destinations are already-valid player
  coordinates, and arrival velocity is zero. This avoids random unfairness,
  wall placement, and 1v1-only assumptions.
- Dead fighters neither donate nor receive a destination. Fewer than two
  living fighters advance the clock without emitting a false rotation edge.
- The authoritative persistent snapshot carries seconds until warp and a
  sequence that increments only after a real rotation. Reconnects see the
  correct countdown without replaying old effects.
- The active-mutator strip shows the rounded countdown. Each later sequence
  edge adds a violet flash, callout, zoom beat, and low UI sting; the first
  observed snapshot stays quiet.
- Existing combat, projectiles, objectives, pickups, bots, modes, and stacked
  mutators continue normally from the new positions. Sudden-death overtime
  retires further warps.

**Acceptance criteria**

- [x] Server tests cover timed swaps, velocity clearing, lone-survivor skips,
      overtime retirement, and persistent snapshot delivery.
- [x] Client tests cover countdown composition, reset/mirroring, and stale-edge
      suppression; every exhaustive mutator surface recognizes the new id.
- [x] A forced two-player Chromium smoke observes sequence 0, the first real
      authoritative rotation, and the client-presented sequence 1 edge.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 37 — Last Laugh

**Goal:** make every death leave a brief, readable tactical consequence that
can punish careless pursuit, create posthumous reversals, and grow into
memorable chain reactions without adding a separate damage system.

**Locked design decisions**

- Every regulation death spawns one stationary grenade at the victim's final
  position with a 1.4-second fuse, owned by that victim for kill attribution.
- Death bombs use the existing explosion pipeline, including line of sight,
  character modifiers, destructible cover, barrels, posthumous medals, and
  secondary Last Laugh chains.
- Spawning a death bomb neither consumes grenade inventory nor records a normal
  player throw. Uncredited N-player self-grenade deaths still leave one.
- A red accelerating pulse distinguishes death bombs from thrown grenades, and
  each becomes a temporary Blackout light beacon so the threat stays readable.
- Overtime suppresses new death bombs and its normal grenade cleanup retires
  any live fuse. Random Gun Game and One in the Chamber scheduling excludes the
  mutator because free explosive kills would corrupt their weapon economies;
  explicit FORCE pins retain the project's intentional smoke-test override.

**Acceptance criteria**

- [x] Authority tests cover exact bomb state, unchanged inventory, posthumous
      attribution, chained deaths, overtime suppression, and N-player suicide.
- [x] Gun Game and One in the Chamber random pools exclude Last Laugh while the
      shared display and mutator surfaces remain exhaustive.
- [x] The client renders an authoritative accelerating red fuse pulse and adds
      death bombs to Blackout's dynamic light beacons.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 38 — Bounty Hunt

**Goal:** add a moving human objective that continuously redirects fights,
rewards both pursuit and a marked player's counterattack, and creates clear
three-point reversals without replacing the game's ordinary combat sandbox.

**Locked design decisions**

- One living fighter is marked throughout regulation. Ordinary kills score 1,
  the mark's kills score 2, and killing the mark scores 3 and transfers the
  bounty to a living killer. The first fighter to 25 points wins.
- The opening target is a stable hash of match id over sorted player ids, so no
  lobby slot receives a permanent advantage. Dead, self-killed, or missing
  targets rotate through the stable N-player order.
- Posthumous killers receive the full bounty payout but cannot retain the mark;
  the next living target is selected on the following authority tick.
- Every snapshot carries `BountyHuntState`. The client projects it into a gold
  pulsing world label, local/rival HUD copy, transfer callouts, zoom/audio beats,
  and a Blackout beacon without predicting target ownership.
- Rusty prioritizes a rival bounty over nearer hunters. Sudden-death overtime
  freezes mode scoring and retires the mark before its first-kill resolution.

**Acceptance criteria**

- [x] Isolated mode tests cover stable opening selection, 1/2/3 scoring,
      transfer, dead-target rotation, score target, ties, and overtime.
- [x] Match, matchmaking, and network tests cover live target state, payout,
      results, snapshot delivery, mirroring, reset, and the eight-mode cycle.
- [x] Client HUD tests cover local/rival/retired copy; Rusty and the live scene
      follow the authoritative mark, including Blackout readability.
- [x] A real Chromium draft reaches Bounty Hunt and observes its target, gold
      world marker, and mode HUD before the full Playwright matrix completes.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 39 — Power Weapon Drops

**Goal:** turn deaths with a scarce special weapon into a short, readable
contest that rewards aggressive recovery and opportunistic steals without
creating ammo from nothing or compromising mode-owned loadout economies.

**Locked design decisions**

- A regulation death spills a carried shotgun or pistol at the victim's
  authoritative position for 14 seconds. Dry weapons never create clutter.
- The server stores the exact surviving magazine plus reserve on the one-shot
  pickup. Collection splits that same total into the new holder's magazine and
  reserve; authored map weapons and cache rewards still grant their normal
  full pickup ammo.
- The wire exposes only `isDroppedWeapon` and the authoritative expiry
  countdown. The client uses those fields for a gold pulse that accelerates as
  the contest window closes; the ammo payload remains server-only.
- Ordinary credited deaths and uncredited N-player self-grenade deaths both
  spill weapons. Sudden-death overtime suppresses new drops.
- Gun Game, One in the Chamber, and Core Run pickup vetoes remain final.
  Fists Only, Weapon Roulette, and Grenades Only suppress new drops and retire
  existing special-weapon pickups when their loadout authority begins.
- Non-expiring cache one-shots retain their existing lifetime, collection
  snapshot, ammo, and no-respawn behavior.

**Acceptance criteria**

- [x] Authority tests cover exact ammo preservation, collection, expiry, dry
      weapons, overtime, mode vetoes, loadout mutators, and N-player suicide.
- [x] Cache rewards remain non-expiring and authored special pickups retain
      full-ammo behavior.
- [x] The client renders dropped weapons from authoritative state with a gold,
      increasingly urgent pulse.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 40 — Clutch Kills

**Goal:** celebrate the game's closest living finishes with authoritative,
exact-HP feedback so narrow victories become stories players want to repeat.

**Locked design decisions**

- A living fighter earns Clutch for an opponent kill at or below 25% max HP.
  The threshold is inclusive and centralized in `COMBAT_MEDALS`.
- Authority captures the killer's health before the existing 50% post-kill
  heal, then stamps that value onto the reliable `KillFeedEntry`.
- Suicides, remote presentation, and already-dead posthumous killers cannot
  earn Clutch. Old kill events remain compatible because the field is optional.
- The client rounds fractional health up for honest, readable `N HP LEFT`
  copy and adds the standard medal pulse plus a distinct confirmation pitch.
- Story priority stays deterministic: shutdown, From the Grave, and rapid
  chains outrank Clutch; Clutch outranks First Blood, Payback, and streak copy.
- Clutch changes no damage, healing, score, stats, awards, respawns, mode
  rules, or persistence.

**Acceptance criteria**

- [x] Authority tests cover the inclusive threshold, pre-heal capture,
      healthy kills, suicides, and posthumous kills.
- [x] Client tests cover exact rounded HP copy, presentation emphasis, story
      priority, old-event compatibility, remote kills, and suicides.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 41 — Scavenger Rush

**Goal:** turn familiar arena routes into recurring risk/reward decisions by
moving a valuable, short-lived supply contest around the whole map.

**Locked design decisions**

- Activation launches the first supply immediately; later supplies arrive
  every 12 seconds. Each lasts 8 seconds, so the map gets a readable four-
  second breath and never carries overlapping Rush loot.
- Supplies rotate through authored KOTH anchors. A stable match-id offset and
  sequence choose positions without consuming respawn, combat, or mutator RNG;
  legacy/test maps fall back to pickup anchors and then spawn anchors.
- Rewards reuse the weighted Scavenger Cache table: common ammo/healing/
  grenades with rare pistol, shotgun, or bat hits. Live mode and loadout ownership
  substitutes unusable rolls before the pickup enters the snapshot.
- Gun Game and One in the Chamber exclude the random mutator because their
  complete economies reduce every reward to a low-value bandage. Explicit
  FORCE pins remain safe and obey the final mode veto.
- `isScavengerRushDrop` and authoritative expiry make late joins/reconnects
  honest. The client adds a cyan halo, `SUPPLY` label, and accelerating pulse;
  authored pickups, permanent cache rewards, and corpse weapons keep their
  existing presentation.
- Rusty pursues a live supply in ordinary combat modes, while tags, the loose
  core, and the KOTH hill retain movement priority. Overtime removes the live
  supply and suppresses every later spawn.

**Acceptance criteria**

- [x] Authority tests cover immediate spawn, authored-anchor rotation, expiry,
      no overlap, stable cadence, mode ownership, and overtime retirement.
- [x] Pickup, bot, config, and client tests cover snapshot flags, selective
      cleanup, Rusty pursuit, constants, neutral compatibility, and urgency.
- [x] Every exhaustive mutator display/flash surface recognizes the new id.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 42 — Wasteland Bat

**Goal:** deepen the ordinary weapon sandbox with a scarce melee power weapon
that rewards route control, ambush timing, and the nerve to close distance.

**Locked design decisions**

- The bat occupies the existing special-weapon slot and carries four swings.
  Every trigger pull spends one swing, including a miss; the fourth swing
  immediately returns its owner to the rifle. Infinite Ammo keeps it full.
- A swing deals 80 flat damage through nine deterministic rays spread evenly
  across a 110-degree arc with 72px reach. Walls block it, lag compensation
  rewinds it, and each victim can take damage only once per swing while one
  committed sweep can still catch multiple fighters.
- Every arena gets one active-at-opening, silent-respawning bat pickup away
  from its pistol route. Its standard respawn remains 30 seconds. Scavenger
  Caches and Scavenger Rush gain the bat as a third rare weapon reward.
- Power Weapon Drops preserve the exact remaining swings for 14 seconds.
  Core Run vetoes the bat pickup; Fists Only, Weapon Roulette, and Grenades
  Only retire it when they take ownership. Gun Game and One in the Chamber
  retain their complete bandage-only economies.
- Rusty recognizes the bat as melee, closes inside 65% of its reach, never
  attempts to reload it, and can collect it under the existing pickup rules.
- Every fighter renders the held bat independently of gun-overlay support.
  A handle-pivoted heavy sweep, body attack animation, pitched melee audio,
  pickup sprite, HUD icon, remaining-swing count, and hidden long-range aim
  line make its state readable on desktop and mobile without a new input.
- Bat eliminations count in lifetime weapon stats and can earn the unique
  `Slugger` end-match award for a strict match-leading total of at least one.

**Acceptance criteria**

- [x] Shared and server tests cover tuning, spawn/equip/respawn, finite swings,
      cooldown, range, wall blocking, lag compensation, multi-victim sweeps,
      infinite ammo, mode vetoes, and ammo-honest death drops.
- [x] Bot, award, persistence, map, and cache tests cover melee pursuit,
      Slugger, old-save backfill, exactly one spawn per arena, and rare loot.
- [x] Client tests cover pickup/HUD presentation, every-fighter held rendering,
      aim-line behavior, deterministic sweep transforms, and compatibility.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 43 — Radiation Storm

**Goal:** break late-match corner camping with a readable moving-pressure rule
that creates closing fights without awarding arbitrary environmental kills.

**Locked design decisions**

- Radiation Storm joins the ordinary two-slot mutator pool. It conflicts with
  Low Health so both random slots always retain meaningful pressure; explicit
  FORCE pins keep their existing smoke-test override semantics.
- The safe-zone center is chosen deterministically from the arena's authored
  KOTH anchors using the match id, without consuming combat, respawn, mutator,
  or bot RNG. Legacy/test maps fall back to a walkable spawn anchor.
- On activation the safe radius covers the entire arena, then shrinks linearly
  for 18 seconds to 144px and holds there. One-second radiation pulses remove
  10 health outside the radius, but never below 1 HP and never through spawn
  invulnerability. The storm therefore creates finishing opportunities without
  kills, score, stats, contracts, Vampire healing, or Iron Hide ambiguity.
- Sudden-death overtime retires the storm completely before its fresh spawns.
  Every reconnecting client receives the authoritative center, radius, and
  shrink progress in normal game snapshots.
- Rusty treats reaching the safe zone as its first movement priority only while
  outside; once safe, mode objectives, supplies, and combat regain their normal
  ordering. It still aims and fights while retreating.
- The client renders a pulsing radioactive boundary plus an outside-only green
  screen wash and `RADIATION — MOVE INSIDE` warning. The persistent mutator
  label shows rounded shrink time, and all presentation is snapshot-driven for
  desktop, mobile, reconnects, and Practice.

**Acceptance criteria**

- [x] Shared/server tests cover constants, display/conflict semantics,
      deterministic anchors, full-arena opening radius, linear shrink, final
      hold, pulse cadence, nonlethal floor, invulnerability, and overtime.
- [x] Network and bot tests cover reconnect/clear behavior plus outside-first
      routing that yields back to ordinary goals inside the zone.
- [x] Client tests cover boundary projection, rounded countdown copy, outside
      detection, warning visibility, and exhaustive event color/display maps.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 44 — Rusty's Scavenger Instincts

**Goal:** make Practice exercise the arena's full tactical economy instead of
letting every authored weapon, heal, grenade, and ammo route belong to the
human by default.

**Locked design decisions**

- Rusty evaluates active ordinary pickups using server-visible state only.
  Health, carried weapon/ammo, grenades, pickup type, lifetime, and distance
  determine whether a resource is useful; no hidden knowledge or combat-rule
  shortcut is introduced.
- Radiation safety and live mode objectives remain absolute movement
  priorities. Kill Confirmed tags, a loose Core Run core, the KOTH hill, and a
  marked Bounty Hunt target cannot be abandoned for ordinary loot.
- Expiring Scavenger Rush supplies keep their existing priority outside those
  objective obligations. Ordinary resources are considered next, then normal
  combat pursuit, and Rusty keeps aiming and fighting while taking a detour.
- Detours are range-limited and deterministic. Critical bandages outrank
  weapons, weapons outrank refill supplies, and distance breaks equal-value
  ties. Rusty never replaces a live bat or shotgun with the pistol sidegrade,
  never chases a full health/ammo/grenade refill, and may refresh a nearly dry
  held special weapon.
- Pickup collection remains completely generic: Rusty walks through the same
  authoritative overlap and `PickupManager.applyPickup` path as a player.
  Game-mode and mutator pickup vetoes therefore remain the economy authority.

**Acceptance criteria**

- [x] Pure tests cover pickup usefulness, power-weapon preservation, refill
      thresholds, bounded detours, deterministic priority, and tie-breaking.
- [x] Bot integration tests cover resource detours while fighting plus storm,
      KOTH, Kill Confirmed, Core Run, and Bounty Hunt objective precedence.
- [x] A live Practice smoke verifies Rusty visibly collects an authored arena
      resource through the normal networked match path.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 45 — Scrap Armor

**Goal:** add a proactive defensive arena resource that creates contested
routes before a fighter is already wounded.

**Locked design decisions**

- Every arena places one immediately active Scrap Armor plate in its contested
  center lane. It grants a 35-point shield, caps at 35, and respawns after 25
  seconds; Scavenger Caches and Scavenger Rush may also roll it as a rare reward.
- Ordinary authoritative combat damage applies Iron Hide first, then drains
  armor before health. The entire post-reduction hit still counts as landed
  damage for stats, contracts, Vampire, and feedback. Radiation bypasses armor
  and remains nonlethal environmental pressure.
- Armor clears on every respawn and overtime reset. Low Health clears all live
  shields and retires armor pickups; Gun Game and One in the Chamber keep their
  existing bandage-only economies. Core Run permits armor because it does not
  replace the mode-owned weapon loadout.
- Clutch requires both critical health and an empty shield. Rusty seeks an
  unclaimed plate below power weapons but above ordinary healing, while full
  armor is never worth a detour.
- The shield is explicit in authoritative player snapshots. Local and overhead
  cyan bars expose it to every fighter; the procedural riveted-plate pickup and
  weighted collection sound make the center objective readable without a new
  attributed asset.

**Acceptance criteria**

- [x] Pickup, combat, match, bot, mode, map, network, and pure presentation
      tests cover the complete shield lifecycle and cross-feature contracts.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.
- [x] A live Practice smoke verifies the authored center plate, normal match
      flow, and clean browser logs; deterministic tests cover collection,
      local/remote shield projection, and combat absorption.

---

## Session 46 — Scrapstorm

**Goal:** add a short, readable burst of localized movement pressure that breaks
up passive positions without stealing kills or making damage feel arbitrary.

**Locked design decisions**

- Scrapstorm waits 2.5 seconds before its first warning, then starts a warning
  every 6 seconds. Each warning paints a 96px-radius circle for 1.5 seconds and
  resolves for 45 raw damage.
- A stable round-robin selects living fighters. The server captures the chosen
  fighter's position when the warning begins and never tracks afterward, so a
  prompt dodge always escapes even if another fighter enters the blast.
- Impacts fall from above and therefore ignore walls. They respect death,
  invulnerability, Iron Hide, and Scrap Armor, then clamp health at 1. They
  never kill, score, record damage stats, progress contracts, heal Vampire, or
  create kill-feed entries.
- `ScrapstormState` is authoritative and present during active regulation, with
  null target/countdown fields during quiet windows. Overtime retires it before
  fresh spawns. Random schedules prevent pairing it with Low Health or Radiation
  Storm, while explicit FORCE pins remain available for diagnostics.
- Rusty gets immediate active-blast safety priority and chooses a deterministic
  open escape tile. The client renders an orange filled ring, inward ticks,
  progress arc, decimal countdown, local move warning, persistent mutator label,
  and environmental impact VFX/SFX entirely from authoritative state.

**Acceptance criteria**

- [x] Pure and integration tests cover cadence, stable capture-not-track
      targeting, area damage, nonlethal policy, defense order, overtime,
      conflict scheduling, snapshots, bot escape, and client presentation.
- [x] A live Practice smoke verifies a readable warning and impact under a
      compatible Blackout pairing with clean browser logs.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 47 — Overcharge Cells

**Goal:** create a scarce arena resource that brings each fighter's signature
ability back into play and makes the center worth contesting repeatedly.

**Locked design decisions**

- Every arena places exactly one immediately active Overcharge Cell in the
  unused tile of its central 2x2 resource square. Authored cells respawn after
  30 seconds; Scavenger Caches and Scavenger Rush may also roll one rarely.
- Collection succeeds only for a living fighter whose ability effect is not
  active and whose cooldown has at least 2 seconds remaining. A successful
  claim clears the full cooldown; ready, nearly-ready, and active abilities
  leave the cell available rather than wasting it.
- Gun Game and One in the Chamber retain their bandage-only pickup economies.
  Core Run permits the cell because it changes neither the carried objective
  nor weapon ownership.
- Rusty values a useful cell below the shotgun and bat, but above Scrap Armor.
  The compatible `POWER TRIP` contract counts only successful authoritative
  collections and asks each fighter to claim two cells.
- The client reuses ordinary pickup snapshots and collection events. A
  procedural violet canister with a yellow lightning core, pulsing violet
  `CHARGE` halo, high-pitched pickup sound, and local `OVERCHARGED / ABILITY
READY` callout make the reward distinct without a new asset or wire message.

**Acceptance criteria**

- [x] Config, map, pickup, match, bot, mode, and client presentation tests cover
      useful-collection gates, full reset, respawn, compatible modes, contract
      progress, deterministic bot priority, central placement, and pulse.
- [x] A pinned Practice smoke verifies authoritative state plus the visible
      cell/halo and `POWER TRIP` HUD through the normal networked match path,
      with a clean fresh browser console.
- [x] Typecheck, lint, all unit tests, production build, and Playwright pass.

---

## Session 48 — Twin-Stick Controller Support

**Goal:** make the browser shooter feel natural from the couch and let a
controller carry a player through the entire match/rematch loop.

**Locked design decisions**

- The first connected standard browser gamepad is sampled once per input tick.
  A circular 20% dead zone removes drift while rescaling the remaining stick
  range; meaningful stick or button intent automatically takes control, while
  mouse movement, keyboard presses, and touch reclaim their native modes.
- Left stick moves, right stick aims, RT holds/releases gun aim/fire, and LT
  holds/releases grenade aim/throw or presses to detonate a live grenade. LB or
  L3 sprints, RB uses the character ability, and X/Square reloads. These map to
  the existing `RawInput`/`PlayerInput` contract with no new wire or physics
  path.
- D-pad/left stick plus A/Cross, B/Circle, and X/Square navigate the lobby,
  map/mode draft, character select, and results. Controller focus reuses the
  same `PixelButton` callbacks, disabled states, sounds, and server-authoritative
  actions as pointer input.
- Controller activation hides the stale mouse crosshair and displays one short
  mapping callout. Optional haptics pulse only for locally valid fire, grenade,
  ability, and damage feedback; unsupported devices fail silently.
- Touch and mobile-landscape behavior remain unchanged and first-class. A
  controller can be connected or removed mid-round without pausing or opening a
  settings screen.

**Acceptance criteria**

- [x] Deterministic tests cover radial dead zones, persistent aim, trigger
      release edges, grenade throw/detonate gating, sprint/reload/ability
      buttons, disconnects, haptics, menu edge behavior, and transition-safe
      priming.
- [x] A synthetic standard-gamepad Playwright smoke launches Practice from the
      lobby, locks a fighter, takes control in live play, moves, aims, fires on
      RT release, shows the mapping callout, and invokes haptics through the
      normal networked match path.
- [x] Typecheck, lint, all unit tests, production build, and the unpinned
      Playwright matrix pass; desktop visual review and mobile regression remain
      clean.

---

## Session 49 — Wasteland Gauntlet

**Goal:** turn solo play into a compact, escalating run with a clear beginning,
climax, and immediate reason to try again.

**Locked design decisions**

- Gauntlet is an explicit lobby choice beside ordinary Rusty Spar. Spar keeps
  the player's selected difficulty; Gauntlet always opens at Rookie and ignores
  any client-supplied difficulty.
- The run is exactly three authoritative Practice fights: Rookie, Scrapper,
  then Warlord. A human win advances one stage, a stage-three win clears the
  run, and either a loss or draw ends it and resets the next fight to stage one.
- The server owns stage assignment and resolution. Optional Gauntlet metadata
  rides in `server:matchFound` and `MatchResult`; the client only presents it
  and requests the ordinary direct-Practice rematch action.
- Maps and modes rotate through the existing direct-rematch path. Fresh-chaos
  mutator exclusions and fresh contracts carry forward unchanged, so the run
  gains variety without a second match engine.
- Gauntlet remains Practice: it never writes lifetime stats or leaderboards.
  It also omits ephemeral Rivalry Set scoring so its only visible score is the
  run itself.
- Character select names the current stage and Rusty level. Results distinguish
  `STAGE CLEAR`, `RUN ENDED`, and `GAUNTLET CLEAR`, preview the next fight, and
  offer `NEXT FIGHT` or `RETRY RUN` through the normal rematch callback.

**Acceptance criteria**

- [x] Pure shared tests cover stage normalization plus win, loss, draw, advance,
      and clear outcomes; pure client tests cover all labels and action states.
- [x] Matchmaking integration proves server-owned Rookie/Scrapper/Warlord
      progression, reset after failure, and isolation from Rivalry Sets and
      lifetime PvP stats.
- [x] A dedicated real-client Practice smoke launches Gauntlet, observes
      authoritative stage-one Rookie metadata and briefing copy, and reaches
      live play through the normal network path.
- [x] The lobby choice and solo-run copy fit the desktop UI without weakening
      Quick Match or ordinary difficulty-selectable Spar.
- [x] Typecheck, lint, all unit tests, production build, and the unpinned
      Playwright matrix pass.

---

## Session 50 — Gauntlet Score Attack

**Goal:** give every Gauntlet fight a readable secondary target and every full
clear an immediate “one more run” challenge.

**Locked design decisions**

- Score is server-authoritative and additive across the three-fight run. A
  human stage win banks 1,000 points, a completed round contract adds 300, and
  winning before overtime adds 200. All values live in the frozen shared
  `PRACTICE_GAUNTLET` config; a perfect clear is 4,500.
- Losses and draws bank no new points. Their result still shows the score earned
  before the failure, while `RETRY RUN` launches stage one at zero. A full clear
  similarly displays its final score before the next run resets.
- Authoritative match-found metadata carries the current bank into character
  select. Match results carry the stage score, run total, and exact bonus
  breakdown so clients never reconstruct or award points.
- Only completed clears can update `BEST CLEAR`, stored in browser-local storage
  as a lightweight device record. Mid-run scores and failed runs cannot replace
  it; the record has no server, leaderboard, lifetime-stat, or PvP effect.
- The lobby exposes the target, character select exposes the current bank, and
  results show the stage breakdown plus a `NEW BEST CLEAR` celebration without
  displacing awards or changing ordinary Practice/PvP presentation.

**Acceptance criteria**

- [x] Pure shared tests cover score normalization, base points, both bonuses,
      overtime, failure, and score carry; client tests cover formatting and
      completed-clear-only record updates.
- [x] Matchmaking integration proves score carry across Rookie, Scrapper, and
      Warlord plus zero-score reset after a full clear and failure.
- [x] The lobby, character-select briefing, desktop results, and 844×390 mobile
      results remain readable in a real authoritative Practice run.
- [x] Typecheck, lint, all 1,096 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 51 — Gauntlet Performance Bonuses

**Goal:** turn Gauntlet scoring from a small set of solved totals into a
skill-sensitive chase where every cleaner or faster stage can improve the run.

**Locked design decisions**

- The existing 1,000-point clear, 300-point contract, and 200-point regulation
  awards remain intact. A winning stage now adds 400 for zero deaths and two
  points per whole regulation second remaining, capped at 300 pace points.
  The theoretical stage maximum is 2,200 and the three-stage maximum is 6,600.
- All inputs are server-authoritative: the human's `PlayerStats.deaths`, the
  live match clock, contract result, overtime flag, and winner feed one shared
  resolver. The client receives `flawlessBonus` and `paceBonus`; it never
  reconstructs either from local time or presentation state.
- Overtime never awards pace points. A win may still be flawless after
  overtime, because flawless describes survival rather than speed. Losses and
  draws continue to bank no stage points of any kind.
- Missing or invalid death data cannot accidentally earn flawless, while
  negative, fractional, or invalid clock values normalize deterministically.
  Pace floors whole seconds before multiplying and never exceeds its cap.
- Existing device records remain valid. No storage migration or reset is
  needed: new clears compete against the stored number normally, and a prior
  4,500 perfect clear becomes a meaningful target rather than stale data.
- Results present the exact award as a compact score equation (`STAGE +2,200 =
CLEAR 1,000 + CONTRACT 300 + REG 200 + FLAWLESS 400 + PACE 300`) so every
  contribution remains legible on the fixed desktop canvas and mobile
  landscape without displacing awards.

**Acceptance criteria**

- [x] Shared tests cover the full bonus stack, overtime, loss gating, capped
      and fractional pace, invalid values, and explicit zero-death gating.
- [x] Matchmaking integration proves authoritative death/time inputs and score
      carry across three differently scored stages before clear/failure reset.
- [x] Client tests cover the compact full-stack breakdown and existing
      completed-clear-only personal-best behavior at the new score ceiling.
- [x] Real authoritative desktop and 844×390 mobile runs verify lobby,
      briefing, results, awards, and action spacing with zero client errors.
- [x] Typecheck, lint, all 1,097 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 52 — Gauntlet Route Draft

**Goal:** let a successful solo run branch between two distinct next fights,
so replaying the Gauntlet asks for decisions as well as cleaner execution.

**Locked design decisions**

- Only an advanced stage offers a draft. Route A preserves the prior automatic
  next map and mode; Route B advances one additional step through both existing
  rotations. Failure and full-clear results retain their single stage-one retry.
- Routes are authored and validated by the server. `MatchResult` carries the
  exact offers, and the optional rematch request route ID selects one. Missing,
  invalid, or tampered values safely choose Route A for old-client compatibility.
- FORCE pins remain authoritative. A valid forced map or mode is used on both
  routes, and a fully duplicate destination is presented only once rather than
  offering a fake choice. Route generation consumes no gameplay RNG.
- Route choice changes only the next arena and mode. Stage difficulty, score
  carry, fresh contracts, fresh mutator exclusions, and Gauntlet reset rules are
  untouched. Ordinary Spar, PvP rematches, drafts, stats, and combat balance are
  unchanged.
- Advanced results present `CHOOSE` plus two compact route buttons and Back to
  Lobby. Pointer, touch, D-pad/stick traversal, confirm, alternate confirm, and
  controller back all use the existing menu conventions. Both routes lock after
  selection so a delayed transition cannot send contradictory requests.

**Acceptance criteria**

- [x] Shared tests cover ordered route construction, duplicate removal, explicit
      selection, and safe missing/invalid fallback; wire tests cover old and new
      rematch payloads.
- [x] Matchmaking integration proves Route B launches the promised map/mode and
      stage, the next offers follow that branch, invalid input falls back to Route
      A, and failure/clear results expose no route draft.
- [x] Client presentation tests cover the `CHOOSE` teaser and route labels; a
      real browser regression activates Route B on desktop Chromium, desktop
      Firefox, and 844×390 touch input with readable three-button spacing.
- [x] Typecheck, lint, all 1,100 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 53 — Gauntlet Rival Drafts

**Goal:** make each Gauntlet branch a matchup decision by showing which Rusty
fighter waits on the other side, while keeping every run varied.

**Locked design decisions**

- Stage one keeps the ordinary server-side random Rusty roll. After an
  advanced stage, Route A and Route B preview different available fighters in
  addition to their arena and mode. The selected route pins that exact fighter
  into the next authoritative match and its character-select briefing.
- A server-owned encounter history follows only a live advancing run. Rival
  offers walk forward through stable roster order after the current opponent,
  skip everyone already faced, and consume no matchmaking or gameplay RNG.
  With six fighters and three stages, a run can never repeat an opponent.
- Rival metadata is optional on shared match and route payloads. Older results
  retain their previous one-line briefing and two-line route labels; missing,
  invalid, or tampered route input still falls back to the complete Route A
  offer authored by the server.
- Fully pinned FORCE runs may still show two branches when their destinations
  match but their opponents differ. This is a real matchup choice, not the fake
  duplicate that Session 52 collapses.
- The feature changes only Rusty's fighter assignment and preview. Difficulty,
  fighter stats, human selection rules, maps, modes, score, bonuses, contracts,
  mutators, ordinary Spar, PvP, and persistence remain untouched.

**Acceptance criteria**

- [x] Shared tests prove stable forward selection, history skipping, roster
      wraparound, invalid-count handling, and distinct-rival routes on an
      otherwise identical pinned destination.
- [x] Matchmaking integration proves the opening random rival is exposed, a
      selected Route B fighter is locked into stage two, invalid input pins the
      full Route A offer for stage three, all three rivals are unique, and a
      completed run resets opponent history.
- [x] Presentation tests preserve old payload labels and cover the new current
      rival briefing plus both route previews. The live route regression checks
      the rival copy and activates Route B in Chromium, Firefox, and 844×390
      touch input.
- [x] Typecheck, lint, all 1,102 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 54 — Gauntlet Chaos Forecasts

**Goal:** make every advanced Gauntlet branch a tactical risk/reward decision
by revealing the mid-match twist waiting inside the next fight.

**Locked design decisions**

- Stage one keeps its ordinary random mid-match event. After an advanced
  result, Route A and Route B each preview a compatible chaos event alongside
  their arena, mode, and rival. Selecting the route pins that promise into the
  next authoritative `Match` and the character-select briefing.
- Offers use a stable hash of the complete server-authored route. They consume
  neither matchmaking nor Match RNG, and Route B excludes Route A's forecast
  so ordinary branches reveal different twists.
- One server-owned run history carries both encountered rivals and promised
  forecasts. Active events from the completed stage and every earlier promise
  are excluded from later offers, even when a stage ended before its forecast
  activated. This guarantees no repeated forecast across a three-stage run.
- Ordinary forecasts respect the destination mode's exclusion list and reserve
  a valid `FORCE_EVENT` plus every conflicting event for the final-minute slot.
  A valid `FORCE_MIDMATCH_MUTATOR` remains the strongest smoke override and is
  previewed honestly. `Match` revalidates a planned forecast against its live
  exclusions and falls back to an ordinary random choice if it is stale.
- Forecast fields remain optional. Older results keep their prior labels,
  ordinary Spar and PvP keep random event selection, and missing or invalid
  route input still launches the complete Route A offer authored by the server.

**Acceptance criteria**

- [x] Shared tests prove deterministic selection, blocked-history handling,
      exhausted-pool behavior, and distinct forecast routes on an otherwise
      identical destination.
- [x] Matchmaking integration proves Route A/B distinction, exact Route B
      lock-in, run-wide no-repeat behavior, Route A fallback, and mode-specific
      compatibility under a forced One in the Chamber route.
- [x] Match tests prove a compatible promise owns the mid-match slot while an
      incompatible promise is rejected by live mode validation.
- [x] Presentation tests preserve old payload labels and cover four-line route
      cards plus the pinned briefing. Chromium, Firefox, and mobile touch all
      select the forecast route through the live result screen.
- [x] Typecheck, lint, all 1,107 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 55 — Gauntlet Chaos Bounties

**Goal:** turn readable Gauntlet forecasts into explicit risk/reward decisions
that make the best-clear chase ask for courage as well as clean execution.

**Locked design decisions**

- `GAUNTLET_CHAOS_BOUNTIES` exhaustively assigns all 18 mutators to a frozen
  100, 200, or 300 point tier. Mostly beneficial spectacle pays 100, disruptive
  rules pay 200, and lethal health, loadout replacement, or persistent arena
  pressure pays 300. Offer generation and mode compatibility stay unchanged.
- Stage one has no forecast and no bounty. A stage-two or stage-three win banks
  the selected forecast's bounty into `stageScore`, `runScore`, and therefore
  the browser-local `BEST CLEAR`. A loss or draw pays zero.
- A forecast stage pays on victory even if the match ended before activation.
  The route itself is the wager; requiring activation would reward waiting out
  the clock and fight against the existing pace bonus.
- The authoritative Gauntlet match metadata determines the payout. The client
  derives only display copy from the same frozen table and cannot submit a
  bounty value. `chaosBountyBonus` exists solely as an optional result breakdown
  field, so old payloads continue to render with a zero bounty.
- Route cards append the payout to the existing chaos line, the next character
  select repeats it as `BOUNTY +N`, and winning results itemize `CHAOS N` without
  changing button positions or adding another line.
- Chaos Bounties never affect PvP, ordinary Spar, contracts, lifetime stats,
  mode score, Match rules, mutator timing, or persistence format.

**Acceptance criteria**

- [x] Shared tests prove all mutators have one valid tier, representative events
      retain their intended 100/200/300 payouts, a win banks the bounty, and a
      loss pays zero.
- [x] The three-stage matchmaking integration proves selected stage-two and
      stage-three payouts accumulate into later match metadata and the final
      run score while stage one remains bounty-free.
- [x] Presentation tests prove old results still derive a correct clear subtotal
      and new results itemize the bounty; briefing and route labels show the
      exact frozen payout.
- [x] The live route regression verifies bounty copy and Route B selection in
      Chromium, Firefox, and mobile touch. Desktop and mobile-landscape captures
      keep the longest `WEAPON ROULETTE +200` label inside the existing card.
- [x] Typecheck, lint, all 1,109 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 56 — Demolition Wave

**Goal:** make a memorized arena transform under the players mid-fight, forcing
new peeks, escapes, and long sightlines without adding a second map state model.

**Locked design decisions**

- `demolition_wave` is a one-shot shared mutator. Its activation permanently
  removes every still-solid ordinary low-cover cell and shootable wire gate for
  the rest of that match. It does not repeat or pulse.
- Explosive barrels and scavenger caches are protected even though their map
  cells use low cover. Ordinary and perimeter walls are also untouched. The
  event therefore rewrites movement and sightlines without silently dealing
  damage, opening loot, or erasing authored boundaries.
- The authoritative Match selects and destroys cells, then reuses the existing
  reliable tile-destruction stream. Client rendering and prediction collision,
  Rusty's pathing, bullets, grenades, and abilities all observe the same live
  collision grid; immutable map data still rebuilds every rematch.
- The existing warning/start banners announce the event. Activation adds an
  amber flash, short camera shake, and zoom pulse, while actual geometry opens
  from authoritative tile messages. No new wire message or snapshot state is
  introduced.
- Demolition Wave is compatible with every mode and existing mutator. Its
  Gauntlet forecast bounty is 300 because the one-way arena rewrite can remove
  safe approach routes for the rest of a stage.

**Acceptance criteria**

- [x] Pure selector tests prove ordinary cover and gates qualify while barrels,
      caches, walls, and already-open cells do not.
- [x] Match integration proves activation clears authoritative collision,
      queues each changed tile once, keeps map data immutable, and triggers no
      barrel explosion or cache reward.
- [x] Shared and client exhaustive mutator surfaces recognize the new id,
      uppercase label, amber feedback, and 300-point Gauntlet bounty.
- [x] Typecheck, lint, all unit tests, production build, and focused live
      Chromium smoke pass.

---

## Session 57 — Gauntlet Style Bonuses

**Goal:** make already-memorable combat highlights materially improve a
Gauntlet run without letting kill farming eclipse the stage objective.

**Locked design decisions**

- A won Gauntlet stage converts the human's authoritative kill-feed highlights
  into score: First Blood 50, Double Kill 100, Clutch 150, Triple Kill 200,
  From the Grave 250, and Mayhem 300.
- One kill earns one style award. Posthumous has priority over rapid-chain
  tiers; rapid chains have priority over Clutch; Clutch has priority over First
  Blood. Ordinary kills, suicides, and the opponent's highlights pay nothing.
- The stage style bonus caps at 600 and only banks on a win. Losses and draws
  pay zero, preserving the clear objective and preventing long deathmatches
  from becoming the optimal score strategy.
- Matchmaking computes the payout from the completed authoritative Match kill
  feed and passes it through normal Gauntlet resolution. The client only
  itemizes `STYLE` in the score breakdown; no client event can invent points.
- `styleBonus` is optional on the wire for compatibility with older results.
  Ordinary match score, medal callouts, combat, stats persistence, contracts,
  and leaderboards are unchanged.

**Acceptance criteria**

- [x] Pure tests prove award priority, ignored suicides/opponent kills, and the
      frozen 600-point cap.
- [x] Gauntlet resolution proves fractional input is sanitized, wins bank the
      bonus, and failed stages bank zero.
- [x] Matchmaking integration proves a real authoritative First Blood reaches
      the human's result as 50 style points.
- [x] Presentation tests prove old results still render correctly and styled
      wins itemize the exact bonus without corrupting the clear subtotal.
- [x] Typecheck, lint, all unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 58 — Live Gauntlet Style Callouts

**Goal:** teach the new style-scoring ladder at the moment a highlight lands,
so players can deliberately chase it instead of discovering its value later.

**Locked design decisions**

- Gauntlet-only combat callouts append the exact single-kill style value as
  `STYLE +N IF CLEARED`. The conditional copy is mandatory because a loss or
  draw still banks no points.
- `practiceGauntletStylePointsForKill` is the shared source for both live copy
  and final server aggregation. Award priority and rapid-kill thresholds cannot
  drift between presentation and scoring.
- Live feedback is driven by the ordinary reliable authoritative kill event.
  The client does not predict kills, invent awards, or change combat behavior.
- Do not display or accumulate a client-side style total. Reconnects do not
  replay prior kill events, so only the server's result can safely own the
  complete capped stage total.
- Spar and PvP retain their existing combat callouts byte-for-byte. The style
  suffix appears only when the live match metadata identifies a Gauntlet.

**Acceptance criteria**

- [x] Shared tests prove the extracted per-kill function honors highest-award
      priority and rejects non-human kills while the aggregate cap stays green.
- [x] Client tests prove positive points append conditional Gauntlet copy and
      zero/null inputs preserve ordinary presentation.
- [x] GameScene uses Gauntlet match metadata, the reliable kill entry, and the
      shared award function without maintaining reconnect-unsafe score state.
- [x] Typecheck, lint, all 1,115 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 59 — Blood Rush

**Goal:** turn a kill into immediate forward momentum, encouraging pursuit,
multikill attempts, and aggressive reversals instead of a reset to neutral.

**Locked design decisions**

- `blood_rush` is a shared mutator valid in every mode. A living player who
  earns an opponent kill receives a four-second 1.35x movement boost.
- Suicides and posthumous kills do not trigger the boost. Another qualifying
  kill refreshes the four-second duration instead of stacking time or speed,
  preventing an unbounded momentum bank.
- The authoritative Match writes the existing per-player temporary boost
  timer. Shared movement modifiers consume it on both server and client, so
  prediction, reconciliation, and Rusty's movement stay exact.
- Blood Rush and Second Wind conflict in ordinary scheduling because they
  share that timer. Super Speed remains compatible and multiplies normally;
  explicit FORCE pins retain their established override semantics.
- Activation uses a crimson flash and explicitly teaches `KILLS GRANT 4 SEC
SPEED`. Boosted fighters reuse the snapshot-driven sprint dust. No new wire
  field, damage rule, score rule, or client-authored movement state is added.
- Its Gauntlet danger bounty is 200: the rule can create a meaningful snowball,
  but every player has equal access and the boost must be earned.

**Acceptance criteria**

- [x] Shared tests prove the exact timer-gated movement multiplier, activation
      copy, uppercase label, and symmetric Second Wind conflict.
- [x] Match integration proves a surviving opponent killer gets exact boosted
      movement, the timer expires, and suicides/posthumous kills pay nothing.
- [x] Exhaustive client color maps, shared labels, and the Gauntlet bounty map
      recognize Blood Rush at compile time.
- [x] A forced real-client Chromium Practice smoke verifies authoritative
      activation and the persistent `BLOOD RUSH` HUD label.
- [x] Typecheck, lint, all 1,121 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 60 — Mutator Rule Callouts

**Goal:** make match chaos immediately understandable, so first-time players
can react to a surprise instead of learning its hidden rule by losing to it.

**Locked design decisions**

- Every one of the 18 mutators gets a compact activation detail beneath its
  display name. The copy explains the rule or the required response rather
  than adding flavor text.
- All details live in one exhaustive shared `Record<MutatorId, string>`.
  Adding a future mutator without activation copy therefore fails TypeScript
  instead of silently producing an incomplete banner.
- Details are uppercase and capped at 30 characters to fit the existing
  two-line 22px activation banner. Persistent HUD labels and advance warnings
  remain name-only so they do not become visual noise.
- The client only projects shared copy. No mutator timing, authority, physics,
  scoring, schedule, or compatibility rule changes in this session.

**Acceptance criteria**

- [x] Every mutator has non-empty uppercase activation copy no longer than 30
      characters, enforced by an exhaustive shared test.
- [x] Blood Rush and Blackout have exact regression assertions covering a
      timer rule and a response-oriented spatial rule.
- [x] A forced real-client Chromium Practice smoke verifies the exact
      `BLOOD RUSH! / KILLS GRANT 4 SEC SPEED` two-line activation banner.
- [x] Typecheck, lint, all 1,121 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 61 — Death Animation Variety

**Goal:** make repeated eliminations feel less canned by using the compatible
collapse art already shipped in the source pack, without touching combat or
adding presentation-only network state.

**Locked design decisions**

- The first death uses the familiar base collapse. Later deaths cycle through
  registry-declared variants and back to the base from the authoritative
  per-match death count; clients use no RNG and reconnects choose identically.
- Mighty Man and Frost Wizard share three complete collapses. Bruce and Bubba
  each have two. Jack's no-axe body has two when that authoritative body state
  is active.
- Rook keeps its original because alternate human bodies lack matching helmet
  strips. Armed Jack keeps its original because the source pack lacks the
  alternate right-facing strip. Incomplete art never replaces a synchronized
  pair.
- All frame dimensions and counts remain registry-owned. BootScene loads only
  the extra horizontal death textures, and every strip is normalized to the
  existing 0.65-second playback duration.
- This is cosmetic only: no damage, death, respawn, movement, physics, mode,
  score, AI, protocol, or server-authority rule changes.

**Acceptance criteria**

- [x] Pure tests prove deterministic cycles, invalid-count normalization,
      Jack body-state selection, and Rook's synchronized fallback.
- [x] Registry tests validate every configured variant's prefix, asset name,
      frame count, and both horizontal frame dimensions.
- [x] A forced real-client Chromium Practice smoke proves all ten strips load
      and the live renderer selects the exact second-death texture/animation.
- [x] Typecheck, lint, all 1,125 unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 62 — Favorite Mode Sparring

**Goal:** let players deliberately practice or replay any favorite ruleset
against Rusty while preserving the quick variety of the existing random Spar.

**Locked design decisions**

- The lobby selector cycles `RANDOM` followed by the shared eight-mode
  rotation, uses the ordinary player-facing display names, persists locally,
  and is reachable through pointer, touch, and the existing gamepad menu path.
- `RANDOM` keeps the old behavior: a random first mode followed by the normal
  mode rotation. A selected mode stays pinned through direct Spar rematches,
  while maps continue rotating so repeat practice does not become one fixed
  encounter.
- The optional wire value is only a request. The server validates it against
  `GAME_MODE_ROTATION`; malformed or stale values fall back safely. `FORCE_MODE`
  remains strongest for verification and operations.
- Gauntlet ignores the selector and retains server-authored route modes. PvP
  draft, mode rules, scoring, Rusty AI, combat, physics, stats, and leaderboard
  isolation remain unchanged.

**Acceptance criteria**

- [x] Pure client tests prove normalization, the full random/mode cycle, and
      shared player-facing labels; network tests prove the optional request.
- [x] Server tests prove a valid pin starts and survives results/rematches,
      malformed input falls back, and Gauntlet ignores the request.
- [x] A real-client Chromium Spar smoke clicks the selector to KOTH, verifies
      its persisted value, observes the authoritative KOTH match and briefing,
      and reaches live play.
- [x] Typecheck, lint, all 1,130 unit tests across 75 files, production build,
      and the full Playwright desktop/mobile matrix pass.

---

## Session 63 — Choose Your Rival

**Goal:** let players deliberately train or replay any roster matchup against
Rusty without removing the quick variety of random Sparring.

**Locked design decisions**

- The lobby's difficulty row is split into compact `LEVEL` and `RIVAL`
  controls. Rival cycles `RANDOM` followed by shared roster order, uses the
  registry display names, persists locally, and stays on the ordinary
  pointer/touch/gamepad menu path.
- `RANDOM` preserves the existing per-match rival roll. A selected rival is
  locked for Rusty before human character selection and remains pinned across
  direct Spar rematches; the normal no-duplicate-fighter rule still applies.
- The optional wire field is only a request. Matchmaking validates it against
  `CHARACTER_IDS`, safely ignores malformed or stale input, and owns all lock
  and rematch state.
- Gauntlet ignores the selector and retains server-authored route rivals and
  run-level no-repeat history. PvP, mode/map selection, Rusty difficulty/AI,
  stats isolation, combat, scoring, and physics are unchanged.

**Acceptance criteria**

- [x] Pure client tests prove saved-value normalization, the complete
      random/roster cycle, and shared player-facing labels; the network test
      proves the optional request payload.
- [x] Server tests prove a valid rival is locked and survives a direct
      rematch, malformed input falls back, and Gauntlet ignores the request.
- [x] A real-client Chromium Spar smoke selects and persists Frost Wizard,
      proves the longest label fits its compact button, observes Rusty's
      authoritative lock and character-select copy, and reaches live play.
- [x] Typecheck, lint, all 1,134 unit tests across 76 files, production build,
      and the full Playwright desktop/mobile matrix pass.

---

## Session 64 — Checkpoint Zero

**Goal:** add a fifth arena whose readable, destructible barricade lanes create
fresh route decisions and make opening the battlefield feel intentional.

**Locked design decisions**

- Checkpoint Zero is a 20×12 rotationally balanced arena with four spawns,
  paired barrels/caches/gates, five legal KOTH hills, and the same contested
  pickup contract as every shipped map. It joins the end of registry order so
  normal drafting, FORCE verification, rematches, and Gauntlet routes get it
  without map-specific matchmaking logic.
- Twenty-eight unobscured `COVER_LOW` cells form long horizontal and vertical
  reinforced lanes. The center remains open enough for the shotgun,
  overcharge, armor, and ammo fight; shootable gates create two alternative
  shortcuts and explosions can permanently open the barricades.
- Barricade art preserves the pack's 16×14 aspect at 48×42 world size and
  rotates from neighboring cover cells. This is client presentation only:
  authoritative collision, tile destruction, blast logic, and shared physics
  are unchanged.
- Existing arena layouts and balance are untouched. Overgrown Suburb may use
  the wooden sibling for its undecorated low cover; Scrapyard, Overpass, and
  Wasteland retain their established tile-cover looks.

**Acceptance criteria**

- [x] Registry and matchmaking tests cover all five maps, wrap correctly, and
      accept Checkpoint Zero in deterministic Gauntlet routes.
- [x] Pure tests prove both barricade orientations, barricade theme metadata,
      deterministic fallback orientation, and at least 24 visible
      two-axis cover cells in the new arena.
- [x] A forced live Chromium match renders both orientations, verifies both
      curated textures loaded, and destroys a real reinforced barricade while
      proving its sprite, backing tile, and collision all open.
- [x] Typecheck, lint, all 1,139 unit tests across 76 files, production build,
      and the full Playwright desktop/mobile matrix pass.

---

## Session 65 — Daily Gauntlet

**Goal:** turn the Gauntlet into a fair daily ritual with one shared challenge,
one score to improve, and a streak that rewards coming back tomorrow.

**Locked design decisions**

- `DAILY RUN` is a third explicit solo choice beside Rusty Spar and ordinary
  Gauntlet. It uses the same three-stage Rookie-to-Warlord structure, scoring,
  route decisions, combat rules, and Practice stat isolation.
- The server's UTC date is authoritative. A stable shared hash authors the
  opening arena, mode, and Rusty rival; each fight seeds Match randomness and
  stable contract/cache/hazard selection from its date, stage, arena, mode,
  and rival. Replaying a failed or cleared challenge reproduces its opening,
  spawns, contract, and event timing instead of rerolling for an advantage.
- Daily attempts are unlimited. Only a completed three-stage clear can set the
  device-local daily best or advance the consecutive UTC-day clear streak;
  repeating a clear on the same date never inflates the streak, and missing a
  date resets it on the next clear.
- Daily progress is presentation-only local storage. The browser never authors
  the challenge, and Daily Run remains Practice: no lifetime PvP, leaderboard,
  Rivalry Set, reputation, mastery, or hot-streak writes.
- Existing `FORCE_*` smoke pins remain strongest. Ordinary Gauntlet, Spar,
  PvP, shared physics, frozen balance constants, and old payloads without the
  optional challenge key are unchanged.

**Acceptance criteria**

- [x] Shared tests prove UTC keys, deterministic daily openings and RNG, valid
      roster/map/mode output, empty-pool safety, and optional-key wire behavior.
- [x] Server tests prove a fixed date authors the opening, ignores client Spar
      choices, carries the key, and retries the same arena, mode, rival,
      contract, and spawn layout after failure.
- [x] Client tests prove day rollover, clear-only bests, once-per-date streak
      advancement, missed-day reset, Daily-specific briefing/results copy, and
      ordinary Gauntlet compatibility.
- [x] A real Chromium smoke chooses Daily Run, observes the current server UTC
      key and authored rival lock, verifies Daily briefing copy, and reaches
      live play through pointer input.
- [x] Typecheck, lint, all 1,146 unit tests across 77 files, production build,
      and the full Playwright desktop/mobile matrix pass.

---

## Session 66 — Ability Overdrive

**Goal:** make character identity take over a match by letting every fighter
cycle their signature power often enough to build tactics around it.

**Locked design decisions**

- `ability_overdrive` is a shared match-wide boon. While active, only the
  authoritative ability cooldown countdown advances at the frozen 3x rate.
  Active ability durations, freeze timers, damage, movement, and input retain
  their ordinary timing and values.
- The existing cooldown snapshot remains the complete source of truth for HUD,
  local reconciliation, reconnects, and Rusty's readiness decisions. No new
  wire state, client-side gameplay policy, or parallel timer is introduced.
- The mutator is valid in ordinary modes and composes with other chaos events.
  One in the Chamber excludes its random roll because that mode disables
  abilities; explicit FORCE pins continue to bypass scheduling safeguards.
- Overcharge Cells remain an immediate full refresh and compose naturally.
  The shared advantage pays a conservative 100-point Gauntlet danger bounty.
- Violet feedback and the exact `3X ABILITY RECHARGE` activation rule make the
  change legible without adding permanent HUD clutter.

**Acceptance criteria**

- [x] Shared configuration and exhaustive presentation helpers recognize the
      mutator, its 3x recharge constant, exact label/rule copy, and bounty.
- [x] Server tests prove both players recharge at exactly 3x while active
      ability duration remains real-time and cooldowns still clamp to zero.
- [x] One in the Chamber excludes the ordinary random roll, while all other
      mode, forecast, and forced-event paths retain established behavior.
- [x] A real Chromium match activates Ability Overdrive, verifies its violet
      banner and persistent label, casts the local fighter's real ability, and
      observes the authoritative cooldown fall by more than two seconds in one.
- [x] Typecheck, lint, all 1,148 unit tests across 77 files, production build,
      and the full Playwright desktop/mobile matrix pass.

---

## Session 67 — Daily Scoreboard

**Goal:** turn every fair Daily Run clear into a shared friend-group target
that makes one more attempt—and tomorrow's challenge—worth playing.

**Locked design decisions**

- Only a completed Daily Run clear enters the board. The authoritative server
  records its own final `runScore`; the browser never submits or calculates a
  score for ranking.
- Each normalized callsign keeps one best score per UTC challenge. Rankings use
  score descending, then the first timestamp that best was achieved, then the
  normalized callsign ascending so every tie is stable and explainable.
- The clear result carries its authoritative daily rank and best score. The
  current top five is sent reliably on connect, rebroadcast after every clear,
  and refreshed after UTC rollover for clients that keep the lobby open.
- The lobby mirrors the existing all-time board with a date-labeled Daily Top
  5 panel. An empty board invites the first clear instead of looking broken;
  results combine server rank/best with the existing device-local streak.
- Daily boards share the existing version-1 persistent JSON, normalize safely
  from legacy or malformed data, and retain the newest 14 challenge dates.
  They never write lifetime PvP, contracts, reputation, mastery, rivalry, or
  hot-streak progress. Ordinary Gauntlet remains unchanged.

**Acceptance criteria**

- [x] Persistence tests prove best-only callsign normalization, deterministic
      score/time/name ranking, reload compatibility, legacy normalization,
      14-board retention, and complete lifetime-stat isolation.
- [x] Server integration tests prove no entry before a full clear, an
      authoritative rank/best on completion, reliable player/observer
      rebroadcasts, connect snapshots, and UTC rollover refreshes.
- [x] Client tests prove wire forwarding, cached snapshots, clipped scoreboard
      rows, authoritative result copy, and an explicit empty-board state.
- [x] Desktop and mobile-landscape Chromium walkthroughs show the mirrored
      boards without covering the central menu, and the browser console stays
      clean.
- [x] Typecheck, lint, all 1,157 unit tests across 77 files, production build,
      and the full Playwright desktop/mobile matrix pass.

---

## Session 68 — Daily Rival Chase

**Goal:** turn the Daily Top 5 into a concrete run objective by giving every
attempt one attainable friend score to hunt from the first stage onward.

**Locked design decisions**

- The server derives one chase from the complete current challenge board when
  the attempt starts. Empty boards ask for the first score; boards with open
  top-five slots show the projected next rank; full boards expose the cutoff;
  ranked callsigns chase the entry immediately ahead; #1 chases a one-point
  personal improvement. Every score-bearing target is enough to move ahead
  despite first-achieved tie priority.
- Matchmaking locks that target across all three stages. A concurrent clear
  cannot silently move the goalposts mid-run; a failed or completed retry gets
  a fresh target from the then-current board.
- `dailyChase` is optional presentation metadata on the existing Daily
  Gauntlet payload. The client exhaustively renders it before each stage and on
  results, including points remaining, score-met instructions for active and
  failed runs, or a completed `TARGET BEATEN`; old payloads and ordinary
  Gauntlet keep their exact existing copy and behavior.
- Multi-line Gauntlet briefings shift the fighter cards from their real line
  count, preserving the forecast and chase lines on desktop and mobile
  landscape without shrinking the roster.
- The chase cannot change score calculation, deterministic Daily RNG, combat,
  persistence writes, lifetime progression, or leaderboard ranking.

**Acceptance criteria**

- [x] Store tests cover set-pace, open-slot, cutoff, nearest-rival tie-break,
      and leader-defense targets from the complete ranked board.
- [x] Matchmaking tests prove the target is server-authored, stable across
      stage advancement, and refreshed to a leader-defense goal after a clear.
- [x] Pure client tests exhaust every target kind, nickname clipping, remaining
      gap, target-beaten copy, Character Select briefing, and Results summary.
- [x] A live Chromium Daily flow observes the target in authoritative match
      metadata and its visible pre-fight briefing, then reaches live play.
- [x] Desktop and 844×390 mobile-landscape walkthroughs keep all briefing
      lines clear of the roster cards, with no browser console errors.
- [x] Typecheck, lint, all 1,159 unit tests across 77 files, production build,
      and the full Playwright desktop/mobile matrix pass.

---

## Session 91 — Crew Up

**Goal:** let two real friends play Crew Battle together without adding a room
code, splitting the small queue, or taking away the instant solo fallback.

**Locked design decisions**

- Pressing Crew opens one server-tick-owned six-second ally window. A second
  human launches the four-fighter match immediately; otherwise Rusty fills the
  allied slot at expiry. There is no second confirmation screen.
- The first entrant is captain. Their validated difficulty, compatible Crew
  mode pin, and compatible Solo Chaos preference author the round. The joiner
  contributes only their callsign and chosen fighter, so simultaneous local
  preferences cannot silently rewrite a nearly-started match.
- Human crews are always blue; Scrapjaw and Clank remain the red rivals. Solo
  fallback preserves the original human + Rusty versus Scrapjaw + Clank roster.
  The server remains the only team authority.
- Crew queue membership is exclusive with Quick Match and Rumble. Countdown
  state comes from the matchmaking tick, not a client timeout. Cancelling or
  disconnecting removes the entrant without leaving stale bot or match state.
- A direct rematch retains the exact humans, bots, sides, captain settings, and
  Practice boundary. Bots auto-vote; every human must vote. If either human
  leaves any queued, pre-fight, active, or post-match Practice duo, the group
  dissolves and the survivor returns instead of continuing a broken bot match.
- Character Select identifies a real human ally or Rusty fill from authoritative
  `playerTeams` and bot ids. Callsigns, entry order, and local settings are not
  valid team evidence. Crew Up cannot write lifetime PvP progression.

**Acceptance criteria**

- [x] A lone entrant receives a six-second `duos` status and launches the exact
      original Rusty/Scrapjaw/Clank lineup only when server ticks expire it.
- [x] A second human launches immediately on the captain's compatible mode,
      difficulty, and chaos settings; both humans are blue and only Scrapjaw
      plus Clank receive rival bot tactics.
- [x] Direct rematches require both humans and retain exact teams/settings;
      cancelling or disconnecting tears down queue and Practice duo state.
- [x] Lobby waiting/cancel copy and Character Select human/Rusty ally briefings
      are readable on desktop and mobile landscape and derive from server data.
- [x] Typecheck, lint, all unit/integration tests, and the complete Playwright
      desktop/mobile matrix pass; the production bundle receives an equivalent
      typecheck plus client bundle validation when the sandbox permits it.

---

## Session 90 — Crew Tour

**Goal:** turn Crew Clash's four-objective rotation into a repeatable collection
and win-run chase that gives every direct rematch a visible longer-term stake.

**Locked design decisions**

- `mmr_crew_tour` is a bounded device-local record: completed tours, the
  unique objective patches held toward the next tour, total Crew wins, current
  and best win runs, and the last counted match id. It is Practice motivation,
  parallel to Scrap Pit Records and never server lifetime progression.
- Results may update the record only when launch metadata says
  `practiceKind === 'crew_battle'` and an authoritative `duos` result supplies
  the local side through `playerTeams` plus a present `winnerTeamId`. Rendered
  scores and nicknames can never decide whether a patch was earned.
- A win secures the current Deathmatch, Hill, Tags, or Core patch once and
  extends the win run. A repeat objective win extends the run without inventing
  a duplicate patch. Draws preserve both patches and the run; losses end only
  the run, so one bad round never erases collection progress.
- Four unique patches increment the completed-tour tally and clear the patch
  board for another set. The completing Results screen retains an explicit
  four-patch celebration even though the persisted next-tour progress is 0/4.
- `lastMatchId` makes Results recreation idempotent. Loading rejects unknown
  modes and duplicate patches, caps counts, repairs streak relationships, and
  constrains completed tours and patch progress to the stored win total.
- The lobby's existing narrow Crew button shows tour progress, Character Select
  calls the current patch held/open/final, and Results pairs patch progress with
  the best win-run chase. This cannot change mode selection, rematch rotation,
  teams, bots, difficulty, score, combat, balance, physics, network messages,
  or any server persistence.

**Acceptance criteria**

- [x] Pure tests cover corrupt/impossible storage, canonical patch ordering,
      duplicate objectives, four-patch completion, draws, losses, run records,
      duplicate match ids, missing team authority, and non-Crew rejection.
- [x] Lobby, fighter-select, and Results presentation tests cover empty, open,
      held, final, newly secured, completed-tour, held-run, and ended-run copy.
- [x] The existing real Crew KOTH journey still reaches live play and shows the
      new open-patch briefing without weakening side or objective assertions.
- [x] Desktop and 844×390 mobile result journeys bank an authoritative patch,
      keep the story in bounds, persist it, and return the progress to the
      lobby button; in-app visual review keeps the narrow empty state readable.
- [x] Typecheck, lint, full unit/integration suite, production build, and the
      complete Playwright matrix pass.

---

## Session 89 — Crew Clash Rotation

**Goal:** keep the new 2v2 team-play pillar from collapsing into one repeated
Deathmatch by making the game's strongest objective modes explicitly understand
allies, side possession, combined targets, and team results.

**Locked design decisions**

- `CREW_BATTLE_MODES` is the frozen source of truth: Deathmatch, King of the
  Hill, Kill Confirmed, and Core Run. Favorite Mode pins one compatible rule;
  Random selects from this list and advances to the next team rule on every
  direct rematch. Incompatible stored or `FORCE_MODE` values cannot escape the
  allowlist.
- Deathmatch keeps its first-to-15 combined knockout target. KOTH treats every
  living occupant from one side as a valid hold, preserves fractional capture
  through an allied handoff, and becomes contested only when both sides enter.
- Kill Confirmed treats either teammate as the owner side: collecting an ally's
  tag denies it without score, while only an opposing side confirms it. Core
  Run keeps one physical carrier but combines every teammate's carry seconds.
- KOTH ends at 60 combined hill points, Kill Confirmed at 8 combined tags, and
  Core Run at 45 combined carry seconds. Regulation leaders and exact ties use
  the same server-owned team totals that final `winnerTeamId` and overtime use.
- Character Select teaches the selected team objective. Live play retains the
  two-score HUD and every mode's world objective renderer. Results labels team
  totals with `KOs`, `PTS`, `TAGS`, or `SEC`, and promises both the next mode and
  arena before a Random rematch.
- This expands team semantics, not persistence or matchmaking. The fixed crews,
  friendly-fire policy, bot identities, difficulty, compatible Solo Chaos, and
  Practice isolation from lifetime PvP remain unchanged.

**Acceptance criteria**

- [x] Focused KOTH tests prove allies hold together, opponents contest the side,
      and combined points decide the winner; Kill Confirmed tests prove allied
      denials; Core Run tests prove combined carry targets and team ties.
- [x] Matchmaking tests prove a compatible favorite remains pinned, Random
      starts inside the allowlist, the result promises the next team mode, and
      a direct rematch keeps every immutable assignment.
- [x] A real Chromium flow selects Crew KOTH, receives two authoritative sides,
      renders the team-specific hold briefing, reaches live play, and preserves
      the ally marker plus combined HUD.
- [x] Desktop and 844×390 mobile result journeys render objective-correct team
      units, all four roster-authentic fighters, and the next mode/arena promise.
- [x] In-app visual review keeps the longer KOTH briefing readable on the real
      canvas with no browser warnings or errors.
- [x] Typecheck, lint, full unit/integration suite, production build, and the
      complete Playwright matrix pass.

---

## Session 88 — Crew Battle 2v2

**Goal:** add an immediately playable team mode that makes protecting an ally
and combining strengths a new reason to return, without fragmenting the small
online matchmaking pool.

**Locked design decisions**

- `CREW 2V2` is an instant Practice launch: the human and Rusty face Scrapjaw
  and Clank. It reuses the real four-fighter Match/BotController stack instead
  of creating scripted encounters or client-owned teammates.
- The server authors immutable blue/red assignments, combined Deathmatch
  scores, a first-to-15 crew target, overtime winner, and the complete result
  contract. The client only presents `playerTeams`, `winnerTeamId`, and
  `teamScores`.
- Friendly fire is off across every attributed source. Hitscan, melee fans,
  pellets, and axes skip allies during target acquisition so Rusty never acts
  as a projectile shield; grenades, barrels, fire breath, and delayed
  explosives reject allied damage at the central authority boundary. Legal
  self-damage is unchanged.
- Every Rusty controller filters teammates before its personality tactics.
  Difficulty still changes decision quality only; Rusty remains balanced,
  Scrapjaw hunts leaders, and Clank scavenges farther.
- Live play marks the local ally in mint and replaces individual Rumble-style
  scores with `YOUR CREW | RIVALS`. Results group the actual locked roster by
  side, show combined KOs and individual K/A/D, and derive victory music/banner
  from the authoritative winning team.
- Direct rematches retain the exact crews, bot identities, Deathmatch rule,
  difficulty, and compatible Solo Chaos while rotating maps. Crew Battle stays
  Practice and cannot write lifetime PvP, rivalry, mastery, leaderboard,
  Crown, or Grudge state.
- The lobby uses a readable 3-over-2 solo-mode layout. This was selected after
  visual review caught label collisions in an initial five-across pass.

**Acceptance criteria**

- [x] Match and Deathmatch tests prove two teammates can combine to reach 15,
      the result names the winning crew while keeping `winnerId` null, and
      assignments survive a direct rematch.
- [x] Combat tests prove protected allies are skipped by hitscan and explosions
      while enemies behind them remain targetable; bot tests prove every
      personality ignores teammates.
- [x] A real Chromium flow launches the authoritative 2v2 roster, reaches live
      play, and observes the ally marker plus combined HUD scores.
- [x] Dedicated desktop and mobile result journeys render the winning side,
      both team totals, all four roster-authentic portraits, and individual
      K/A/D rows.
- [x] Desktop and 844×390 mobile lobby reviews keep all five solo actions
      readable in the 3-over-2 layout with no overlap.
- [x] Typecheck, lint, full unit/integration suite, production build, and the
      complete Playwright matrix pass.

---

## Session 87 — Roster Victory Lineups

**Goal:** make every finished match preserve the actual cast that created its
story, so a win feels like a character moment instead of a generic scoreboard.

**Locked design decisions**

- Matchmaking attaches optional `playerCharacters` to the authoritative
  `MatchResult` from each player's locked `PlayerState.characterId` before
  serialization. The result owns identity; clients do not infer it from a
  callsign, opponent cache, or the last locally rendered snapshot.
- Duel tableaux use the real local and opposing fighters while preserving the
  established winner-standing/loser-slumped composition. Old or partial
  payloads retain the original Mighty Man/Bruce fallback pair.
- Every Rumble standings row gains an animated side-idle portrait and a compact
  fighter-name label without changing winner-first authoritative ordering,
  score, K/A/D, departure state, Crown, or Grudge copy. The winner receives the
  larger accented portrait frame.
- Registry metadata drives animation keys. Frost Wizard keeps his ice gradient
  and Rook receives the same top-aligned synchronized helmet layer used in live
  play, so shared base sheets do not erase roster identity.
- This is result presentation only. It cannot change character selection,
  matchmaking, rematches, persistence, progression, awards, mode score,
  Crown/Grudge state, combat, physics, balance, or bot behavior.

**Acceptance criteria**

- [x] A real Matchmaking integration result contains every locked fighter,
      including the full four-entrant Scrap Pit roster.
- [x] A dedicated staged browser journey verifies all four Rumble portraits,
      their labels, and the authoritative two-fighter tableau across Chromium,
      Firefox, and 844×390 mobile landscape.
- [x] Desktop and mobile visual reviews confirm all rows, portraits, labels,
      story lanes, buttons, winner pose, and loser pose remain clear with no
      browser console errors.
- [x] Old results without `playerCharacters` retain safe roster fallbacks.
- [x] Typecheck, lint, all 1,272 unit tests across 92 files, production build,
      and the full 66-pass/12-intentional-skip Playwright matrix pass.

---

## Session 86 — Scrap Pit Records

**Goal:** give every completed Scrap Pit round a durable personal target that
makes an immediate rematch and a later return feel meaningful.

**Locked design decisions**

- `mmr_scrap_pit_record` stores device-local rounds, wins, current win run,
  best win run, and the last counted match id. It is cosmetic solo progress,
  parallel to local Gauntlet bests rather than lifetime PvP persistence.
- Results may update the record only when the launch metadata identifies
  `practiceKind === 'rusty_rumble'` and the completed authoritative
  `MatchResult` names the local player as winner, another fighter as winner,
  or no winner. Client-rendered scores never decide the outcome.
- A win extends the current run, a draw preserves it, and a loss ends it. The
  Results story distinguishes a first win, new best, held run, and ended run;
  the existing Scrap Pit lobby button carries total wins and the best run back
  to the next session.
- The last match id makes a recreated Results scene idempotent. Loading floors
  fractions, rejects non-finite/negative values, caps counts, restores
  `wins <= rounds` plus `current <= best <= wins`, and drops invalid ids.
- No server persistence, network message, match result field, AI, difficulty,
  matchmaking, score, Crown/Grudge logic, rewards, contracts, combat, physics,
  or ordinary PvP/Spar/Gauntlet behavior changes.

**Acceptance criteria**

- [x] Pure tests cover malformed storage, impossible totals, first and repeat
      wins, new bests, draw preservation, loss reset, duplicate match ids,
      missing local identity, and compact lobby/results copy.
- [x] A staged authoritative-result browser journey proves one win is banked,
      the Results celebration occupies its intended story lane, and the same
      target returns on the recreated lobby button.
- [x] The existing real-server Scrap Pit journey still reaches live play,
      proves rival banter, and verifies the new empty-record route label.
- [x] Desktop and 844×390 mobile-landscape visual reviews keep the two-line
      route readable in the four-button row with no browser console errors.
- [x] Typecheck, lint, all 1,272 unit tests across 92 files, production build,
      and the full 63-pass/12-intentional-skip Playwright matrix pass.

---

## Session 85 — Scrap Pit Banter

**Goal:** turn the Scrap Pit crew into memorable rivals who answer the player
instead of fighting in complete silence.

**Locked design decisions**

- Each entry in the frozen shared `SCRAP_PIT_RIVALS` roster owns one unique
  approved `signatureTauntId`: Rusty says `BRING IT!`, Scrapjaw says
  `IS THAT ALL?`, and Clank says `STILL STANDING!`. Free-form text remains
  impossible and the client never chooses speech for a rival.
- Matchmaking registers those signatures only for the three autonomous
  fighters in a Scrap Pit. Ordinary Spar and Gauntlet bots remain silent.
- After the server accepts a living human's taunt, the nearest living crew
  member who can pass the existing cooldown answers. Distance then stable
  player id decides order, and a cooling-down rival yields to the next one.
- A registered rival who knocks out the unregistered human queues its signature
  in the same authoritative tick. Crew-on-crew knockouts do not create chatter,
  and a dead or cooling-down speaker is rejected by the ordinary taunt gate.
- Replies and knockout cries reuse the existing reliable `server:taunt` event,
  speech bubbles, approved registry, live/alive checks, and four-second
  simulation-time cooldown. No combat, targeting, score, persistence, balance,
  physics, reward, or wire-state rule changes.
- Character Select adds a compact `PIT BANTER` instruction under the existing
  crew-role briefing so the interaction is discoverable before lock-in.

**Acceptance criteria**

- [x] Shared tests prove every rival signature is unique and approved.
- [x] Match tests prove nearest deterministic answers, cooldown fallback, and
      a valid signature queued for a human knockout.
- [x] Matchmaking tests prove a human challenge and a rival knockout both fan
      out reliably while unrelated Practice bots remain unregistered.
- [x] Client tests and a real-server desktop journey prove the discoverability
      line and visible two-way taunt presentation.
- [x] Desktop and 844×390 mobile-landscape visual reviews keep all briefing
      copy clear of fighter cards and report no browser console errors.
- [x] Typecheck, lint, all unit tests, production build, and the complete
      Playwright desktop/mobile matrix pass.

---

## Session 84 — Scrap Pit Rivals

**Goal:** make repeat Scrap Pit rounds feel like fighting a recognizable crew
rather than three renamed copies of the same opponent.

**Locked design decisions**

- The shared frozen `SCRAP_PIT_RIVALS` registry owns each rival's callsign,
  tactic, and compact teaching copy. Fresh matches and direct rematches derive
  all three controllers from that registry; ordinary Spar and Gauntlet bots
  keep the balanced default.
- Rusty is the all-rounder and retains the established nearest-threat plus
  six-tile resource-detour behavior. This is the compatibility baseline.
- Scrapjaw is the leader hunter. It targets the highest-scoring living
  opponent, then uses distance and stable player id to break ties. It ignores
  optional loot unless a critical bandage is available, but immediate hazard
  escape, live mode objectives, and an explicit Bounty Hunt mark remain
  stronger than personality.
- Clank is the scavenger. It uses the existing server-visible value, expiry,
  replacement, and reachability rules but may range ten tiles instead of six
  for a worthwhile ordinary resource. It still fights while moving and never
  receives client-authored information.
- Tactics change only authoritative target and detour decisions. The selected
  Rookie/Scrapper/Warlord profile still owns aim and decision cadence for all
  three; physics, movement speed, health, damage, ammo, abilities, score,
  mode rules, persistence, and reward isolation are untouched.
- Character Select adds one registry-derived `PIT CREW` line that teaches all
  three roles before lock-in. No wire state is needed because the practice kind
  already identifies this fixed shared roster.

**Acceptance criteria**

- [x] Shared tests prove a frozen, unique, full-size rival registry whose
      legacy callsign list and tactical order stay aligned.
- [x] Pure and integration AI tests prove balanced nearest-target selection,
      hunter leader/tie behavior and loot discipline, plus the scavenger's
      wider bounded detour without changing ordinary Rusty reach.
- [x] Matchmaking tests prove fresh and rematched Scrap Pits assign balanced,
      hunter, and scavenger controllers in roster order at the selected
      difficulty.
- [x] Client tests and the dedicated real-server browser journey prove the
      complete crew briefing is visible before fighter selection.
- [x] Typecheck, lint, all unit tests, production build, and the complete
      Playwright desktop/mobile matrix pass.

---

## Session 83 — Scrap Pit

**Goal:** unlock the game's richest four-fighter systems for a solo player by
filling a real Wasteland Rumble with three server-authoritative Rusties.

**Locked design decisions**

- `SCRAP PIT` is a fourth on-demand lobby route beside Rusty Spar, Gauntlet,
  and Daily Run. It uses the selected Rusty level, mode, rival, and compatible
  chaos preferences; the chosen rival becomes the featured first bot while
  the other two receive different available fighters.
- The match is an ordinary four-entrant authoritative `Match` with
  `matchKind: rumble`, not a parallel combat simulation. Each bot owns an
  independent `BotController`, picks its target from every living opponent,
  and queues normal server inputs before the shared match update.
- Rusty, Scrapjaw, and Clank have distinct callsigns and distinct fighter
  locks. The server advertises `practiceKind: rusty_rumble` so Character
  Select can name the Scrap Pit while preserving the existing Rumble HUD,
  standings, assists, lead drama, Crown, and Grudge presentations.
- Scrap Pit remains Practice: it never writes lifetime PvP, mastery, streak,
  rivalry, contract-career, or friend-leaderboard progress. Direct rematches
  auto-accept all three bots and retain the Rumble Crown, Grudges, chosen solo
  settings, fresh-chaos exclusions, and normal next-map promise.
- A solo disconnect dissolves the whole bot match in every phase and releases
  controllers, bot ids, match routing, and practice metadata immediately.
  Ordinary human Rumble teardown behavior is unchanged.

**Acceptance criteria**

- [x] Shared and matchmaking tests prove three unique configured callsigns,
      four entrants, three distinct locks, the featured rival, one controller
      per bot, accepted mode/chaos settings, no persistent stats, and a
      Crown-carrying direct Rumble rematch.
- [x] Disconnect coverage proves an active Scrap Pit releases every bot,
      controller, and route when its only human leaves.
- [x] Network coverage proves the new practice request remains an explicit
      discriminated-union value.
- [x] Chromium and Firefox browser journeys launch the real server flow and
      observe three authoritative locked rivals; mobile-landscape verifies the
      four-route lobby remains ordered and readable despite its local WebRTC
      emulator limitation.
- [x] Typecheck, lint, all unit tests, production build, and the complete
      Playwright desktop/mobile matrix pass.

---

## Session 82 — Wasteland Signal Recovery

**Goal:** make every return session trustworthy by turning startup stalls and
mid-flow server interruptions into clear, bounded, player-recoverable states
instead of silent buttons, frozen scenes, or an uncaught teardown crash.

**Locked design decisions**

- `NetworkConnection` owns exactly one current channel, one five-second
  handshake deadline, and at most one reconnect timer. Automatic attempts use
  the existing five-step 1/2/4/8/16-second backoff; Retry Now cancels the wait,
  safely retires the current channel, resets the cycle, and connects at once.
- Channel identity gates every callback. Closing clears ownership first and
  tolerates Geckos throwing when its half-open peer was never created, so a
  stale connect/disconnect callback cannot disturb a newer channel or abort
  the retry timer.
- `NetworkManager` clears the old player id and every match-scoped cache as
  soon as the transport enters `reconnecting`, not after all retries exhaust.
  A new welcome/snapshot must seed the new connection from scratch.
- Lobby signal copy is a pure projection of connecting, connected,
  reconnecting, or disconnected. Quick Match, Rumble, Spar, Gauntlet, and
  Daily Run remain disabled until connected; local difficulty/rival/mode/chaos
  selectors and the Build Codex remain usable. Retry is available during
  backoff and after exhaustion.
- Draft and Character Select return to the lobby on the first loss edge. Live
  play shows `SIGNAL LOST` before returning. Results preserves the completed
  result but disables a rematch that the retired connection can no longer
  fulfill.
- This is transport and presentation recovery only. It adds no session-resume
  protocol, reconnect-to-live-match authority, server wire message, score,
  combat, physics, matchmaking priority, persistence, reward, or balance
  change.

**Acceptance criteria**

- [x] Transport tests cover half-open close throws, silent handshake timeout,
      duplicate and stale callbacks, manual backoff bypass, bounded exhaustion,
      and explicit disconnect cleanup.
- [x] Network-manager and pure presentation tests prove identity/match caches
      clear on the first loss edge, retry reaches the transport, and only an
      online signal enables play.
- [x] Chromium, Firefox, and mobile-landscape browser checks render retry and
      disabled-play states, exercise Retry Now, render the live-match loss
      beat, and return safely to the lobby.
- [x] A local offline/online walkthrough shows the real lobby progress from
      bounded auto-retry to an online signal with restored boards/actions.
- [x] Typecheck, lint, all unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 81 — Rumble Assists

**Goal:** make chaotic three- and four-fighter battles feel fairer and more
cooperative by recognizing the fighter who did meaningful setup damage before
somebody else landed the final hit.

**Locked design decisions**

- Only matches that begin with at least three fighters author assists. Quick
  Match, Practice, and fresh two-fighter Rumbles keep their existing combat
  and result payloads.
- The server records post-reduction attributed damage on simulated match time.
  A knockout may credit one connected helper who dealt at least 20 damage to
  that victim in the previous eight seconds. Killer, victim, self-damage,
  stale damage, incidental chip damage, and departed fighters are ineligible.
- Highest qualifying recent damage wins. The latest qualifying hit breaks an
  exact damage tie, then stable player id provides the final deterministic
  fallback. A death consumes that victim's ledger; disconnect removes the
  fighter as both helper and future victim.
- Optional kill-feed fields carry only the winning helper and rounded damage.
  The local helper gets one live `ASSIST!` callout and confirmation chirp.
  Results shows K/A/D, while the outright assist leader may earn Wingman.
- The single attributed-damage bookkeeping path also records the existing
  `damageTaken` stat for every weapon source, restoring real Pincushion award
  eligibility without inventing environmental credit.
- Assists are recognition-only. They never alter mode score, kill/death
  credit, streaks, medals, contracts, Crown or Grudge state, persistence,
  matchmaking, healing, combat, physics, or balance.

**Acceptance criteria**

- [x] Pure tracker tests cover damage totals, the recency window, minimum
      contribution, latest-hit and stable-id ties, self/killer exclusion,
      disconnects, and life-ledger consumption.
- [x] Match integration proves a real helper shotgun hit plus a rival rifle
      finish produces authoritative assist event/stats and damage-taken data,
      while two-player knockout events stay unchanged.
- [x] Award and presentation tests cover Wingman, ties, old result stats,
      exact assist copy, fallback copy, and malformed self/killer credit.
- [x] Chromium, Firefox, and mobile-landscape browser tests render the live
      assist callout plus four-player K/A/D and Wingman result surfaces.
- [x] Typecheck, lint, all unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 80 — Rumble Grudges

**Goal:** turn a three- or four-fighter finish into several personal reasons
to run it back, so players leave Results knowing exactly which rival they want
to answer in the next round.

**Locked design decisions**

- Grudges are authored only after Rumbles that began with at least three
  fighters. Quick Match, Practice, and fresh two-fighter Rumbles keep their
  existing result stories; two connected survivors may carry a valid target
  from the prior group round into their direct rematch.
- The server reads the authoritative non-suicide kill feed at match end. For
  each connected fighter who suffered a knockout, the connected opponent with
  the highest knockout count becomes their target. The latest knockout breaks
  a count tie, with stable player id as a final deterministic fallback.
- Results receives the complete per-fighter map but presents only the local
  fighter's story. A direct rematch carries only that fighter's target through
  either the group draft or FORCE path into their `server:matchFound` payload.
- Returning to the lobby, a disconnect, rematch timeout, or a fresh queue
  clears the story. A fighter with no opponent deaths receives no invented
  target, and departed fighters can neither own nor become a carried grudge.
- Grudges are presentation-only. They add no world marker, reward, bonus,
  target preference, persistence, lifetime write, Crown interaction, score,
  combat, physics, matchmaking priority, or balance change.

**Acceptance criteria**

- [x] Pure server tests cover knockout counts, latest-wound tie-breaking,
      suicides, departed fighters, and no-death fighters.
- [x] Matchmaking tests prove a three-fighter result authors personalized
      grudges, a direct group rematch carries only each local target, and the
      two-fighter Rumble path remains unchanged.
- [x] Pure client tests cover result and pre-fight copy, singular/plural
      grammar, nickname clipping, blank names, malformed counts, and self
      targets.
- [x] Chromium, Firefox, and mobile-landscape browser tests compose a Grudge
      alongside a Crown in fighter select and four-player standings.
- [x] Typecheck, lint, all unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 79 — Rumble Lead Drama

**Goal:** make the shifting stakes of a three- or four-fighter Rumble legible
mid-fight, so a score change feels like a challenge to the entire group instead
of only a number moving in the HUD strip.

**Locked design decisions**

- Only matches that begin with at least three fighters author lead state.
  Quick Match, two-fighter Rumbles, and Practice keep their existing live HUD.
- The server reads the highest existing mode score after mode initialization
  and every mode tick. It excludes disconnected fighters and sends the complete
  sorted tied-leader set, so Deathmatch, KOTH, Last Stand, and every objective
  mode share one rule without duplicating their scoring logic.
- Sequence 0 is a silent opening baseline. The sequence advances only when the
  leader set changes; the client ignores initial/reconnect seeding, duplicates,
  and out-of-order snapshots, then presents only a forward edge.
- Copy distinguishes taking the lead, a rival takeover, joining a lead tie, a
  rival-only tie, and the full field drawing level. The existing combat-callout
  lane and a small pitch-shaped UI tick keep the beat readable without adding
  another HUD layer; same-tick kill medals retain presentation priority.
- This feature cannot alter score, combat, mode rules, persistence, Crown
  state, rematch behavior, matchmaking, physics, or balance.

**Acceptance criteria**

- [x] Match tests cover the silent group baseline, unchanged leader sets,
      takeovers, shared leads, Last Stand opening lives, departures, and the
      unchanged two-player path.
- [x] Network tests cover first-snapshot suppression, one forward edge,
      duplicate and out-of-order rejection, and fresh-match reseeding.
- [x] Pure presentation tests cover every local/rival/tie copy branch, compact
      long names, and defensive malformed-state handling.
- [x] Chromium, Firefox, and 844×390 mobile-landscape browser walkthroughs
      compose the real live HUD callout inside the gameplay bounds.
- [x] Typecheck, lint, all unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 78 — Rumble Draft Rally

**Goal:** remove spectator-only downtime from larger Rumble drafts and turn
the map/mode decision into the group's first social contest of each round.

**Locked design decisions**

- Three- and four-fighter Rumbles vote together; Quick Match and two-fighter
  Rumbles keep the established two-role draft and all revenge semantics.
- The server runs a map ballot first and a mode ballot second. Every entrant
  gets one immutable vote per phase, the phase resolves immediately when all
  ballots arrive, and a 15-second deadline prevents an absent player from
  holding the group.
- Submitted-vote plurality wins. Registry order stabilizes the tied candidate
  list and the server's injected RNG breaks the tie once for every client.
  Abstainers receive no synthetic ballot; a completely empty phase still
  chooses a legal option.
- Draft snapshots expose the active rally phase and accepted ballots so the
  client can show live counts, the local locked choice, remaining voters, and
  the final group pick. Combat, scoring, Crown state, rematch consensus,
  persistence, and every 1v1 path remain unchanged.

**Acceptance criteria**

- [x] Matchmaking tests cover 3-player participation, 4-player plurality,
      immutable/off-category rejection, deterministic timeout ties, legal
      match construction, and the unchanged 2-player Rumble draft.
- [x] Pure client tests cover vote eligibility, live counts, locked-ballot
      waiting copy, group-pick badges, and the vote deadline.
- [x] Desktop Chromium, desktop Firefox, and mobile-landscape browser tests
      render both rally phases, live counts, the local vote, and group pick.
- [x] A real three-client local Rumble completes both ballots and reaches
      Character Select with the authoritative winning map and mode.
- [x] Typecheck, lint, all unit tests, production build, and the full
      Playwright desktop/mobile matrix pass.

---

## Session 77 — Rumble Crown

**Goal:** turn consecutive Wasteland Rumble rounds into a social reign that
makes the connected group want one more rematch without adding grind or
changing combat balance.

**Locked design decisions**

- The first decisive Rumble winner claims the Crown. Winning again defends it
  and extends the visible win count; a different winner steals it and starts a
  new one-win reign.
- A draw preserves the Crown only while its holder is still connected. A fresh
  draw remains unclaimed, and a departed holder cannot carry into another
  round.
- Crown state is server-authored and exists only across direct rematches by the
  connected Rumble group. Lobby return, rematch timeout, disconnect teardown,
  and fresh matchmaking clear it. It never enters persistent stats, Quick
  Match, Practice, scoring, targeting, or balance.
- The next `matchFound` payload identifies the reigning champion. Character
  Select briefs the field, and a compact gold world marker follows the holder
  during live play without affecting Bounty Hunt or any authoritative state.
- Results tells the exact claim, defense, steal, held-draw, or unclaimed-draw
  story above the complete two-to-four-player standings.

**Acceptance criteria**

- [x] Pure resolver tests cover claim, defense, steal, held draw, and clearing
      a departed holder.
- [x] Matchmaking integration proves a three-player winner claims the Crown,
      unanimous direct rematch carries it through `matchFound`, and a second
      win records a two-win defense.
- [x] Pure client tests cover pre-fight and every result-story branch.
- [x] Desktop and mobile-landscape browser tests prove the champion briefing
      and crown-steal story remain visible without crowding standings.
- [x] A real two-client Rumble walkthrough reaches live play and verifies the
      unclaimed overtime-draw branch on desktop and mobile with clean consoles.
- [x] Typecheck, lint, all 1,215 unit tests across 84 files, production build,
      and the full 31-pass/11-intentional-skip Playwright matrix pass.

---

## Session 76 — Wasteland Rumble

**Goal:** let a small friend group turn the entire existing game into a shared
free-for-all without weakening the focused 1v1 rivalry loop.

**Locked design decisions**

- `RUMBLE 2–4` owns a separate server-authoritative queue. Quick Match remains
  immediate 1v1; Rumble opens a six-second launch window at two fighters and
  launches immediately when a fourth arrives.
- Every Rumble carries an explicit `matchKind` through draft, live play,
  results, and direct rematch. The server selects exactly two draft roles;
  additional entrants spectate the picks, then everyone gets an independent
  unique character lock and joins the same authoritative match.
- Existing maps, modes, mutators, pickups, character abilities, physics, and
  score rules are reused unchanged. The live HUD compacts all connected
  fighters' scores without reinterpreting mode-owned values.
- A pre-fight disconnect dissolves the incomplete group safely. During live
  play, a leaver is eliminated with no respawn or input, omitted from later
  snapshots, announced non-fatally to the survivors, and retained in the
  authoritative final standings with a `LEFT` marker.
- Rumble standings rank every entrant by authoritative score with kills and
  deaths as supporting context. A direct rematch requires consensus from only
  the connected survivors. Rumble never writes lifetime head-to-head rivalry
  stats or creates a 1v1 Rivalry Set.
- Queue countdowns are advanced only by the server tick and reliable status
  messages are throttled to visible whole-second changes; clients cannot
  accelerate launch, choose group membership, or author result identity.

**Acceptance criteria**

- [x] Pure queue tests cover waiting below two, delayed launch, immediate
      four-player launch, stable ordering, and reset when the group shrinks.
- [x] Matchmaking tests prove three-player draft roles, `matchKind` propagation,
      active-leaver continuation, snapshot removal, and connected-only rematch
      authority while preserving ordinary 1v1 behavior.
- [x] Network tests cover the join request and non-fatal fighter-left event;
      typecheck and lint protect the complete shared/client/server contract.
- [x] A real three-client Chromium journey gathers, drafts with two designated
      pickers, locks three fighters, reaches live combat with all three scores,
      survives one tab leaving, renders standings, and starts a group rematch.
- [x] Typecheck, lint, all 1,206 unit tests across 82 files, production build,
      and the full 25-pass/11-intentional-skip desktop/mobile Playwright matrix
      pass.

---

## Session 75 — Wasteland Taunts

**Goal:** give every live fight a tiny, memorable social beat that invites
rivalry and rematches without changing combat outcomes.

**Locked design decisions**

- The shared registry owns four approved cries: `BRING IT!`, `IS THAT ALL?`,
  `COME GET SOME!`, and `STILL STANDING!`. Clients send only a registered ID;
  arbitrary player text never reaches the arena.
- The server accepts a taunt only during live play from a living participant,
  enforces a four-second per-player cooldown on simulation time, and reliably
  broadcasts the approved cry to every participant in that match.
- Taunts are presentation only. They do not alter input frames, movement,
  weapons, abilities, targeting, bots, scoring, physics, matchmaking, or any
  balance value.
- Each local press advances through the four lines. Keyboard uses `T`, gamepad
  uses `Y`, and touch gets a fixed `T` button beside the grenade control. The
  input edge is buffered so a quick tap cannot disappear between game ticks.
- A compact speech bubble follows the speaking fighter for two seconds and
  fades cleanly. Practice allows the human fighter to taunt; ordinary Spar and
  Gauntlet Rusties never emit one autonomously. Only the explicitly registered
  Scrap Pit crew added in Session 85 may answer or celebrate a knockout.

**Acceptance criteria**

- [x] Shared tests freeze the approved registry and reject unknown IDs.
- [x] Match tests prove live/alive validation, simulation-time cooldowns, and
      acceptance after expiry without changing player input.
- [x] Matchmaking tests prove reliable match-wide broadcast and spam rejection;
      network and input tests cover transport, gamepad, and combat filtering.
- [x] A live Chromium match shows consecutive rotating cries anchored above the
      fighter, rejects a dead-player request, and records no console errors.
- [x] Desktop and 844×390 mobile-landscape walkthroughs preserve the playfield;
      the touch control remains outside the lower-right aim-stick zone.
- [x] Typecheck, lint, all 1,198 unit tests across 81 files, production build,
      and the full Playwright desktop/mobile matrix pass.

---

## Session 74 — Arena Mastery

**Goal:** make every arena a persistent friend-group chase, so players return
to defend a stronghold, claim a weak battlefield, or deny a rival's home turf.

**Locked design decisions**

- Every player has independent real-match wins for each registered arena.
  Server persistence normalizes the record from the live map registry, so old
  saves gain new arenas at zero and unknown/removed keys cannot leak forward.
- Only an authoritative PvP winner advances the arena played. Draws, losses,
  Practice, unknown arenas, and client input cannot earn progress.
- The cosmetic ladder is UNCHARTED at 0 wins, SCOUTED at 1, CLAIMED at 3,
  STRONGHOLD at 7, and HOME TURF at 15. Tiers change no map odds, first-pick
  role, spawn, matchmaking, combat, scoring, physics, or balance value.
- Draft map cards compare `YOU` with `RIVAL` in 1v1. Extra entrants use an
  N-player-safe `FIELD BEST`; old snapshots that omit records render the old
  label-only cards. The complete six-map/eight-mode layout retains 48px cards
  and moves status/timer below the actual registry rather than overlapping it.
- Results receives server-authored previous/current arena wins for every real
  participant, celebrates a crossed tier, and otherwise shows progress toward
  the next one. Practice and old results render no mastery line.

**Acceptance criteria**

- [x] Registry/config tests cover complete zero records, malformed migration,
      unknown-key removal, ordered frozen tiers, thresholds, and normalization.
- [x] Persistence and matchmaking tests prove winner-only advancement, draw/
      loss/Practice isolation, authoritative before/after results, and updated
      records in the next rematch draft.
- [x] Pure client tests cover 1v1 comparisons, N-player field best, old payloads,
      promotions, ordinary progress, and absent results.
- [x] A real two-player Chromium journey sees mastery on all six map cards and
      completes the draft; desktop visual QA confirms all eight mode cards,
      status, timer, and footer remain separated.
- [x] Browser-level Results smoke passes on desktop Chromium and 844×390 mobile
      landscape with the promotion and next-draft lines at distinct positions.
- [x] Typecheck, lint, all 1,192 unit tests across 81 files, production build,
      and the full Playwright desktop/mobile matrix pass.

---

## Session 73 — Rusted Refinery

**Goal:** add a sixth arena whose breachable central landmark and alternate
routes create fresh positioning decisions in every existing mode.

**Locked design decisions**

- Rusted Refinery is a 20×12 arena with exact 180-degree tile symmetry, four
  paired spawns, and a red-roofed central power vault.
- The vault keeps its north and south two-tile approaches open as reliable
  primary routes. Two diagonal east/west gates are shootable shortcuts, so
  fighters can permanently open fresh flanks during a round.
- The map uses the established universal economy: one shotgun, pistol, bat,
  overcharge cell, scrap armor, and ammo spawn; two bandages, grenades,
  explosive barrels, scavenger caches, and shootable gates; plus five legal
  KOTH sites. It introduces no map-only pickup, collision, or destruction rule.
- The `refinery` presentation theme pairs a bleak industrial floor, red roof,
  brick perimeter, and reinforced barricades. Theme choices remain client-only.
- All eight modes, bots, Practice, Gauntlet, Daily, drafts, rematches, and the
  forced-map smoke path consume the same registry entry and shared map
  contracts. No weapon, fighter, event, physics, scoring, or balance value
  changes with this arena.

**Acceptance criteria**

- [x] Registry tests validate all six maps, exact Refinery tile symmetry,
      paired props and gates, open vault approaches, five KOTH sites, and the
      six-map fallback rotation.
- [x] Theme tests resolve the distinct Refinery palette without altering the
      unknown-theme fallback or existing themes.
- [x] A real two-player Chromium draft chooses Rusted Refinery, reaches live
      Bounty Hunt, and observes both gate sprites and both cache sprites.
- [x] Desktop and 844×390 mobile-landscape walkthroughs keep the full arena,
      vault routes, interactive props, players, and HUD readable.
- [x] Typecheck, lint, all 1,182 unit tests across 80 files, production build,
      and the 22-pass/11-intentional-skip Playwright desktop/mobile matrix pass.

---

## Session 72 — Gauntlet Build Mastery

**Goal:** turn the Build Codex from a progress counter into a readable trophy
board with a fresh score chase for every discovered Gauntlet build.

**Locked design decisions**

- The lobby opens a six-card Codex board. Every card exposes its two-boon recipe
  so players can plan the unlock, while a locked card hides its build name and
  flavor. Discovered cards reveal both plus that build's best clear score.
- Each canonical build owns an independent personal best. Only the authoritative
  `result.runScore` from a fully cleared Gauntlet or Daily finale can set or
  improve it; failed and merely advanced runs do nothing. The board also sums
  all recorded build bests into a combined trophy score.
- The existing `mmr_gauntlet_build_codex` key migrates the discovered-only
  Session 71 shape in place. Loading allowlists build IDs, removes duplicates,
  ignores malformed scores, and retains scores only for discovered builds.
- A compact lobby `VIEW` button preserves the panel layout while using a larger
  invisible vertical hit target. The board supports pointer/touch and gamepad,
  with pointer, Escape/Backspace, and gamepad return paths.
- Results distinguishes first discovery from a repeat `NEW BUILD BEST`. Mastery
  remains device-local motivation only, with no gameplay, server persistence,
  lifetime-stat, Daily-ranking, PvP, Spar, bot-tuning, or balance consequence.

**Acceptance criteria**

- [x] Pure client tests cover old-shape migration, malformed and unknown data,
      independent build records, clear-only improvements, combined best, card
      states, and discovery/new-best result labels.
- [x] Playwright proves a first clear and repeat personal best persist exactly in
      Chromium, Firefox, and 844×390 mobile landscape.
- [x] Playwright opens the Codex through its real pointer/touch target, verifies
      discovered and locked cards plus combined score, and returns to the lobby
      in all three projects.
- [x] Live visual QA verifies the desktop lobby entry and trophy-board hierarchy;
      the review increased locked-card contrast against the brick backdrop.
- [x] Typecheck, lint, all 1,181 unit tests across 80 files, production build,
      and the 22-pass/11-intentional-skip Playwright matrix pass.

---

## Session 71 — Gauntlet Build Codex

**Goal:** turn the six possible two-boon finales into a collection chase that
rewards experimenting with every Gauntlet route combination.

**Locked design decisions**

- The six canonical, order-independent builds are:
  - `IRON SCAVENGER`: Scrap Plating and Kill Salvage.
  - `ARC PLATING`: Scrap Plating and Quick Charge.
  - `RAM RAID`: Scrap Plating and Spawn Rush.
  - `COMBAT ENGINE`: Kill Salvage and Quick Charge.
  - `BLOODHOUND`: Kill Salvage and Spawn Rush.
  - `REDLINE`: Quick Charge and Spawn Rush.
- A build is discovered only after clearing stage three with both boons. Stage
  advancement, losses, and draws never unlock it. Ordinary Gauntlet and Daily
  Run clears both count because they share the same authored boon system.
- Discovery is a presentation-only, device-local Practice collection stored in
  `mmr_gauntlet_build_codex`. Loading accepts only the six known IDs, removes
  duplicates, and safely resets malformed shapes. It never enters server
  persistence, Daily ranking, lifetime stats, or network gameplay authority.
- Complete active builds are named in Character Select and Results. The lobby
  shows `BUILD CODEX: x/6`, and a first clear gets a `NEW BUILD` celebration
  alongside the existing best-clear or Daily standing line.
- The codex must not change boon effects, route authorship, combat, scoring,
  bot tuning, balance constants, PvP, or Spar.

**Acceptance criteria**

- [x] Pure client tests cover all six pairs in both orders, malformed/unknown/
      duplicate storage, clear-only discovery, repeat clears, and compact copy.
- [x] Gauntlet presentation tests prove a complete loadout resolves to its
      named build while a one-boon loadout keeps the ordinary boon label.
- [x] Playwright proves a full two-boon clear renders `REDLINE`, celebrates the
      discovery, and persists the exact normalized payload in Chromium,
      Firefox, and 844×390 mobile landscape.
- [x] A live desktop browser walkthrough confirms the expanded lobby panel and
      `BUILD CODEX: 0/6` footer remain readable without moving existing input
      targets; the affected Warlord Practice journey also passes directly.
- [x] Typecheck, lint, all 1,179 unit tests across 80 files, production build,
      and the 19-pass/11-intentional-skip Playwright matrix pass.

---

## Session 70 — Gauntlet Boon Drafts

**Goal:** turn Gauntlet route choices into a run build that changes how the
next fights feel, creating more reasons to replay the same three-stage climb.

**Locked design decisions**

- Every advanced Gauntlet and Daily result offers two distinct server-authored
  boons alongside the existing route, rival, forecast, and bounty. Choosing a
  route acquires its complete offer; missing or malformed input retains Route A.
- The selected boon carries through later stages. The run normalizes unique
  boon IDs and caps the build at two because only two drafts exist; a loss,
  draw, or full clear resets it. Daily offers remain deterministic.
- `SCRAP PLATING` restores 25 armor at the opening and every legal respawn,
  except while Low Health owns durability. `KILL SALVAGE` gives a living
  opponent-killer 20 health and one grenade, with grenade-disabled modes still
  suppressing grenades. `QUICK CHARGE` recharges abilities at 1.5x and
  multiplies with Ability Overdrive. `SPAWN RUSH` grants four seconds of 1.3x
  movement at the opening and every legal respawn.
- Boons belong only to human Gauntlet entrants; Rusty never receives them.
  Scores, contracts, base stats, bot tuning, Practice persistence isolation,
  Spar, and PvP stay unchanged.
- Spawn Rush uses its own optional snapshot timer through authority, client
  prediction, and reconciliation. It composes with shared movement mutators
  without hijacking Second Wind/Blood Rush state. One in the Chamber remains
  lethal through Scrap Plating by applying current health plus armor damage.
- Optional route and match metadata preserves old payloads. The client renders
  compact boon rules on both route buttons plus the active build in pre-fight
  briefings and results; it never derives or authors gameplay policy.

**Acceptance criteria**

- [x] Shared tests prove deterministic distinct offers, unique maximum-two
      normalization, route identity, and Spawn Rush/mutator composition.
- [x] Matchmaking tests prove authoritative route selection, carryover through
      all three stages, human-only assignments, invalid-route fallback, Daily
      determinism, and reset after failure or clear.
- [x] Match/mode tests prove every boon, legal respawns, mode exclusions,
      combined cooldown and movement multipliers, Rusty isolation, and One in
      the Chamber lethality through armor.
- [x] Client network and presentation tests prove timer reconciliation, compact
      route rules, active-build copy, and old-payload compatibility.
- [x] Playwright clicks Route B and verifies both complete offers in Chromium,
      Firefox, and 844×390 mobile landscape.
- [x] Typecheck, lint, all 1,175 unit tests across 79 files, production build,
      and the 16-pass/11-intentional-skip Playwright matrix pass.

---

## Session 69 — Custom Chaos Sparring

**Goal:** let players deliberately remix an ordinary Rusty Spar around a
favorite mid-match event while the final-minute surprise stays fresh.

**Locked design decisions**

- A persisted `SPAR CHAOS` lobby selector cycles from `RANDOM` through every
  event compatible with the selected Spar mode. Changing to an incompatible
  pinned mode clears the preference instead of showing an impossible promise.
- `client:startPractice.mutatorId` is optional and ordinary-Spar-only. The
  server validates untrusted values, rechecks mode compatibility, and echoes an
  accepted choice as optional `server:matchFound.practiceMutatorId`; Character
  Select renders that exact server truth as `MID-MATCH: ...`.
- Gun Game and One in the Chamber keep their complete weapon economies. Their
  exclusions now come from one shared compatibility table used by modes,
  matchmaking, and client filtering, so those layers cannot drift apart.
- With `SPAR MODE: RANDOM`, matchmaking chooses only a compatible opening mode
  and direct rematches skip incompatible modes in rotation order. An explicit
  mode pin remains stronger and simply rejects a conflicting chaos preference.
- The selected event owns the ordinary mid-match slot across direct rematches,
  even if rematch recency contains it. The second/final-minute event remains a
  compatible random surprise. `FORCE_MIDMATCH_MUTATOR` and `FORCE_EVENT` remain
  stronger smoke hooks, and the client never advertises a choice they replace
  or conflict with.
- Gauntlet, Daily Run, PvP drafts, combat, scoring, physics, bot tuning,
  persistence, and all balance constants are unchanged.

**Acceptance criteria**

- [x] Shared/client unit tests cover exhaustive frozen mode compatibility,
      untrusted storage, compatible cycling, and presentation copy.
- [x] Match and matchmaking tests prove authoritative acceptance, malformed and
      Gauntlet rejection, incompatible-mode fallback, compatible rotation,
      planned-event activation despite rematch recency, and direct-rematch
      carryover.
- [x] Network tests prove the optional request field is omitted for old/random
      flows and forwarded for a chosen event.
- [x] A live Chromium flow selects and persists `SUPER SPEED`, receives it in
      authoritative match metadata, and shows `MID-MATCH: SUPER SPEED` before
      fighter lock-in.
- [x] Desktop and 844×390 mobile-landscape walkthroughs keep the expanded panel
      readable; the longest `ABILITY OVERDRIVE` label fits and browser logs stay
      clear. Visual QA raised the new label to match the adjacent mode label.
- [x] Typecheck, lint, all 1,169 unit tests across 79 files, production build,
      the 16-pass/11-intentional-skip Playwright matrix, and the opt-in Custom
      Chaos browser smoke pass.

---

## Session Log

### Session 91 — 2026-07-14 — Crew Up

**Shipped:** Crew Battle now gives a nearby friend six server-timed seconds to
join the blue side before Rusty fills the slot. A full human crew launches on
the next matchmaking tick against Scrapjaw and Clank; a lone player receives
the original human/Rusty lineup without another prompt. The first entrant is
captain, so their validated compatible mode, difficulty, and Solo Chaos choice
stay authoritative while the friend contributes their callsign and fighter.

The new bounded `CrewQueue` is exclusive with Quick Match and Rumble, reports
its countdown through the existing matchmaking status channel, and handles
cancel, captain departure, and joiner departure without wall-clock timers or
stale membership. Human rematches retain the exact roster and settings and wait
for both votes; any human departure dissolves the Practice duo and returns the
survivor instead of leaving a partial bot match. The lobby presents `CREWING UP
1/2` and the Rusty fallback countdown, while Character Select identifies either
the authoritative human ally or `RUSTY FILLED IN`. Crew Tour and every existing
team objective, friendly-fire rule, bot tactic, HUD, and result remain reused.

**Verification:** typecheck and lint pass. All 1,299 unit/integration tests pass
across 95 files, including deterministic queue timing, captain preference,
two-human side assignment, rematch voting, disconnect teardown, and pure ally
copy coverage. The focused Crew browser matrix passes 9 cases with 3 intentional
project skips. The final complete Playwright matrix passes 75 tests with 15
intentional project-scoped skips across 90 configured Chromium, Firefox, and
mobile-landscape cases. It covers a real two-client Crew handshake under the
captain's KOTH settings plus bounded desktop/mobile waiting and briefing copy.
An earlier full run had one Firefox-only miss in the unchanged Scrap Pit banter
test: its keyboard taunt did not register inside the five-second poll. The case
passed immediately unchanged in isolation and again in the clean full rerun.

The aggregate production build could not be rerun in this managed sandbox:
the bundled `pnpm` is 11.7 while the repo pins 10.33, and the pinned Corepack
runner is denied read access to pnpm-linked compiler executables. The dependency
replacement prompt was declined, no dependency files changed, and the same
TypeScript build graph passed through the root `npm run typecheck` gate. This is
an environment limitation to recheck outside the sandbox, not a compiler error.

**Operational watch:** six seconds should feel like an invitation rather than
a lobby tax for solo players. Watch whether friends understand that the first
entrant's settings captain the round, and whether returning both players after
a disconnect feels better than silently replacing the missing human with a bot.
Do not promote the joiner's preferences or extend the window without observing
real group play first.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 90 — 2026-07-14 — Crew Tour

**Shipped:** every authoritative Crew victory now contributes to a repeatable
four-patch tour: `KOs`, `HILL`, `TAGS`, and `CORE`. A first win in each objective
secures its unique patch, all four complete a tour and open a fresh board, and
every Crew win extends a visible current/best win run. Repeat-objective wins
still extend the run without duplicating patches; draws preserve the run and
patches, while losses reset only the run so collection progress remains fair.

The bounded `mmr_crew_tour` record is device-local Practice motivation. Results
updates it only from a Crew launch plus authoritative team assignments and
winner identity, and a stored match id prevents duplicate counting. The lobby
now fits current tour progress into its narrow Crew button, Character Select
calls out the selected objective's open/held/final patch, and Results celebrates
new patches, completed tours, and win-run milestones. No server persistence,
network message, matchmaking, objective, combat, physics, balance, or lifetime
PvP progression changed.

**Verification:** five focused Crew Tour tests plus 73 adjacent shared-config
and Scrap Pit record tests pass. Typecheck, lint, all 1,291 unit/integration
tests across 93 files, and the production build pass; Vite retains its existing
chunk-size advisory (`index-DcqSwqos.js`, 1,841.57 kB / 440.42 kB gzip). The
focused Crew browser journey passes three project cases with one intentional
mobile live-play skip, and the affected Rusty Rumble contract passes all three
projects. The final complete Playwright matrix passes 71 tests with 13
intentional project-scoped skips across 84 configured cases in Chromium,
Firefox, and mobile landscape. Desktop/mobile result assertions keep the story
and narrow lobby label in bounds, while in-app visual review confirmed the empty
`TOUR 0/4` lobby state remains legible. An initial full run correctly caught the
adjacent Rusty Rumble snapshot's old single-line Crew label; updating that
intentional contract was the only required follow-up before the green matrix.

**Operational watch:** patch progress intentionally survives losses so the tour
remains an inviting collection chase. Watch whether the best win-run provides
enough extra tension for repeat-objective wins without competing with the patch
board. This record remains device-local and is expected to reset when browser
storage is cleared.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 89 — 2026-07-14 — Crew Clash Rotation

**Shipped:** Crew Battle now changes the kind of teamwork it asks for instead
of replaying only Deathmatch. The frozen `CREW_BATTLE_MODES` allowlist contains
Deathmatch, King of the Hill, Kill Confirmed, and Core Run. A compatible
favorite remains pinned; Random advances through those four rules while the
arena rotates. Incompatible favorite or development-force values cannot launch
a team match with incomplete objective semantics.

The objective modes now understand sides at their authoritative boundary.
Multiple allies hold a hill together and can hand off fractional progress;
only an opposing side contests it. Either teammate can deny an allied dog tag,
while only enemies confirm. Core carrier seconds and all three objective
targets combine across the crew, and exact side ties still enter the ordinary
sudden-death path. Character Select teaches the selected rule, Results uses
`KOs`, `PTS`, `TAGS`, or `SEC`, and the rematch teaser promises the next mode
and arena. The existing fixed roster, friendly-fire policy, difficulty, Solo
Chaos, and Practice-only persistence boundary are unchanged.

**Verification:** 195 focused shared/mode/matchmaking tests pass. Typecheck,
lint, all 1,286 unit/integration tests across 92 files, and the production build
pass; Vite retains its existing chunk-size advisory. The complete Playwright
matrix passes 71 tests with 13 intentional project-scoped skips across Chromium,
Firefox, and mobile landscape. A real Crew KOTH flow observed two blue/two red
assignments, the hold-together briefing, ally marker, and team HUD. Dedicated
desktop/mobile Results coverage verified KOTH point units, all four authentic
fighters, and the promised Kill Confirmed rematch. In-app visual review kept the
longer briefing readable and found no browser warnings or errors.

**Operational watch:** the 60-point hill, 8-tag confirmation, and 45-second core
targets intentionally reuse the learned base modes as combined crew targets.
Watch whether two allies stacking a hill or alternating core carriers makes a
round materially shorter than Deathmatch before changing those centralized
values; do not compensate by scaling bot health or damage.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 88 — 2026-07-14 — Crew Battle 2v2

**Shipped:** the first true team-play ruleset. `CREW 2V2` launches immediately
with the player and Rusty against Scrapjaw and Clank, then asks each crew for
15 combined knockouts. The server owns every side assignment, score, overtime
decision, and result. Every attributed combat path now understands protected
teammates, including pass-through hitscan/melee/axes and ally-safe explosions,
while self-damage and all ordinary enemy interactions remain intact. Bots use
their existing personalities but never target their partner.

The live client turns that authority into a mint `ALLY` marker and a compact
team scoreboard. Results groups all four actual locked fighters under `YOUR
CREW` and `RIVALS`, preserves individual K/A/D, and celebrates the winning
side. Direct rematches keep the same crew and Deathmatch pin while rotating the
arena. Difficulty and compatible Solo Chaos remain available; all lifetime PvP
progression stays untouched because Crew Battle is Practice.

**Verification:** focused authority, combat, bot, and matchmaking coverage is
green. A real local Chromium journey reached live Crew Battle and observed two
server-authored sides, the Rusty ally marker, and combined 0–0 HUD. Dedicated
desktop and mobile result journeys rendered all four authoritative portraits
and the 15–10 victory card. Visual review caught an unreadable initial
five-across lobby row; the final 3-over-2 layout was re-reviewed and its
desktop/mobile regression coverage passes. Typecheck, lint, all 1,278
unit/integration tests across 92 files, and the production build pass; Vite
retains its existing chunk-size advisory. The complete browser matrix passes
71 tests with 13 intentional project-scoped skips across Chromium, Firefox,
and mobile landscape.

**Operational watch:** first-to-15 is intentionally a fresh balance value.
Playtest whether Warlord matches run too long when Rusty trails the player, but
keep tuning centralized in `CREW_BATTLE` and do not raise bot damage or health.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 87 — 2026-07-14 — Roster Victory Lineups

**Shipped:** every result now remembers who actually fought. Matchmaking sends
the locked character beside each authoritative callsign, and the client turns
that truth into two stronger finishes: duel winners and losers appear as their
real fighters in the established victory tableau, while every Rumble row gains
an animated portrait plus character label. The winner's larger accented frame
makes the champion readable at a glance.

The renderer stays registry-driven and preserves the roster's exceptional
cosmetics: Frost Wizard keeps his vertical ice tint and Rook's helmet remains
top-aligned over the shared body animation. Old duel payloads degrade to the
former Mighty Man/Bruce defaults, while old Rumble payloads retain text-only
rows. No selection, score, standings, matchmaking, rematch, persistence,
progression, Crown/Grudge, award, combat, physics, balance, mode, or bot rule
changed.

**Verification:** the focused Matchmaking suite passes 69 tests and proves a
real four-fighter Scrap Pit result carries every locked identity. The dedicated
result-roster journey passes in Chromium, Firefox, and mobile landscape,
covering four portrait identities/labels plus an authoritative Bubba-versus-
Rook duel tableau with synchronized slumped helmet geometry. Typecheck, lint,
all 1,272 unit/integration tests across 92 files, and the production build
pass; Vite retains its existing chunk-size advisory. The clean complete browser
matrix passes 66 tests with 12 intentional project-scoped skips. Desktop and
844×390 visual reviews show readable rows and poses with no browser console
errors.

**Operational watch:** long callsigns still share the same bounded standings
column as before. Watch real group results for a reason to add explicit text
clipping, but preserve the portrait width and authoritative identity source.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 86 — 2026-07-14 — Scrap Pit Records

**Shipped:** every completed Scrap Pit now advances a device-local record built
from the authoritative winner. Wins grow a consecutive run, draws hold it,
losses end it, and the best run survives browser restarts. Results celebrates
the first win, a new record, a held run, or the end of a run; the Scrap Pit
button brings career wins and the best target back to the lobby.

The stored shape is bounded and normalized before rendering, and a last-match
id prevents scene recreation from counting one fight twice. The client never
infers outcomes from scoreboard presentation. This remains isolated from server
persistence, lifetime PvP, Crown/Grudge state, matchmaking, bot behavior,
difficulty, contracts, rewards, score, combat, physics, and wire types.

**Verification:** 5 focused record/crew tests pass, including corrupt storage,
all outcome transitions, duplicate suppression, and presentation. Typecheck,
lint, all 1,272 unit/integration tests across 92 files, and the production build
pass; Vite retains its existing chunk-size advisory. Six dedicated Scrap Pit
browser journeys pass across Chromium, Firefox, and mobile landscape, while the
complete matrix passes 63 tests with 12 intentional project-scoped skips. Live
desktop and 844×390 mobile-landscape reviews keep the expanded route button
readable and browser logs contain no errors.

**Operational watch:** the lobby keeps the target deliberately compact. Watch
whether real records make total rounds or a reset control worth surfacing later;
do not turn this cosmetic chase into a combat advantage or server-owned grind.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 85 — 2026-07-14 — Scrap Pit Banter

**Shipped:** the Scrap Pit crew now talks back. Every rival owns a unique
approved signature cry, the nearest available crew member answers a living
player's accepted taunt, and the rival who knocks out the human can celebrate
in the same authoritative tick. Character Select teaches the interaction with
a `PIT BANTER` line before the player locks in.

The server still owns every word and every decision to speak. Autonomous cries
pass the existing live, alive, and four-second simulation-time checks and reuse
the reliable taunt broadcast plus established speech bubbles. Registered crew
do not taunt one another, and ordinary Spar/Gauntlet Rusties remain silent. No
combat, targeting, score, physics, balance, persistence, reward, or new wire
state changed.

**Verification:** 393 focused shared, Match, matchmaking, and client tests prove
approved unique signatures, nearest deterministic response, cooldown fallback,
knockout cries, and reliable fan-out. Typecheck, lint, all 1,268 unit/integration
tests across 91 files, and the production build pass; Vite retains its existing
chunk-size advisory. The dedicated real-server Scrap Pit journey passes in all
three projects, and the complete matrix passes 60 tests with 12 intentional
project-scoped skips. Desktop and 844×390 mobile-landscape visual reviews keep
the expanded briefing clear; a live round displayed a rival's knockout cry and
browser logs contained no errors.

**Operational watch:** banter is intentionally sparse because every speaker
uses the same four-second cooldown as a player. Watch whether real rounds want
more conversational variety before adding any approved lines; never turn the
feature into free-form text or a gameplay modifier.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 84 — 2026-07-14 — Scrap Pit Rivals

**Shipped:** Rusty, Scrapjaw, and Clank now enter the Scrap Pit with distinct,
readable tactical identities. Rusty remains the all-rounder. Scrapjaw pressures
the current scoreboard leader and refuses ordinary loot distractions unless
critically wounded. Clank evaluates the same honest arena resources as every
Rusty but is willing to roam farther for a worthwhile prize. Character Select
names all three roles before the player commits to a fighter.

The frozen shared roster is the single source for names, tactics, and teaching
copy. Matchmaking rebuilds the same crew on direct rematches, while the selected
Rookie/Scrapper/Warlord profile still governs every rival's aim and decision
cadence. Safety reactions, mode objectives, and Bounty Hunt authority stay
stronger than personality. No physics, movement, health, damage, weapon, ammo,
ability, score, reward, persistence, network, ordinary Spar/Gauntlet, or PvP
behavior changed.

**Verification:** 165 focused shared-config, bot-controller, matchmaking, and
client-presentation tests pass, including fresh/rematch controller assignment,
leader targeting, stable ties, hunter loot discipline, and the scavenger's
bounded wider reach. Typecheck, lint, all 1,266 unit/integration tests across
91 files, and the production build pass; Vite retains its existing chunk-size
advisory. The dedicated real-server Scrap Pit journey passes in Chromium,
Firefox, and mobile landscape, and the complete matrix passes 60 tests with 12
intentional project-scoped skips. The first live visual review caught the
second briefing line touching the roster; the final card-offset fix leaves the
complete crew line clear on the desktop canvas, while the mobile matrix keeps
the fixed logical canvas and four-route lobby readable.

**Operational watch:** the hunter's leader pressure and Clank's wider resource
range are intentionally tactical, not numerical difficulty buffs. Watch real
solo rounds for dogpiling or aimless long detours before changing target weights
or the ten-tile cap; never tune weapon or character balance from bot behavior.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 83 — 2026-07-14 — Scrap Pit

**Shipped:** the best parts of Wasteland Rumble are now playable without
waiting for three friends. `SCRAP PIT` launches one human with Rusty,
Scrapjaw, and Clank in a real four-fighter server-authoritative match. All
three bots run independent controllers, choose naturally among every living
opponent, lock different roster fighters, and participate in the existing
Rumble score, lead, assist, Crown, Grudge, and standings systems.

The route honors the lobby's level, mode, featured rival, and compatible
chaos selectors. Its explicit practice metadata gives Character Select a
truthful `SCRAP PIT` briefing. Results and direct rematches stay in the Rumble
family while Practice isolation keeps every lifetime PvP and leaderboard
record clean. Rematches auto-accept the three synthetic entrants and carry
the Crown and personal targets; disconnect teardown now releases the entire
solo group even after the fight begins. No combat, physics, scoring, bot
difficulty, persistence schema, assets, or ordinary PvP matchmaking rules
changed.

**Verification:** focused shared, network, and matchmaking coverage passes,
including four entrants, unique callsigns and locks, featured-rival selection,
three bot controllers, practice-only persistence, Crown-carrying rematches,
and full disconnect cleanup. The dedicated browser journey passes in Chromium
and Firefox against the real local server; 844×390 mobile-landscape verifies
the compact four-option lobby layout. A hands-on browser review confirms the
new row remains readable at the normal desktop canvas size. Typecheck, lint,
all 1,261 unit/integration tests across 90 files, the production build, and the
complete Playwright matrix pass with 60 passes and 12 intentional
project-scoped skips; Vite retains its existing chunk-size advisory. One
mobile Crown check hit its existing cold-start lobby timeout on the first full
run, passed immediately in isolation, and passed again in the clean full-matrix
rerun.

**Operational watch:** three bots increase per-match AI work by a small,
bounded factor. Watch a real group machine for server tick drift before ever
raising the bot count or path-recalculation cadence. The local long-running
watch server can retain an old `shared/dist` module after shared config edits;
the verified production build and Playwright server start fresh and do not.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 82 — 2026-07-14 — Wasteland Signal Recovery

**Shipped:** server startup trouble and dropped WebRTC links now have a
complete player-facing recovery loop. A five-second handshake deadline
prevents permanent `connecting`; five bounded backoff attempts keep trying;
and Retry Now immediately starts a fresh cycle. The lobby names every state,
keeps server-backed play disabled until safe, and leaves local settings and
the Build Codex available.

The transport clears channel ownership before best-effort teardown, tolerates
Geckos' half-open `close()` failure, and rejects stale callbacks by channel
identity. Network state drops the old player id and match caches on the first
loss edge. Draft and Character Select return immediately, live play gives the
interruption a readable `SIGNAL LOST` beat before returning, and Results keeps
the completed story while making the impossible rematch visibly unavailable.
No wire messages, session-resume claim, combat, physics, score, matchmaking,
persistence, reward, balance, or assets were added.

**Verification:** 30 focused transport, manager, and presentation tests across
three files pass, including the new silent-handshake regression. Six focused
Chromium, Firefox, and 844×390 mobile-landscape checks render the retry state,
prove disabled play cannot activate, exercise Retry Now, and verify the live
interruption returns to the lobby. A real local walkthrough with the server
absent renders bounded auto-retry and Retry Now; bringing the authoritative
server online renders Signal Online, restores play, and repopulates both live
boards. Typecheck, lint, scoped Prettier, all 1,258 unit/integration tests
across 90 files, and the pinned-pnpm production build pass; Vite retains its
existing chunk-size advisory. The full Playwright matrix passes 57 tests with
12 intentional project-scoped skips, including the real multiplayer and
three-client Rumble draft journeys.

**Operational watch:** the five-second handshake deadline is long enough for
ordinary WebRTC setup but short enough to make a dead outpost legible. Watch
real hosted reconnect telemetry and friend-session reports before changing
that deadline or the existing 1/2/4/8/16-second backoff. Live-match resume
would require a separate server-owned session protocol; never fake it on the
client.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 81 — 2026-07-14 — Rumble Assists

**Shipped:** meaningful setup damage now earns visible credit in chaotic
three- and four-fighter Rumbles. The server keeps a short per-life damage
ledger, awards one qualifying helper on an opponent knockout, and sends the
winner plus rounded contribution through the existing kill event. The helper
gets an immediate `ASSIST!` beat and confirmation chirp; Results now shows
K/A/D and may name the outright assist leader Wingman.

The tracker uses simulated match time, the post-reduction damage already
attributed to each weapon source, a 20-damage floor, and an eight-second
window. Highest damage wins, then latest hit and stable id break exact ties.
Deaths consume the victim ledger and disconnects remove both sides of a
possible credit. Matches that begin with two fighters author no assists. The
shared damage path also now records the existing `damageTaken` stat, restoring
real Pincushion award eligibility. Assists change no score, kill/death credit,
streak, medal, contract, Crown, Grudge, persistence, matchmaking, combat,
physics, or balance behavior. No assets were added.

**Verification:** 325 focused tracker, stats, award, Match, and presentation
tests across five files pass. Match integration proves a helper shotgun hit
plus a rival rifle finish produces authoritative assist and damage-taken data,
while a fresh two-player knockout remains assist-free. Six focused Chromium,
Firefox, and 844×390 mobile-landscape browser checks render both the live
callout and four-player K/A/D + Wingman result layout. Typecheck, lint, scoped
Prettier, all 1,249 unit/integration tests across 88 files, and the pinned-pnpm
production build pass; Vite retains its existing chunk-size advisory. The
full Playwright matrix passes 51 tests with 12 intentional project-scoped
skips, including the real three-client Rumble draft journey.

**Tuning watch:** the 20-damage/eight-second rule is intentionally generous
enough to recognize a real setup without rewarding stray chip damage. Watch
whether group players find credit too common or too strict, and whether one
assist is enough for Wingman to feel earned; do not tune before another real
three- or four-player session.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 80 — 2026-07-14 — Rumble Grudges

**Shipped:** every three- or four-fighter Rumble now ends with a personal
score to settle. For each connected fighter who suffered an opponent
knockout, the server names the rival who got them most; the latest wound
breaks a count tie. Results sets that local Grudge, and a direct group rematch
carries only that fighter's target through the group draft or FORCE path into
Character Select.

The resolver reads the existing authoritative kill feed once at match end,
ignores suicides and departed fighters, and invents nothing for a fighter who
never died to an opponent. Fresh queues and rounds that begin with two
fighters author no target. Lobby return, disconnect teardown, and rematch
timeout naturally discard the post-match state. The feature adds no live
marker, targeting preference, reward, persistence, lifetime write, Crown
interaction, score, combat, physics, matchmaking priority, or balance change.
No assets were added.

**Verification:** 72 focused resolver, matchmaking, and presentation tests
pass. Matchmaking integration proves a three-fighter result authors distinct
local targets and that the direct rematch carries them through the real Rally
draft; a separate regression locks the fresh two-fighter path. Chromium,
Firefox, and 844×390 mobile-landscape compose the three-line Crown + Grudge
fighter briefing and the Crown + Grudge four-player standings without
overflow. Typecheck, lint, scoped Prettier, all 1,238 unit/integration tests
across 87 files, and the pinned-pnpm production build pass; Vite retains its
existing chunk-size advisory. The full Playwright matrix passes 45 tests with
12 intentional project-scoped skips, including the real three-client Rumble
draft journey.

**Tuning watch:** the latest-wound tie-break should make an even split feel
personal instead of arbitrary. Watch whether one-knockout Grudges are enough
to provoke a rematch or whether a future group playtest supports a higher
threshold; do not guess before players try it.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 79 — 2026-07-14 — Rumble Lead Drama

**Shipped:** three- and four-fighter rounds now turn every change in the live
leader set into a shared takeover beat. The local fighter sees when they take
or tie for first; the rest of the field gets a named target; rival-only ties
name the front-runners; and a full reset announces that anyone can take it.

The server derives this story from each mode's existing authoritative score
after mode initialization and every tick. A persistent monotonic snapshot
tracks the complete connected leader set, while the client suppresses the
silent opening baseline, reconnect seeding, duplicates, and stale packets.
Presentation reuses the compact combat-callout lane and deliberately runs
before same-tick kill events so earned medals remain the stronger personal
beat. Two-player matches, score, combat, mode rules, Crown state, persistence,
matchmaking, physics, and balance are unchanged. No assets were added.

**Verification:** focused Match, network, and presentation coverage passes 277
assertions. Typecheck and lint pass. Desktop Chromium, desktop Firefox, and
844×390 mobile landscape compose the real GameScene/HUD takeover callout
inside the gameplay bounds; the desktop paths reach live play through the
authoritative local server, while mobile isolates composition from its known
emulated WebRTC startup limitation. All 1,230 unit tests across 85 files and
the pinned-pnpm production build pass; Vite retains its existing chunk-size
advisory. The full Playwright matrix passes 39 tests with 12 intentional
project-scoped skips.

**Tuning watch:** watch whether takeover frequency feels exciting across
objective modes, whether full-field ties are rare enough to stay special, and
whether named rival copy produces useful table talk. Do not change mode scores
or callout cadence without a real three- or four-player session.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 78 — 2026-07-14 — Rumble Draft Rally

**Shipped:** three- and four-fighter Rumbles now open with a group Draft Rally
instead of assigning two pickers and leaving everyone else to watch. Every
fighter casts one map ballot followed by one mode ballot, sees live totals and
their locked choice, and reaches the same authoritative `matchFound` path once
both group decisions resolve. Quick Match and two-fighter Rumbles retain the
original two-role flow.

The server owns ballot validation, immutable participation, early all-voted
resolution, 15-second deadlines, plurality, and one injected-RNG tie break.
AFK fighters abstain rather than receiving a fake vote, while a completely
empty phase still selects a legal option. The scene labels the group pick,
counts current ballots on each card, and keeps mouse, touch, and gamepad card
navigation on the existing button path. No combat, physics, scoring, Crown,
rematch-consensus, persistence, map, mode, or balance behavior changed. No
assets were added.

**Verification:** 91 focused matchmaking and client-draft tests pass, covering
three- and four-player participation, plurality, immutable/off-category
rejection, timeout ties, unchanged two-player drafting, live counts, and
locked-vote presentation. Real three-client Chromium and Firefox journeys
voted Scrapyard and King of the Hill through the local server and reached
Character Select with those exact authoritative choices. The composed rally
screen passes on desktop Chromium, desktop Firefox, and 844×390 mobile
landscape; screenshot review also moved the footer clear of the mobile crop.
Typecheck, lint, all 1,222 unit tests across 84 files, and the production build
pass; Vite retains its existing chunk-size advisory. The full Playwright matrix
passes 36 tests with 12 intentional project-scoped skips, including the
synthetic three-background-mobile-tab WebRTC journey (the mobile screen itself
passes).

**Tuning watch:** watch whether visible totals create fun table talk or merely
encourage late dogpiling, whether 15 seconds per phase feels brisk with real
friends, and whether the map-first order should alternate in long rematch
chains. Do not tune from synthetic tests.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 77 — 2026-07-14 — Rumble Crown

**Shipped:** direct Wasteland Rumble rematches now build an ephemeral champion
story. The first decisive winner claims the Crown, repeat wins extend the
reign, and a new winner visibly steals it. Draws preserve a connected holder
without inflating the win count; fresh draws remain unclaimed and departed
holders are cleared.

The server owns the resolver and carries the Crown only through the existing
direct-rematch contract. Character Select names the reigning champion, live
fighters see a compact gold marker above the holder, and Results tells the
claim/defense/steal/held/unclaimed story above the full Rumble table. The
feature is deliberately social and session-only: no persistence, score,
targeting, combat, matchmaking membership, physics, or balance value changed.
No assets were added.

**Verification:** 70 focused resolver, presentation, and complete matchmaking
tests pass, including a three-player claim, carried rematch payload, and
successful defense. A real two-client local Rumble reached Character Select,
live play, overtime, and the unclaimed-draw Results branch; desktop and
844×390 mobile inspection found no crowding and both browser consoles stayed
clean. Repeatable browser coverage stages a reigning champion and a steal
story across Chromium, Firefox, and mobile landscape. Typecheck, lint, all
1,215 unit tests across 84 files, and the production build pass; Vite retains
its existing chunk-size advisory. The full Playwright matrix passes 31 tests
with 11 intentional project-scoped skips.

**Tuning watch:** watch whether groups understand that the win count is a
consecutive reign rather than lifetime wins, whether the world marker remains
readable when Bounty Hunt also marks the holder, and whether the Crown creates
the intended “one more round” energy before changing copy or presentation.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 76 — 2026-07-14 — Wasteland Rumble

**Shipped:** the lobby now offers a separate `RUMBLE 2–4` path alongside the
unchanged 1v1 Quick Match. The authoritative queue gathers up to four friends,
starts a short launch countdown once two are ready, and moves the whole group
through map/mode draft, unique fighter selection, every existing game mode,
compact live scoring, ranked standings, and consensus rematches. Exactly two
server-selected entrants make the draft choices while the rest spectate.

The match kind is explicit from matchmaking through results. Active leavers
are eliminated and removed from later live snapshots without ending the fight,
remain visible as `LEFT` in the final table, and do not block the connected
survivors from choosing another round. Rumble deliberately does not create
Rivalry Sets or write lifetime 1v1 head-to-head records. No weapon, fighter,
mode, event, pickup, map, physics, scoring, or balance constant changed.

**Verification:** 85 focused tests pass across the Rumble queue, complete
matchmaking lifecycle, disconnect filtering, and client transport. A real
three-client Chromium walkthrough covered gathering, both designated draft
roles, a spectator entrant, three distinct fighter locks, live combat, a
mid-fight departure, final standings, and a successful three-player rematch.
That walkthrough caught and drove fixes for the HUD initially showing only one
rival and for a departed fighter reappearing in later snapshots. Typecheck,
lint, all 1,206 unit tests across 82 files, and the production build pass; Vite
retains its existing chunk-size advisory. The full Playwright matrix passes 25
tests with 11 intentional project-scoped skips across Chromium, Firefox, and
844×390 mobile landscape.

**Tuning watch:** six seconds should be enough for friends to pile in without
making a pair wait. Watch whether groups discover the new path, whether four
scores stay readable in chaotic modes, whether requiring every connected
fighter for a rematch adds friction, and whether frequent leavers distort
standings before changing queue time or consensus rules.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 75 — 2026-07-14 — Wasteland Taunts

**Shipped:** every living fighter can now throw a short battle cry into a live
fight. `T`, gamepad `Y`, or the touch `T` button cycles through four approved
lines in a speech bubble that follows the speaker. The client buffers quick
keyboard taps and gives immediate local cooldown feedback, while the server
remains authoritative over the registered text, match phase, alive state, and
four-second rate limit before reliably broadcasting to all participants.

The feature is deliberately social rather than mechanical: no combat input,
bot behavior, targeting, score, physics, matchmaking, or balance value changes.
Practice supports human taunts, but ordinary Spar and Gauntlet Rusties do not
taunt on their own. Session 85 later registered only the Scrap Pit crew for
bounded autonomous replies. No new third-party assets were added.

**Verification:** 401 focused tests pass across shared config, match authority,
matchmaking broadcast, network transport, gamepad input, and combat filtering.
A live Chromium match displayed the first two rotating cries above the player,
rejected a dead-player request, and produced no console errors. Desktop and
844×390 mobile-landscape walkthroughs confirmed the canvas fit and control
placement. Typecheck, lint, all 1,198 unit tests across 81 files, and the
production build pass; Vite retains its existing chunk-size advisory. The full
Playwright matrix passes 25 tests with 11 intentional project-scoped skips.

**Tuning watch:** four seconds should support playful back-and-forth without
turning the arena into constant visual noise. Watch line readability during
crowded fights and whether the fixed copy stays fun after repeated sessions;
adjust only cooldown, display duration, or approved wording from play evidence.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 74 — 2026-07-14 — Arena Mastery

**Shipped:** every real PvP victory now claims progress on the battlefield where
it happened. The server persists a complete win record across all six arenas,
migrates old saves safely, and sends the current roster's records into the
pre-match draft. Each map card compares your tier and progress with your rival;
larger rosters fall back to the field's best total instead of assuming 1v1.

Results now turns a first win or tier threshold into a compact promotion beat,
then keeps the next goal visible after ordinary wins. Practice, losses, draws,
old payloads, and unknown maps remain isolated. The tiers are bragging rights
only: no draft, matchmaking, map, spawn, combat, scoring, physics, event, bot,
or balance behavior changed. The draft was also reflowed around its real six-
map/eight-mode registry so lower mode cards no longer overlap status and timer.

**Verification:** 172 focused tests pass across registry/config, persistence,
matchmaking/rematch propagation, and client presentation. A real two-browser
Chromium flow observed Arena Mastery subtitles on every map card before both
players completed the draft. Live desktop visual QA confirmed the full draft
hierarchy and spacing. A dedicated ResultsScene smoke passes in desktop
Chromium and 844×390 mobile landscape. Typecheck, lint, all 1,192 unit tests
across 81 files, and the production build pass; Vite retains its existing
chunk-size advisory. The full Playwright matrix passes 25 tests with 11
intentional project-scoped skips.

**Tuning watch:** the early tier cadence should create quick identity without
making HOME TURF feel routine. Watch whether players choose maps to attack a
rival's stronger record, protect their own, or merely optimize the nearest
promotion; adjust only presentation thresholds after real group evidence.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 73 — 2026-07-13 — Rusted Refinery

**Shipped:** matchmaking, rematches, Practice, and solo runs now draw from six
arenas. Rusted Refinery centers its fights on a red-roofed power vault: the
north and south entrances stay open, while two diagonal side gates can be shot
apart to create permanent east/west flanks. Reinforced barricades, paired
barrels and caches, and mirrored pickup fights give the yard its own tactical
rhythm while exact rotational tile symmetry keeps starts fair.

The new `refinery` theme makes the vault and industrial lanes immediately
recognizable but remains presentation-only. The arena uses the same collision,
destruction, pickup, KOTH, bot, draft, and match-mode contracts as every other
map; no combat, event, physics, scoring, or balance value changed.

**Verification:** focused map and theme suites pass 32 tests. A real two-player
Chromium journey drafted Rusted Refinery into Bounty Hunt, reached live play,
and observed the expected two gate and two cache renderers. Desktop visual QA
confirmed the vault landmark, open approaches, diagonal shortcuts, pickup
contrast, and unobstructed HUD; the same match remained fully readable at
844×390 mobile landscape. Typecheck, lint, all 1,182 unit tests across 80 files,
and the production build pass; Vite retains its existing chunk-size advisory.
The full Playwright matrix passes 22 tests with 11 intentional project-scoped
skips.

**Tuning watch:** the side gates should be tempting alternatives rather than
mandatory opening shots, and the vault should create central contests without
making the two open approaches feel interchangeable. Watch actual groups for
which gate opens first, whether barrels create memorable reversals, and whether
all five KOTH sites pull fights into meaningfully different routes before any
topology change.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 72 — 2026-07-13 — Gauntlet Build Mastery

**Shipped:** the lobby's Build Codex is now an interactive six-card trophy
board. Every recipe is visible as an invitation to experiment, while locked
names stay secret and discovered builds reveal their identity, flavor, and best
clear. Each build has its own score chase, the header totals those records, and
Results celebrates both first discoveries and repeat personal bests. The board
opens and returns by pointer, touch, keyboard, or gamepad without rearranging the
established lobby panel.

The Session 71 storage shape migrates in place to a normalized `bestScores` map.
Only full clears can improve it; unknown IDs, malformed values, duplicate
discoveries, and scores for locked builds are discarded. The feature remains
entirely device-local and has no effect on combat, scoring rules, server state,
Daily ranking, lifetime records, bots, PvP, Spar, or balance.

**Verification:** 1,181 tests pass across 80 files, including storage migration,
sanitization, six-card presentation, independent bests, combined best, and both
Results celebrations. TypeScript, ESLint, all package builds, and the production
Vite bundle are clean; Vite retains its existing chunk-size advisory. The full
Playwright matrix passes 22 tests with 11 intentional project-scoped skips.
Targeted flows prove discovery and repeat-best persistence plus real lobby open,
card inspection, and return paths in Chromium, Firefox, and 844×390 mobile
landscape. Desktop visual QA confirmed the layout and prompted a locked-card
contrast increase against the brick backdrop.

**Tuning watch:** per-build records should create reasons to revisit familiar
routes after discovery. Watch whether players recognize that recipes remain
visible on locked cards, whether combined best feels motivating, and whether
the compact lobby entry is sufficiently noticeable before adding more ceremony.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 71 — 2026-07-13 — Gauntlet Build Codex

**Shipped:** every complete two-boon Gauntlet loadout now has a memorable name,
and clearing the finale discovers it in a six-entry device-local Build Codex.
Iron Scavenger, Arc Plating, Ram Raid, Combat Engine, Bloodhound, and Redline
give each route pairing an identity without adding more power. Character Select
and Results name the active finale build, Results calls out a first discovery,
and the lobby keeps `BUILD CODEX: x/6` visible as an invitation to try another
route combination. Daily clears participate in the same chase.

The storage boundary is intentionally narrow: only full clears unlock builds,
known IDs are allowlisted and deduplicated, malformed JSON safely resets, and
the collection never leaves the device or touches lifetime records, Daily
ranking, gameplay authority, combat, scoring, bot tuning, PvP, or Spar.

**Verification:** 1,179 tests pass across 80 files, including all six
order-independent pairs, corrupted storage, clear-only discovery, repeat clears,
and named-build presentation. TypeScript, ESLint, all package builds, and the
production Vite bundle are clean; Vite retains its existing chunk-size advisory.
The full Playwright matrix passes 19 tests with 11 intentional project-scoped
skips. A targeted six-test run proves exact discovery persistence and visible
Results copy in Chromium, Firefox, and 844×390 mobile landscape. A live desktop
browser walkthrough verified the lobby footer. The first full matrix caught an
upward panel shift moving the established difficulty hit target; preserving the
original panel origin and expanding only its height fixed it, and both the
affected Warlord journey and complete matrix pass afterward.

**Tuning watch:** the names should make route combinations easier to remember
without turning one pair into an implied best build. Watch which names players
repeat and whether `x/6` is enough motivation after the first few discoveries;
improve celebration or codex presentation before changing boon balance.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 70 — 2026-07-13 — Gauntlet Boon Drafts

**Shipped:** every Route A/B choice after a Gauntlet or Daily stage now includes
a distinct boon that joins the run build. Scrap Plating adds armor each life,
Kill Salvage sustains aggressive streaks, Quick Charge accelerates signature
powers, and Spawn Rush creates fast openings. The first choice carries into
stage two, the second creates a two-boon finale, and failed or completed runs
start fresh. Route labels explain the exact rule before selection, while
Character Select and Results keep the active build visible.

The server authors, validates, and assigns every offer. Daily routes stay
deterministic, invalid input falls back to the complete Route A offer, and only
human entrants receive benefits. Spawn Rush has a dedicated snapshot timer in
shared movement physics so prediction stays aligned and stacked chaos remains
safe. Existing mode authority still wins: Low Health suppresses armor,
grenade-disabled modes suppress salvage grenades, and One in the Chamber stays
lethal through armor. Spar, PvP, score, contracts, persistence, base balance,
and Rusty's tuning are unchanged.

**Verification:** 1,175 tests pass across 79 files, including deterministic
offers, three-stage carryover/reset, all four effects, mode exclusions,
bot isolation, network reconciliation, and UI copy. TypeScript, ESLint, all
package builds, and the production Vite bundle are clean; Vite retains its
existing chunk-size advisory. The full Playwright matrix passes 16 tests with
11 intentional project-scoped skips, including complete route offers and a
Route B pointer lock in Chromium, Firefox, and mobile landscape. An additional
844×390 live-canvas walkthrough confirmed the responsive frame remains clear.

**Tuning watch:** the four boons are intentionally legible and individually
modest. Watch whether Scrap Plating dominates every route despite its Low
Health and One in the Chamber safeguards, and whether combined Quick Charge +
Ability Overdrive creates exciting bursts without making a particular finale
feel automatic. Adjust boon constants only after real repeated runs.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 69 — 2026-07-13 — Custom Chaos Sparring

**Shipped:** ordinary Rusty Spar now has a persisted `SPAR CHAOS` selector for
turning any compatible shared event into the match's deliberate mid-fight
twist. It composes with the existing difficulty, rival, and mode choices, and
Character Select confirms the server-accepted event before the player locks a
fighter. The final-minute event remains random, preserving a surprise inside a
player-authored practice setup.

Compatibility is centralized in shared code and consumed by Gun Game, One in
the Chamber, matchmaking, and the client. Random-mode openings and rematches
skip modes that cannot honor the choice; an explicit conflicting mode wins and
the server omits the chaos promise. Direct rematches retain a valid selection
even when that same event appeared last round. Gauntlet, Daily Run, PvP,
combat, scoring, bot tuning, physics, and balance are untouched.

**Verification:** 1,169 tests pass across 79 files. TypeScript, ESLint, all
package builds, and the production Vite bundle are clean; Vite retains its
existing chunk-size advisory. The full Playwright matrix passes 16 tests with
11 intentional project-scoped skips. A dedicated opt-in browser smoke proves
the selector, wire metadata, and Character Select briefing together. Manual
desktop and 844×390 mobile-landscape walkthroughs verify persistence, the
longest option label, and a clean browser console. Browser QA increased the new
selector font from 7px to 8px for mobile parity with `SPAR MODE`.

**Tuning watch:** a 19-event cycle is intentionally exhaustive for a small
friend-group sandbox. Watch whether players repeatedly seek only a few events;
if so, a compact favorites row would be more useful than changing combat
balance. Also watch whether a fixed mid-match twist plus random final event
feels authored without becoming too predictable over long rematch chains.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 68 — 2026-07-13 — Daily Rival Chase

**Shipped:** every Daily Run now opens with one server-locked scoreboard goal.
The first player sets the pace; newcomers claim an open rank or break the top
five; returning callsigns chase the friend immediately ahead; and the leader
gets a one-point improvement target. Ties honor the board's established
first-achieved ordering, so every displayed target score is enough to advance.

The target stays fixed through the three-stage attempt and refreshes only on a
failed or completed retry. Character Select and Results show the callsign,
exact score, remaining gap, and a `TARGET BEATEN` payoff. During visual QA the
new line exposed a latent overlap with multi-line Gauntlet briefings; the
fighter grid now moves from the authored line count, keeping both chaos
forecasts and Daily chase copy readable without reducing card size.

**Verification:** 1,159 tests pass across 77 files, including every target
state, stable tie ranking, stage carryover, post-clear refresh, exhaustive copy,
and old-payload behavior. TypeScript, ESLint, all package builds, and the Vite
production bundle are clean; Vite retains its existing chunk-size advisory. A
focused live Chromium Daily flow verifies the target in match metadata and the
visible briefing before reaching play. Desktop and 844×390 mobile-landscape
walkthroughs show the adjusted roster layout with no console errors. The full
Playwright matrix passes 16 tests with 11 intentional project-scoped skips
across Chromium, Firefox, and mobile landscape.

**Tuning watch:** nearest-rival targeting should feel more attainable than
always chasing #1. Watch whether players understand that the target locks for
one attempt, whether `+1` is satisfying on ties, and whether leaders prefer a
larger stretch goal after real group play. No balance constants changed.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 67 — 2026-07-13 — Daily Scoreboard

**Shipped:** completed Daily Run clears now become a shared daily challenge
instead of staying private to one browser. The server records its own final run
score, keeps each normalized callsign's best for that UTC date, and returns the
clear's exact rank and authoritative best. Stable score, first-achieved-time,
and callsign tie-breaks make the order deterministic without client policy.

The lobby mirrors the lifetime board with a live `DAILY TOP 5` panel, including
the challenge date and a first-clear invitation when it is empty. The current
board arrives on connection, updates for every connected player after a clear,
and rolls over even in a long-open client. Recent boards persist for 14 dates
in the existing store, while ordinary Gauntlet and every lifetime progression
path remain isolated.

**Verification:** 1,157 tests pass across 77 files, covering persistence,
ranking, retention, legacy data, authoritative completion, observer delivery,
rollover, wire/cache handling, formatting, and results copy. TypeScript,
ESLint, all package builds, and the Vite production bundle are clean; Vite
retains its existing chunk-size advisory. Desktop and mobile-landscape
Chromium walkthroughs show both boards without obstructing the menu, with no
console errors. A focused live solo smoke verifies that the server snapshot is
cached and rendered in the lobby, and the full Playwright matrix passes 16
tests with 11 intentional project-scoped skips across Chromium, Firefox, and
mobile landscape.

**Tuning watch:** watch whether the visible top five creates friendly daily
competition and repeat attempts, whether first-achieved tie priority feels
fair, and whether five slots are enough for the actual group. No balance
constants changed.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 66 — 2026-07-13 — Ability Overdrive

**Shipped:** match chaos can now roll `ABILITY OVERDRIVE`, a shared window where
every fighter's signature power recharges three times as fast. Authority
accelerates only the existing cooldown field, so Bruce's Iron Hide, Frost
Wizard's freeze, Jack's overdrive, and every other active effect keep their
ordinary duration. The same snapshot path drives players, HUDs, reconnects,
and Rusty without adding client-authored policy or new wire state.

The violet activation banner teaches `3X ABILITY RECHARGE`; advance forecasts
and persistent labels use the shared exhaustive display name. One in the
Chamber omits the random roll because abilities are disabled there, Overcharge
Cells remain an instant refresh, and the event adds a 100-point Gauntlet chaos
bounty. Other modes and mutator combinations remain available.

**Verification:** 1,148 tests pass across 77 files, including exact cooldown
acceleration, real-time active duration, zero clamping, exhaustive copy, pool,
bounty, and One in the Chamber compatibility coverage. TypeScript, ESLint, all
package builds, and the Vite production bundle are clean; Vite retains its
existing chunk-size advisory. A dedicated live Chromium smoke activated the
event, verified its exact banner and HUD label, cast a real local ability, and
observed the server cooldown falling at the accelerated rate. The full
Playwright matrix passes 16 tests with 11 intentional project-scoped skips
across Chromium, Firefox, and mobile landscape.

**Tuning watch:** 3x should create repeated signature-power decisions without
turning them into constant spam. Watch late-round Bruce, Frost Wizard, and Jack
control loops during the next group session, plus whether a shared benefit is
still worth the current 100-point Gauntlet bounty. Frozen character constants
remain untouched pending real group evidence.

**Deployment:** not run; production deployment still requires explicit user
authorization.

### Session 65 — 2026-07-13 — Daily Gauntlet

**Shipped:** the lobby now offers `DAILY RUN`, a server-dated three-fight
Gauntlet designed for repeatable mastery. The server derives each day's opening
arena, mode, and Rusty rival from its UTC date. Every fight then receives a
stable seed covering its spawn layout, contract, cache reward, hazard choices,
and RNG-driven event timing. A loss or completed clear can be retried without
quietly rerolling the challenge; normal route advancement still follows the
existing authoritative Gauntlet rules.

The lobby displays today's local daily target, and Daily-specific briefings,
stage-clear copy, and retry actions make the mode legible through the whole
flow. Completed clears can set a device-local daily best and extend a streak
across consecutive UTC dates. Partial runs do not bank a score, and repeat
clears on the same date cannot inflate the streak. All full Gauntlet clears
still share the overall all-time `BEST CLEAR`, so any full clear can improve
that broader score target while Daily Run adds its date-specific record.

**Verification:** 1,146 tests pass across 77 files, including deterministic
opening/RNG helpers, server-owned retries, contract and spawn repeatability,
storage normalization, UTC rollover, best/streak progression, and Daily copy.
TypeScript, ESLint, all package builds, and the Vite production bundle are
clean; Vite retains its existing chunk-size advisory. A dedicated live
Chromium smoke selected Daily Run, observed the current server UTC key and
authored Rusty lock, verified the briefing, and reached live play. The full
Playwright matrix passes 16 tests with 11 intentional project-scoped skips
across Chromium, Firefox, and mobile landscape.

**Tuning watch:** unlimited attempts make the challenge welcoming and preserve
the score-attack loop. Watch whether the streak feels motivating without an
in-game calendar, and whether sharing the date plus score is enough social
friction before adding any network leaderboard or reward system.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 64 — 2026-07-13 — Checkpoint Zero

**Shipped:** a fifth arena built around changing routes rather than just a new
palette. Checkpoint Zero's rotational layout puts 28 visible reinforced
barricades into long horizontal and vertical lanes, surrounds a contested
four-pickup center, and adds paired shoot-open shortcuts, explosive barrels,
scavenger caches, spawn points, and five KOTH positions. It participates in
the ordinary draft, no-draft rotation, rematches, FORCE pin, every mode, and
Gauntlet route generation through the shared registry.

The client now supports aspect-correct barricade cover as a theme capability.
The 16×14 reinforced and wooden sources render at 48×42 and deterministically
rotate along the strongest neighboring cover axis. This remains cosmetic over
the existing tile grid: server authority, explosion exposure, reliable tile
destruction, prediction collision, and frozen movement/combat values did not
change. Existing arena layouts remain intact.

**Verification:** 1,139 tests pass across 76 files, including map validation,
five-map rotation/wrap, Gauntlet route expectations, theme resolution, and
orientation logic. TypeScript, ESLint, all package builds, and the Vite
production bundle are clean; Vite retains its existing chunk-size advisory.
The forced live Chromium smoke loaded Checkpoint Zero, visually exercised both
barricade directions at the correct dimensions, and destroyed one while
proving the sprite, tile, and collision opened. The full Playwright matrix
passes 16 tests with 11 intentional scoped skips across Chromium, Firefox,
and mobile landscape.

**Tuning watch:** the arena deliberately starts cover-dense so demolition and
gate opening create a noticeable second layout. Watch whether the long side
walls make early ranged fights too predictable or whether the central pickup
cluster needs one more approach after friend-group play.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 63 — 2026-07-13 — Choose Your Rival

**Shipped:** `RUSTY SPAR` now pairs its difficulty control with a persisted
`RIVAL` selector for `RANDOM` or any of the six fighters. A chosen rival stays
locked through direct rematches, turning Spar into deliberate matchup practice
without changing random variety for players who just want a quick fight. The
full fighter name remains visible in the compact row, and pointer, touch, and
gamepad navigation all use the existing menu path.

The client derives order and names from the shared roster and sends an optional
request only for ordinary Sparring. Matchmaking validates the identifier,
locks Rusty through the normal character-select authority, and owns rematch
retention. Invalid and old-client payloads keep random selection. Gauntlet
discards the request so its authored route rivals and no-repeat run history
cannot be overridden; PvP and every gameplay system remain unchanged.

**Verification:** 1,134 tests pass across 76 files, including preference
cycling, optional serialization, validation, authoritative lock, rematch
retention, and Gauntlet isolation. TypeScript, ESLint, all package builds, and
the Vite production bundle are clean; Vite retains its existing chunk-size
advisory. The live Chromium smoke selected Frost Wizard, measured the label
inside its button, verified the persisted choice and Rusty's exact lock/copy,
and reached play. The full Playwright matrix passes 16 tests with 11
intentional scoped skips across Chromium, Firefox, and mobile landscape.

**Tuning watch:** `RANDOM` remains the default for discovery. Watch whether
pinning Rusty to a fighter makes the same-fighter player restriction surprising;
the character-select lock is intentionally visible before considering mirror
matches, which would be a separate roster-rule change.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 62 — 2026-07-13 — Favorite Mode Sparring

**Shipped:** `RUSTY SPAR` now has a compact `SPAR MODE` selector for `RANDOM`
or any of the game's eight rulesets. The selection survives reloads, works
through the existing pointer/touch/gamepad menu controls, and pins that mode
through direct rematches while the arena still changes. Players can drill
Core Run, chase another Bounty Hunt, or settle into any favorite without
giving up the rotating mix as the default.

The client derives order and copy from the shared mode registry and sends an
optional request only for ordinary Sparring. Matchmaking validates the value,
keeps `FORCE_MODE` strongest, owns rematch retention, and ignores the field for
Gauntlet so route offers remain authoritative. Invalid and old-client payloads
fall back to the existing random behavior. PvP, stats isolation, AI, combat,
scoring, physics, and every individual mode rule are unchanged.

**Verification:** 1,130 tests pass across 75 files, including the preference
cycle, optional network payload, server validation, Gauntlet isolation, result
metadata, and direct-rematch retention. TypeScript, ESLint, all package builds,
and the Vite production bundle are clean; Vite retains its existing chunk-size
advisory. A forced live Chromium Spar smoke selected and persisted KOTH,
observed the authoritative KOTH match and briefing, and reached play. The full
Playwright matrix passes 16 tests with 11 intentional scoped skips across
Chromium, Firefox, and mobile landscape.

**Tuning watch:** `RANDOM` remains the default because discovery matters. Watch
whether players leave one mode pinned unintentionally between sessions; the
persistent label is deliberately explicit before considering a reset policy.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 61 — 2026-07-13 — Death Animation Variety

**Shipped:** repeated eliminations now rotate through every complete,
compatible collapse in the bundled art pack. Mighty Man and Frost Wizard get
three distinct falls, Bruce and Bubba get two, and Jack's no-axe body gets a
second. The familiar animation always plays first, then later deaths vary the
silhouette and motion so rematches feel less mechanically repeated.

`CharacterDef.deathVariants` keeps asset names, frame dimensions, and counts
beside the rest of the roster presentation contract. A pure selector reads the
existing authoritative match death count, while BootScene registers
death-only texture/animation prefixes and normalizes their differing frame
counts to the same 0.65-second beat. There is no client RNG, protocol field,
server behavior, or gameplay change. Rook and armed Jack deliberately retain
their complete synchronized originals rather than combining missing art.

**Verification:** 1,125 tests pass across 74 files, including deterministic
cycles, fallback coverage, and registry integrity. TypeScript, ESLint, all
package builds, and the Vite production bundle are clean; Vite retains its
existing chunk-size advisory. A forced live Chromium Practice smoke verified
all ten new textures plus the exact character-aware second-death texture and
animation key. The full Playwright matrix passes 16 tests with 11 intentional
scoped skips across Chromium, Firefox, and mobile landscape, and teardown
leaves no game ports open.

**Tuning watch:** the base-first deterministic cadence keeps each fighter
recognizable and makes variation guaranteed. Watch whether the extra collapses
remain readable under Big Heads and on mobile before changing their shared
0.65-second duration.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 60 — 2026-07-13 — Mutator Rule Callouts

**Shipped:** all 18 match-chaos events now teach their rule in the activation
banner. Players see actionable explanations such as `STAY CLOSE OR LOSE
SIGHT`, `GRENADES REFILL EVERY 3 SEC`, and `COVER + GATES COLLAPSE` at the
moment each surprise begins, closing the knowledge gap between experienced
players and someone encountering a mutator for the first time.

The details are an exhaustive shared map keyed by `MutatorId`, so future
events cannot compile without teaching copy. Uppercase and 30-character
limits protect the existing compact banner, while persistent HUD labels and
advance warnings stay uncluttered. The client simply renders the shared rule;
authoritative behavior, scheduling, compatibility, scoring, and physics are
unchanged.

**Verification:** 1,121 tests pass across 73 files, including exhaustive
coverage for every current mutator and exact Blood Rush/Blackout copy.
TypeScript, ESLint, all package builds, and the Vite production bundle are
clean; Vite retains its existing chunk-size advisory. A forced live Chromium
Practice smoke verified the exact two-line Blood Rush activation banner. The
full Playwright matrix passes 16 tests with 11 intentional scoped skips across
Chromium, Firefox, and mobile landscape, and teardown leaves no game ports
open.

**Tuning watch:** observe whether the 30-character copy remains legible during
high-pressure fights, especially on mobile landscape. Shorten individual
phrases before enlarging or lengthening the banner.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 59 — 2026-07-13 — Blood Rush

**Shipped:** the new `blood_rush` mutator turns every living opponent kill into
a four-second 1.35x speed burst. Instead of pausing after an elimination, the
killer can immediately close on another target, steal an objective, contest a
drop, or escape retaliation. The rule gives rapid-kill medals a physical
gameplay rhythm and creates momentum swings without changing weapon damage.

The server alone grants the boost. Suicides and delayed posthumous kills are
rejected, while another valid kill refreshes rather than stacks the duration.
The existing snapshot boost timer feeds shared movement math on server
authority, local prediction, reconciliation, and Rusty, preserving exact
physics with no new wire state. Blood Rush conflicts with Second Wind in
ordinary scheduling, composes with Super Speed, works in all eight modes, and
joins Gauntlet forecasts at a 200-point danger bounty. Crimson activation copy
teaches the trigger, and boosted fighters emit the existing movement dust.

**Verification:** 1,121 tests pass across 73 files, including exact shared and
authoritative movement, expiry, invalid-kill rejection, conflict symmetry,
activation copy, and exhaustive bounty/label coverage. TypeScript, ESLint, all
package builds, and the Vite production bundle are clean; Vite retains its
existing chunk-size advisory. A forced live Chromium Practice smoke verified
authoritative activation and the persistent HUD label. The full Playwright
matrix passes 16 tests with 11 intentional scoped skips across Chromium,
Firefox, and mobile landscape, and teardown leaves no game ports open.

**Tuning watch:** 1.35x for four seconds should be enough to convert a kill into
a chase without making the leader untouchable. Watch Gun Game and crowded
free-for-alls for runaway chaining before changing duration, multiplier,
Second Wind conflict, or the 200-point Gauntlet bounty.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 58 — 2026-07-13 — Live Gauntlet Style Callouts

**Shipped:** every score-worthy Gauntlet highlight now reveals its value in the
existing combat callout: `STYLE +50 IF CLEARED` for First Blood through
`STYLE +300 IF CLEARED` for Mayhem. Players learn the ladder during the fight,
at the exact moment the risky or skillful play lands, instead of reverse-
engineering the results breakdown afterward.

The live number and final result share one per-kill award function, including
the medal thresholds and one-award priority. Presentation is based on the
ordinary authoritative kill event and activates only when match metadata marks
the fight as Gauntlet. It intentionally shows no running total because prior
kills are not replayed after a reconnect; the server remains the sole owner of
the complete 600-point cap, victory requirement, and banked stage score.

**Verification:** 1,115 tests pass across 73 files. Focused shared/client tests
cover award priority, ignored kills, conditional copy, and unchanged null/zero
behavior. TypeScript, ESLint, all package builds, and the Vite production bundle
are clean; Vite retains its existing chunk-size advisory. The full Playwright
matrix passes 16 tests with 11 intentional scoped skips across Chromium,
Firefox, and mobile landscape, and teardown leaves no game ports open.

**Tuning watch:** the suffix makes score information denser during an already
celebratory moment. Watch readability on smaller phones and whether `IF
CLEARED` feels motivating rather than punitive before shortening the copy.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 57 — 2026-07-13 — Gauntlet Style Bonuses

**Shipped:** Gauntlet now turns the human player's combat highlights into a
capped `STYLE` payout when the stage is won. First Blood, Double/Triple Kill,
Mayhem, Clutch, and From the Grave each have a readable value, so aggressive
execution and highlight hunting create another route to a personal best beyond
contracts, flawless clears, pace, and forecast danger.

The payout is derived only from the completed Match's authoritative kill feed.
One kill receives its highest-priority eligible award, suicides and opponent
kills are ignored, and a 600-point stage cap keeps the clear objective and fast
finish more important than farming a long deathmatch. Failed stages bank no
style. The client only displays the server-authored result, with an optional
wire field so older results retain their original subtotal and layout.

**Verification:** 1,114 tests pass across 73 files, including award priority,
cap and loss behavior, authoritative matchmaking integration, and old/new
result presentation. TypeScript, ESLint, all package builds, and the Vite
production bundle are clean; Vite retains its existing chunk-size advisory.
The full Playwright matrix passes 16 tests with 11 intentional scoped skips
across Chromium, Firefox, and mobile landscape, and teardown leaves no game
ports open.

**Tuning watch:** 600 deliberately allows two exceptional highlights or a
short multikill sequence to matter without outscoring the 1,000-point clear.
Watch whether posthumous or repeated Mayhem entries hit the cap too routinely
before changing individual values or the ceiling.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 56 — 2026-07-13 — Demolition Wave

**Shipped:** the new `demolition_wave` mutator turns an established firefight
into a different arena in one authoritative beat. Every ordinary low-cover cell
and still-closed wire gate drops for the rest of the round, exposing long
sightlines, opening flanks, and invalidating safe positions players had already
settled into. The normal warning banner telegraphs the change; activation lands
with an amber flash, camera shake, and zoom pulse.

The server computes the affected cells from immutable map data plus the live
collision grid, then uses the existing reliable tile-destruction stream. Client
rendering and prediction, Rusty's pathing, hitscan, grenades, and abilities all
see the same open geometry without a parallel state model or new wire payload.
Barrel and scavenger-cache cells are protected, ordinary walls remain intact,
already-open cells never rebroadcast, and a rematch reconstructs the authored
arena. Demolition Wave joins every mode's random pool and the Gauntlet forecast
table at a 300-point danger bounty.

**Verification:** 1,111 tests pass across 73 files, including the pure arena
selector, authoritative Match activation, immutable-map behavior, protected
hazards/loot, and exhaustive shared labels/bounties. TypeScript, ESLint, all
package builds, and the Vite production bundle are clean; Vite retains its
existing chunk-size advisory. A forced live Chromium Practice smoke verified
the active HUD label and zero remaining closed-gate renderers. The full
Playwright matrix passes 16 tests with 11 intentional scoped skips across
Chromium, Firefox, and mobile landscape, and teardown left no game ports open.

**Tuning watch:** the wave deliberately favors aggression and long-range aim,
but the practical swing depends on arena, mode, and when it arrives. Watch for
maps becoming too sparse or objective carriers losing all viable approach
routes before changing its 300-point bounty or introducing mode exclusions.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 55 — 2026-07-13 — Gauntlet Chaos Bounties

**Shipped:** every advanced Gauntlet forecast now carries an explicit danger
bounty. Players can take a lower-paying wildcard or chase a 300-point brutal
event, turning the route screen into a high-score wager instead of only a
preference picker. The payout appears on the route card, follows the selected
fight into its character-select briefing, and is itemized in the winning score
breakdown before rolling into the run and `BEST CLEAR` total.

The frozen table covers all 18 current mutators at compile time. Shared boons and light
spectacle pay 100; disruptive rules pay 200; one-shot health, forced loadouts,
and sustained arena threats pay 300. Only a server-authored forecast can create
a bounty, and only an authoritative human win banks it. The payout does not wait
for activation, preserving the pace bonus's incentive to finish quickly rather
than stall until chaos begins. Stage one, losses, draws, ordinary Spar, and PvP
all remain unchanged.

Route cards retain their four-line 8 px layout and established pointer/touch
targets. The longest label was reviewed in desktop and mobile-landscape captures
without clipping; the temporary captures were removed after inspection.

**Verification:** 1,109 tests pass across 73 files, including exhaustive tier
coverage, victory-only scoring, old-result fallback, multi-stage accumulation,
briefing copy, score breakdown, and route labels. TypeScript, ESLint, formatting,
all package builds, and the Vite production bundle are clean; Vite retains its
existing chunk-size advisory. The full Playwright matrix passes 16 tests with
11 intentional scoped skips, including the bounty route in Chromium, Firefox,
and mobile touch. Playwright teardown left ports 3000, 3001, and 5173 clear.

**Tuning watch:** the first 100/200/300 assignments describe disruption, not a
claim that every event is equally hard in every mode or matchup. Watch whether
players always choose the highest visible number; adjust the frozen table from
real route-choice and clear-rate evidence rather than speculative balance.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 54 — 2026-07-13 — Gauntlet Chaos Forecasts

**Shipped:** advanced Gauntlet routes now reveal the compatible mid-match chaos
event waiting inside each next fight. The route cards show arena, mode, rival,
and event together, so players can choose a matchup they want to solve instead
of accepting a hidden random twist. The selected forecast is repeated in the
next character-select briefing and then pinned into the authoritative Match.

Forecast generation is stable and consumes no matchmaking or gameplay RNG.
The server excludes the completed fight's active events, every forecast already
promised during the run, the destination mode's vetoes, and a forced final
event plus its conflicts. Route B also excludes Route A's offer, so the branches
remain meaningfully different. A shared run history records a promise when its
stage launches, preventing repeats even when the fight ends before activation.
Forced smoke hooks retain precedence and Match performs a final compatibility
check before honoring a plan.

Results use readable four-line route cards without moving the established
pointer/touch targets, and older payloads retain their one-, two-, or three-line
layouts. The longest current forecast label (`WEAPON ROULETTE`) was visually
reviewed at the 8 px route-card size in desktop and mobile-landscape geometry.

**Verification:** 1,107 tests pass across 73 files, including deterministic
forecast generation, no-repeat carry, exact route lock-in, mode compatibility,
live Match revalidation, old-payload presentation, and route-card labels.
TypeScript, ESLint, formatting, all package builds, and the Vite production
bundle are clean; Vite retains its existing chunk-size advisory. The full
Playwright matrix passes 16 tests with 11 intentional scoped skips, including
the forecast route screen in Chromium, Firefox, and mobile touch. Desktop and
mobile-landscape captures were reviewed and removed, and Playwright teardown
left ports 3000, 3001, and 5173 clear.

**Tuning watch:** knowing the event turns randomness into planning, but some
event/mode/rival combinations may become obvious auto-picks. Watch route-choice
rates before weighting forecasts; the optional field and deterministic picker
leave room to tune offers without changing the wire contract.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 53 — 2026-07-13 — Gauntlet Rival Drafts

**Shipped:** Gauntlet routes now reveal more than the next arena and ruleset:
each branch previews a different fighter for Rusty. Picking a route locks the
entire server-authored offer, so the next character-select screen names the
rival and the bot is already locked to that character. Players can now make a
real counter-pick instead of learning Rusty's matchup only after committing to
the branch.

The server records the opponents encountered by an advancing run and selects
future offers deterministically from roster order without consuming RNG. It
skips every fighter already faced, guaranteeing three distinct matchups across
the three-stage climb. A clear, loss, or draw discards that history, so the next
run starts with an ordinary fresh Rusty roll. Optional wire fields preserve old
payload presentation and Route A fallback behavior, while fully forced
map/mode runs correctly keep two choices when the rivals differ.

Results use compact three-line route buttons for the arena, mode, and matchup;
the character-select briefing names the pinned rival on its own line. The
longest current label (`FROST WIZARD`) was visually checked in both desktop and
844×390 mobile layouts, with pointer and touch selection following the existing
button path.

**Verification:** 1,102 tests pass across 73 files, including deterministic
rival generation, no-repeat history, exact server lock-in, reset isolation,
old-payload presentation, and route labels. TypeScript, ESLint, formatting, all
package builds, and the Vite production bundle are clean; Vite retains its
existing chunk-size advisory. The full Playwright matrix passes 16 tests with
11 intentional scoped skips, including the rival route screen in Chromium,
Firefox, and mobile touch. Visual captures were reviewed and removed, and
Playwright teardown left ports 3000, 3001, and 5173 clear.

**Tuning watch:** stable roster order makes choices learnable and avoids hidden
randomness, but it can create favorite matchup sequences. Watch whether players
always counter-pick the same fighter; the optional rival field leaves room for
future weighted or archetype-based offers without changing the protocol.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 52 — 2026-07-13 — Gauntlet Route Draft

**Shipped:** every cleared Rookie or Scrapper stage now offers two
server-authored next fights. Route A keeps the familiar next rotation entry;
Route B skips one entry forward in both the arena and mode cycles. Choosing a
branch immediately launches the same authoritative next stage with the same
Rusty difficulty and score bank, while the following offer naturally continues
from the chosen destination. Failed and completed runs still offer one clean
stage-one retry.

The rematch message gained one optional route ID, so older clients and missing
choices continue through Route A. The server validates against its stored
offers; invalid values cannot invent a map or mode. FORCE pins are honored and
duplicate destinations collapse to one action. PvP, ordinary Spar, contracts,
mutators, stats, scoring, and combat tuning are unchanged.

Results now show a `CHOOSE` teaser and Route A / Route B / Back to Lobby actions
with pointer, touch, and controller traversal. The live mobile regression
uncovered a shared button ordering edge where a touch-generated `pointerover`
could overwrite the pressed state before release. `PixelButton` now preserves a
press through that sequence, hardening every menu button rather than adding a
route-only workaround.

**Verification:** 1,100 tests pass across 73 files, including route generation,
deduplication, missing/tampered fallback, wire compatibility, authoritative
branch progression, reset isolation, and presentation. TypeScript, ESLint,
formatting, all package builds, and the Vite production bundle are clean; Vite
retains its existing chunk-size advisory. The full Playwright matrix passes 16
tests with 11 intentional scoped skips. The route browser regression renders
the real ResultsScene and activates Route B in desktop Chromium, desktop
Firefox, and 844×390 mobile touch; desktop and mobile captures were visually
checked for label fit and action spacing. Playwright teardown left ports 3000,
3001, and 5173 clear.

**Tuning watch:** both routes currently advance map and mode together, making
the choice fast and legible rather than a four-way matrix. Watch whether players
develop favorites or simply prefer Route B's novelty; if one branch dominates,
future route offers can compare independent map/mode combinations without
changing the selection protocol.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 51 — 2026-07-13 — Gauntlet Performance Bonuses

**Shipped:** Gauntlet now rewards how a stage was won, not only whether it was
won. A deathless victory earns 400 flawless points, and each whole regulation
second left earns two pace points up to 300. Those join the existing clear,
contract, and regulation awards for a 2,200 stage ceiling and 6,600 run ceiling.
The server derives every value from authoritative stats and its own clock, then
ships the exact breakdown through `MatchResult`.

The result line is a compact score equation that exposes every contribution
without asking the player to reverse-engineer the total. Old browser-local best
clears remain comparable and require no migration; the richer scale simply
gives a previously perfect 4,500 run room to improve. Ordinary Practice, PvP
stats, leaderboards, Rivalry Sets, contracts, and combat balance are unchanged.

The E2E server now runs as a single non-watching `tsx` process. This prevents a
watcher's restarted child from outliving Playwright and later reclaiming port
3000 with stale smoke-test pins, so later runs always exercise the intended
fresh server configuration.

**Verification:** 1,097 tests pass across 73 files, including capped/fractional
pace, invalid-input normalization, zero-death gating, overtime, loss gating,
three-stage carry, and presentation. TypeScript, ESLint, formatting, all package
builds, and the Vite production bundle are clean; Vite retains its existing
chunk-size advisory. The full Playwright desktop Chromium, desktop Firefox, and
mobile-landscape matrix passes 13 tests with 11 intentional scoped skips. Its
first run exposed an orphaned forced-Deathmatch watch child; after the lifecycle
fix, the isolated Bounty Hunt flow and complete matrix both passed cleanly, with
no server listener left behind. Real authoritative desktop and 844×390 mobile
runs verified lobby and stage copy, loss scoring, award rows, retry/lobby
actions, fixed-canvas scaling, and zero client errors. The maximum success
equation was kept deliberately compact and is deterministically covered by the
client presentation test. All temporary playtest services were stopped.

**Tuning watch:** pace deliberately caps below flawless, so survival remains the
largest new skill signal and naturally slow objective modes are not buried by
fast Deathmatch routes. Watch whether 400 makes deathless play too conservative
and whether two points per second produces enough visible separation between
otherwise similar clears.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 50 — 2026-07-13 — Gauntlet Score Attack

**Shipped:** every Gauntlet run now has a server-owned score. Winning a stage
banks 1,000 points, completing its contract adds 300, and closing it in
regulation adds 200. The bank travels through each authoritative match-found
payload, and results disclose the exact stage breakdown instead of asking the
client to infer it. Failed runs retain their earned total on the result screen
but restart at zero; clears show the final total and then open a fresh run.

A device-local `BEST CLEAR` now gives solo players a visible target in the
lobby. Only a completed three-stage clear can improve it, with `NEW BEST CLEAR`
presentation on results. The current bank is also visible before each fighter
pick. This record is deliberately presentation-only: Gauntlet remains isolated
from lifetime PvP stats, leaderboards, Rivalry Sets, and combat balance.

**Verification:** 1,096 tests pass across 73 files, including scoring, overtime,
contract, failure, carry/reset, record-gating, and presentation coverage.
TypeScript, ESLint, formatting, shared/server builds, and the Vite production
bundle are clean; Vite retains its existing chunk-size advisory. The full
24-case Playwright desktop Chromium, desktop Firefox, and mobile-landscape
matrix passes with its intentional scoped skips (one Firefox touch case flaked
once, passed alone, then the complete matrix passed cleanly). A real in-app
authoritative Gauntlet run verified the lobby target, `RUN 0` briefing, failed-
stage zero-point explanation, retained run total, awards spacing, retry action,
and 844×390 results layout. All temporary smoke services were stopped.

**Tuning watch:** 4,500 is intentionally transparent rather than mysterious.
Watch whether contracts feel like a worthwhile optional risk at +300, whether
the +200 regulation bonus creates enough urgency, and whether players want
separate fighter-specific records after the device-wide best proves useful.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 49 — 2026-07-13 — Wasteland Gauntlet

**Shipped:** solo Practice now offers two intentional experiences. Rusty Spar
keeps the selected one-off difficulty, while Gauntlet begins a three-fight run
through Rookie, Scrapper, and Warlord. Only a human win advances; a loss or draw
ends the run, and defeating Warlord clears it. Results immediately offer the
next fight or a stage-one retry, with the next rotating map and mode previewed.

The server owns every stage transition and sends optional run metadata through
the existing match-found and result messages. Direct rematches preserve normal
map/mode rotation, fresh-mutator exclusions, and fresh contracts, while all
combat and Rusty inputs keep their ordinary authoritative paths. Gauntlet stays
fully isolated from lifetime PvP records, leaderboards, and Rivalry Sets. The
lobby, character select, and results screens clearly distinguish Spar from the
run and present `STAGE CLEAR`, `RUN ENDED`, or `GAUNTLET CLEAR` without adding a
second match flow.

**Verification:** 1,094 unit tests pass across 73 files, including pure stage
resolution and client-copy coverage plus matchmaking integration for server-
owned progression, failure reset, and persistent-stat isolation. TypeScript,
ESLint, and the production build are clean; Vite retains its existing chunk-
size advisory. The unpinned Playwright matrix passes 13 tests with 11
intentional scoped skips across desktop Chromium, desktop Firefox, and mobile
landscape. A dedicated Gauntlet Practice smoke observed authoritative stage-one
Rookie metadata and briefing copy before reaching live play. In-app desktop
visual review confirmed the balanced Spar/Gauntlet lobby treatment. All local
smoke services were stopped afterward.

**Tuning watch:** the fixed Rookie → Scrapper → Warlord arc is intentionally
easy to understand and currently carries no persistent best-run record. Watch
whether three full rotating fights feel like a satisfying compact run, whether
draws should continue to count as failure, and whether repeated clears create
enough pull before considering any durable solo progression.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 48 — 2026-07-13 — Twin-Stick Controller Support

**Shipped:** a connected standard browser gamepad can now carry a player from
the lobby through Practice, character lock-in, live combat, results, and rematch.
The left stick moves, right stick aims, triggers preserve the game's deliberate
hold/release fire and grenade semantics, and shoulder/face buttons cover sprint,
ability, reload, and live-grenade detonation. A rescaled radial dead zone removes
stick drift, input modes hand off automatically, and disconnecting mid-round
falls back safely without changing the shared input, wire, or physics contracts.

Controller focus reuses the existing menu buttons and server-authoritative scene
actions. Live play hides the stale mouse crosshair, teaches the mapping once per
round, and adds optional haptic feedback only for valid local combat actions and
incoming damage. Unsupported vibration hardware fails silently, while touch,
mouse, and keyboard behavior remain intact.

**Verification:** 1,088 unit tests pass across 71 files, including deterministic
coverage for dead zones, aim persistence, trigger-release edges, grenade gates,
combat buttons, disconnects, haptics, menu edges, and transition-safe priming.
TypeScript, ESLint, and the production build are clean; Vite retains its existing
chunk-size advisory. The unpinned Playwright matrix passes 13 tests with 11
intentional scoped skips across desktop Chromium, desktop Firefox, and mobile
landscape. A dedicated synthetic-gamepad Practice smoke drove the lobby and
character-select scenes, then verified live movement, aim, RT-release fire,
mapping help, and haptics through the normal networked match path. An in-app
desktop visual review confirmed the controller hint fits the lobby cleanly. All
local smoke services were stopped afterward.

**Tuning watch:** validate the 20% radial dead zone and release-to-fire cadence
on several physical controller models at the next group playtest. The initial
button used to wake a newly visible browser gamepad is intentionally consumed so
it cannot double-activate across scene transitions; watch whether that feels
surprising on real hardware.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 47 — 2026-07-13 — Overcharge Cells

**Shipped:** every authored arena now has one contested Overcharge Cell in the
unused tile of its central two-by-two. An eligible fighter who claims it gets a
full signature-ability cooldown reset; ready, nearly ready, active, dead, or
ineligible fighters leave it available instead of wasting it. Cells return
after 30 seconds, can appear rarely in Scavenger Caches and Scavenger Rush, and
stay out of Gun Game and One in the Chamber while remaining available in Core
Run.

Rusty values an actionable cell below a shotgun or bat but above Scrap Armor.
The new POWER TRIP contract asks for two claims and is excluded from modes that
exclude the pickup. The client renders a procedural violet-and-yellow cell with
a pulsing CHARGE halo, then gives the collector an OVERCHARGED / ABILITY READY
callout, violet screen accent, camera bump, and distinct high-pitched pickup
sound. No asset or network-message expansion was needed.

**Verification:** 1,078 unit tests pass across 69 files, including focused
config, map registry, pickup lifecycle, eligibility, loot filtering, contracts,
mode compatibility, Rusty priorities, rendering, and feedback coverage.
TypeScript, ESLint, and the production build are clean; Vite retains its
existing chunk-size advisory. The clean Playwright matrix passes 13 tests with
11 intentional scoped skips across desktop Chromium, desktop Firefox, and
mobile landscape. A dedicated pinned Practice assertion confirmed the
authoritative cell and visible CHARGE label, and a clean live Wasteland Outpost
round visibly confirmed POWER TRIP, the authored center placement, and the
procedural presentation with zero browser warnings or errors. All local smoke
services were stopped afterward.

**Tuning watch:** watch whether the 30-second return cadence creates two or
three meaningful center contests per round, and whether the two-second
eligibility floor feels protective rather than surprising near cooldown-ready.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 46 — 2026-07-13 — Scrapstorm

**Shipped:** Scrapstorm now punctuates compatible regulation rounds with a
captured-position debris strike: 1.5 seconds of warning inside a two-tile ring,
then a 45-damage blast. Stable round-robin targeting spreads pressure across
living fighters, while capture-not-track behavior guarantees that moving out is
the right response. Anyone who enters the marked circle can still be caught.

Impacts are nonlethal environmental pressure. They honor invulnerability and
Iron Hide, consume Scrap Armor before health, clamp at 1 HP, and cannot produce
scores, kills, stats, contracts, Vampire healing, or kill-feed noise. Overtime
retires the event. Random scheduling keeps Scrapstorm apart from Low Health and
Radiation Storm, while Rusty immediately seeks deterministic open ground during
an active warning.

The client receives a reconnect-safe quiet/warning state and draws an orange
filled ring, glow, inward ticks, progress arc, decimal countdown, local move
callout, and active-mutator clock. Impacts reuse the established environmental
explosion presentation without introducing a second transient wire path.

**Verification:** 1,072 unit tests pass across 69 files, including focused
config, scheduling, combat, match, bot, matchmaking snapshot, client network,
renderer, and HUD coverage. TypeScript, ESLint, and the production build are
clean; Vite retains its existing chunk-size advisory. The clean Playwright
matrix passes 13 tests with 11 intentional scoped skips across desktop Chromium,
desktop Firefox, and mobile landscape. A separate pinned live Practice round
visibly confirmed the full warning/countdown/impact flow under Blackout,
including the combined mutator label, and produced zero browser warnings or
errors. All local smoke services were stopped afterward.

**Tuning watch:** the two-tile radius and 1.5-second warning deliberately make
staying still costly but ordinary movement sufficient. Watch whether six-second
cadence adds welcome rhythm in crowded rounds or needs slightly more quiet time.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 45 — 2026-07-13 — Scrap Armor

**Shipped:** every arena now contests one center-lane Scrap Armor plate. It
grants 35 temporary shield points, respawns in 25 seconds, and joins the cache
and Scavenger Rush reward table as a rare roll. The authoritative damage choke
point applies Iron Hide before armor, drains health only after the shield, and
preserves the full landed post-reduction damage for stats, contracts, Vampire,
and combat feedback. Death, respawn, and overtime cannot carry armor forward;
Low Health removes it entirely, while radiation intentionally passes through.

Armor is carried through snapshots, interpolation, reconciliation, prediction
state, and render assembly. A slim cyan bar appears over shielded fighters and
above the local health bar, whose label shows health plus armor separately. A
procedural riveted steel plate supplies distinct world art. Clutch medals now
require an empty shield, and Rusty values armor between power weapons and
ordinary healing without chasing a full plate.

**Verification:** 1,059 unit tests pass across 68 files, including focused
pickup, combat, match, bot, mode, map, network reconciliation, and presentation
coverage. TypeScript, ESLint, and the production build are clean; Vite retains
its existing chunk-size advisory. The clean Playwright matrix passes 13 tests
with 11 intentional scoped skips across desktop Chromium, desktop Firefox, and
mobile landscape. A separate in-app-browser Practice smoke pinned Deathmatch on
Wasteland Outpost, visibly confirmed the new blue plate at the authored center
spawn through a normal networked match, and produced zero browser warnings or
errors. The local smoke services were stopped afterward.

**Tuning watch:** 35 armor absorbs roughly one strong rifle hit plus spillover
without rewriting weapon lethality. Watch whether the 25-second center respawn
creates healthy repeat contests or needs a slightly longer cooldown in crowded
matches.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 44 — 2026-07-13 — Rusty's Scavenger Instincts

**Shipped:** Practice Rusty now contests the arena economy instead of ceding
every authored pickup to the human. A pure deterministic selector scores only
active, useful resources inside a six-tile detour: critical bandages first,
then scarce weapons, ordinary healing, pistol sidegrades, grenades, and rifle
ammo. Distance and stable pickup id settle ties, while an expiry-time travel
check rejects rewards that will vanish before Rusty can plausibly arrive.

Weapon judgment preserves a live bat or shotgun, permits a nearly dry matching
weapon refresh, and never trades power for the pistol sidegrade. Full health,
grenade, and ammo refills are ignored. Movement priority remains storm safety,
live Kill Confirmed/Core Run/KOTH objectives, and an enemy Bounty target before
loot; Scavenger Rush keeps its short-lived priority next. Rusty still aims,
fires, throws, and uses abilities while detouring, then collects through the
same authoritative overlap and pickup-application path as every human.

**Verification:** 1,050 unit tests pass across 67 files, including 21 focused
bot-controller tests for valuation thresholds, deterministic range/lifetime
selection, exact tie-breaking, live collection, fighting while detouring, and
storm/KOTH/Kill Confirmed/Core Run/Bounty precedence. TypeScript, ESLint, and
the production build are clean; Vite retains its existing chunk-size advisory.
The standard Playwright matrix passes 13 tests with 11 intentional scoped skips
across desktop Chromium, desktop Firefox, and mobile landscape. A separate
in-app-browser Practice smoke pinned Deathmatch on Scrapyard: Rusty routed from
its bottom-right spawn to the authored pistol at tile `(14,10)`, collected it
through the live networked match, and continued combat with zero browser
warnings or errors.

**Tuning watch:** six tiles keeps a detour tactical rather than map-wide; 50%
critical health, 75% ordinary bandage interest, and 50% rifle-ammo interest are
readable first defaults. Watch whether Rusty steals enough contested weapons
to feel opportunistic without becoming distractible, and whether Warlord would
benefit from a slightly wider range after human playtesting.

**Deployment:** not run; deployment still requires explicit authorization.

---

### Session 43 — 2026-07-13 — Radiation Storm

**Shipped:** Radiation Storm joins the mutator pool as a deterministic closing
zone centered on one authored arena anchor. Its opening radius contains the
whole map, closes for 18 seconds to 144px, then holds. Fighters outside take a
10-HP pulse each second, but never fall below 1 HP; spawn protection remains
safe and radiation creates finish opportunities without awarding kills or
touching combat stats, contracts, Vampire, or Iron Hide.

The full center/radius/countdown state rides in every snapshot for reconnects.
Overtime retires the storm before fresh spawns, and random scheduling prevents
the redundant Low Health pairing. Rusty retreats toward safety only while
outside, continuing to aim and fight, then yields back to objectives, supplies,
and ordinary combat. The client adds a pulsing lime boundary, outside-only wash
and warning, plus a rounded shrink clock in the stacked mutator label.

**Verification:** 1,044 unit tests pass across 67 files, including 232 Match
tests, 15 bot tests, 13 network-manager tests, 4 pure storm-geometry tests, and
3 pure renderer-projection tests. TypeScript, ESLint, and the production build
are clean; Vite retains its existing chunk-size advisory. The standard
Playwright matrix passes 13 tests with 11 intentional scoped skips across
desktop Chromium, desktop Firefox, and mobile landscape. A separate forced
12-second Practice smoke also passes, verifying the live authoritative state
and a drawn Phaser boundary.

**Tuning watch:** the 18-second close, 144px final radius, and nonlethal 10-HP
one-second pulse are deliberately readable first defaults. Watch whether the
zone creates daring rotations rather than a single dominant hold, whether the
final area is spacious enough around every authored anchor, and whether the
green wash warns without obscuring close-range combat.

### Session 42 — 2026-07-13 — Wasteland Bat

**Shipped:** every arena now holds one silent-respawning Wasteland Bat: a
scarce special weapon with four committed swings, 80 damage, a 72px reach, and
a broad deterministic arc. Misses spend durability, walls stop the sweep, one
swing can catch multiple fighters, and the final use immediately restores the
rifle. Infinite Ammo, lag compensation, Big Heads, Iron Hide, Vampire, and
Power Weapon Drops all compose through the authoritative melee path.

The bat joins Scavenger Cache and Scavenger Rush rare loot, respects each
mode-owned economy, and gives Rusty a close-range pursuit style without reload
loops. Every fighter receives a handle-pivoted held sprite and heavy sweep,
including gunless silhouettes; the HUD shows remaining swings, the long-range
aim line hides, and bat kills build lifetime weapon stats plus the unique
`Slugger` award.

**Verification:** 1,030 unit tests pass across 65 files, including 229 Match
tests, 36 PickupManager tests, 27 award tests, 14 bot tests, and 3 pure bat-
presentation tests. TypeScript, ESLint, and the production build are clean;
Vite retains its existing chunk-size advisory. The full Playwright matrix
passes 13 tests with 11 intentional scoped skips across desktop Chromium,
desktop Firefox, and mobile landscape; its solo-practice smoke verifies the
loaded pickup/icon assets and a live player renderer bound to the bat sprite.

**Tuning watch:** 80 damage, four swings, 72px reach, and a 0.7-second cadence
are intentionally forceful first defaults. Watch whether the authored routes
create contests instead of free wins, whether Rusty commits believably, and
whether the one-in-nine cache/Rush chance stays exciting without making the
bat routine or oppressive.

### Session 41 — 2026-07-13 — Scavenger Rush

**Shipped:** Scavenger Rush joins the mutator pool as a rotating contest over
short-lived supplies. Activation launches one weighted Scavenger Cache reward
at an authored arena anchor, then moves the opportunity every 12 seconds. Each
drop lives for 8 seconds, giving players a clear four-second reset between
contests and ensuring that only one Rush supply exists at a time.

The server owns placement, reward substitutions, expiry, overtime cleanup, and
reconnect snapshots. The client gives the opportunity a cyan accelerating
pulse, halo, and `SUPPLY` label. Rusty can detour for the loot without
forgetting its combat target, while Kill Confirmed tags, a loose Core Run core,
and the KOTH hill keep movement priority. Gun Game and One in the Chamber omit
the mutator from random schedules because their tightly owned economies would
reduce its reward value.

**Verification:** 1,015 unit tests pass across 64 files (318 suites), including
223 Match tests, 33 PickupManager tests, 13 BotController tests, and 3 pure
pickup-presentation tests. TypeScript, ESLint, and the production build are
clean; Vite retains its existing chunk-size advisory. The full Playwright
matrix passes 13 tests with 11 intentional scoped skips across desktop
Chromium, desktop Firefox, and mobile landscape. A separate forced-event
two-client Chromium smoke also passes and verifies the live authoritative
supply plus its rendered cyan halo and `SUPPLY` label.

**Tuning watch:** the 8-second lifetime and 12-second cadence are deliberately
readable first defaults. Watch whether the four-second downtime preserves
route variety, whether rare weapon rolls feel exciting without snowballing,
and whether Rusty's detours create lively fights without looking distracted.

### Session 40 — 2026-07-13 — Clutch Kills

**Shipped:** a living fighter who closes an opponent kill at or below 25% max
health now earns a `CLUTCH!` medal with their exact pre-heal HP. The authority
captures the moment before the normal kill heal can hide it, while suicides
and From the Grave kills remain separate stories.

The reliable kill event carries the optional health value, and the client
turns it into rounded-up `N HP LEFT` copy, a zoom pulse, and a distinct pitched
confirmation. Shutdowns and rapid multikills retain priority; Clutch now sits
above First Blood, Payback, and ordinary streak copy without changing balance.

**Verification:** 1,005 unit tests pass across 63 files (313 suites),
including 220 Match tests and 11 combat-callout tests covering the threshold,
pre-heal capture, exclusions, exact copy, priority, and compatibility.
TypeScript, ESLint, and the production build are clean; Vite retains its
existing chunk-size advisory. The full Playwright matrix passes 13 tests with
11 intentional scoped skips across desktop Chromium, desktop Firefox, and
mobile landscape.

**Tuning watch:** 25% is a readable first default across different character
health pools. Watch whether it fires often enough to feel exciting but rarely
enough to stay special, especially under Low Health and Vampire combinations.

### Session 39 — 2026-07-13 — Power Weapon Drops

**Shipped:** every ammo-bearing shotgun or pistol now spills at its carrier's
death position as a 14-second one-shot pickup. The drop transfers exactly the
ammo that survived the death rather than refreshing to full, creating a clean
recover-or-steal decision without turning deaths into an ammo source. Dry guns
leave nothing, and uncredited self-grenade deaths in larger matches follow the
same rule.

The authoritative expiry rides with each drop and drives a gold pulse that
speeds up as it disappears. Overtime and mode pickup vetoes suppress the
system, while Fists Only, Weapon Roulette, and Grenades Only retire live power
weapons when their shared loadout takes control. Existing cache loot remains
non-expiring and keeps its original full-ammo reward contract.

**Verification:** 1,001 unit tests pass across 63 files (313 suites), including
218 Match tests and 31 PickupManager tests covering the death, collection,
expiry, ammo-preservation, compatibility, and N-player paths. TypeScript,
ESLint, and the production build are clean; Vite reports only its existing
chunk-size advisory. The full Playwright matrix passes 13 tests with 11
intentional scoped skips across desktop Chromium, desktop Firefox, and mobile
landscape.

**Tuning watch:** 14 seconds deliberately outlives the three-second respawn,
so a defeated fighter can attempt a recovery while opponents have time to
steal or trap the drop. Watch whether that window creates satisfying contests
without making successful power-weapon kills feel too easy to undo, and
whether remaining-ammo drops stay enticing late in a magazine.

### Session 38 — 2026-07-13 — Bounty Hunt

**Shipped:** Bounty Hunt joins the draft and rotation as the eighth game mode.
One living fighter is always marked during regulation: an ordinary kill scores
1, fighting back as the mark scores 2, and taking down the bounty scores 3 and
transfers the mark. First to 25 wins. The opening target is derived from the
match id rather than a player slot, and N-player fallback rotation handles dead,
self-killed, missing, and posthumous target transitions deterministically.

Every authoritative snapshot carries the target. The client renders a pulsing
gold world label, names the target and point value in the HUD, fires transfer
callouts with audio/zoom feedback, and keeps the mark lit during Blackout. Rusty
prioritizes a rival bounty instead of blindly choosing the nearest fighter.
Tied regulation retires both scoring and the target for normal first-kill
overtime.

**Verification:** 993 unit tests pass across 63 files (311 suites), including
214 Match, 46 matchmaking, 12 bot, 12 client-network, six isolated mode, and
three HUD-copy tests. TypeScript, ESLint, and the production build are clean;
Vite reports only its existing chunk-size advisory. The real desktop Chromium
flow drafts Bounty Hunt, enters live play, and observes its authoritative
target, visible gold marker, and HUD. The full Playwright matrix passes 13 tests
with 11 intentional scoped skips across desktop Chromium, desktop Firefox, and
mobile landscape.

**Tuning watch:** the 1/2/3 payout and 25-point target are deliberate first
defaults, not group-tested verdicts. Watch whether marked fighters feel
empowered enough to fight without snowballing, whether bounty transfers happen
often enough in larger free-for-alls, and whether 25 produces the right round
length alongside explosive mutators.

### Session 37 — 2026-07-13 — Last Laugh

**Shipped:** Last Laugh joins the shared mutator pool. Every regulation death
now plants a stationary, victim-owned grenade at the corpse for 1.4 seconds,
turning reckless pursuit into a risk and allowing genuine posthumous reversals.
The bomb enters the same authoritative blast pipeline as every other grenade,
so cover, Iron Hide, Vampire, destructible scenery, barrels, attribution,
medals, and multi-death chains stay consistent. It costs no inventory and does
not masquerade as a player-thrown grenade.

The client gives these bombs an accelerating red pulse and treats them as
Blackout light beacons. Sudden-death overtime suppresses new bombs and clears
existing grenades. Random Gun Game and One in the Chamber schedules omit Last
Laugh to protect their weapon economies, while explicit FORCE pins keep the
existing developer smoke-test escape hatch.

**Verification:** 977 unit tests pass across 61 files (305 suites), including
211 Match tests and 42 CombatManager tests covering the corpse bomb, unchanged
inventory, posthumous kill credit, chained spawns, overtime, and an uncredited
three-player self-grenade death. TypeScript, ESLint, and the production build
are clean; Vite reports only its existing chunk-size advisory. The full
Playwright matrix passes 13 tests with 11 intentional scoped skips across
desktop Chromium, desktop Firefox, and mobile landscape.

**Tuning watch:** the 1.4-second fuse is deliberately shorter than the
three-second respawn delay, but it is not yet group-tested. Watch whether it
creates readable last-second scrambles without making close-range kills feel
automatically punished, especially near chain barrels and narrow objectives.

### Session 36 — 2026-07-13 — Wasteland Warp

**Shipped:** Wasteland Warp joins the shared mutator pool as a recurring,
readable position reversal. Eight seconds after activation, then every 12
seconds, all living fighters rotate through one another's current positions.
Stable player-id ordering makes the result deterministic and N-player safe;
using real occupied destinations avoids walls and invalid terrain, while zeroed
arrival velocity gives everyone the same clean reaction beat. Dead fighters
are excluded, and a lone survivor advances the timer without a fake warp.

Every active snapshot carries the authoritative countdown and a sequence that
increments only on a real rotation. The HUD folds a rounded timer into the
stacked mutator label, while later sequence edges trigger a violet flash,
reassessment callout, zoom pulse, and low sting. The first observed snapshot
stays quiet, so reconnecting cannot replay an old warp. Combat, projectiles,
pickups, Rusty, and every regulation mode continue from the new positions;
sudden-death overtime retires further swaps.

**Verification:** 973 unit tests pass across 61 files (304 suites), including
208 Match tests plus dedicated movement-label, network reset/mirroring, and
matchmaking snapshot coverage. TypeScript, ESLint, and the production build are
clean; Vite reports only its existing chunk-size advisory. A forced live
two-player Chromium smoke shortens regulation, observes the activation
countdown, waits through the first real rotation, and confirms both authority
and presentation at sequence 1. The normal full Playwright matrix passes 13
tests with 11 intentional scoped skips across desktop Chromium, desktop
Firefox, and mobile landscape.

**Tuning watch:** the 8-second opening warning and 12-second repeat interval
are strong readable defaults rather than group-tested verdicts. Watch whether
warps happen often enough to create stories without erasing earned positioning,
whether Core Run carrier swaps are delightfully tense or too disorienting, and
whether the violet full-screen beat should become a tighter world-space effect.
No fighter, weapon, ability, mode, objective, or existing-mutator balance value
changed.

**Deployment:** not run; production deployment remains an explicit separate
operation under `CLAUDE.md`.

### Session 35 — 2026-07-13 — Core Run

**Shipped:** Core Run joins the draft and rotation as the seventh game mode.
A neutral glowing core starts at the geometric centre of every arena; carrying
it earns one point per full second, and the first fighter to 45 wins. The
carrier becomes a moving objective without losing access to ordinary combat,
abilities, grenades, mutators, or sustain pickups. Death drops the core at the
elimination point, while a 12-second return prevents abandoned drops from
stalling the round. Deterministic distance/player-id collection keeps contested
claims fair and N-player safe.

The persistent authoritative objective snapshot drives a gold/green/red world
marker, possession HUD, secure/stolen/dropped callouts, reconnect-safe state,
and a Blackout beacon. Rusty pursues the loose core through its normal pathing
and input pipeline, including while the opponent is respawning. Pistol and
shotgun pickups are retired in this mode so the centre objective does not also
grant a power weapon; existing cache filtering composes with that rule. The
mode-specific Core Runner contract rewards 15 scored seconds of possession.

**Verification:** 967 unit tests pass across 60 files (301 suites), including
206 Match tests plus dedicated Core Run authority, bot, networking, HUD, draft,
and matchmaking coverage. TypeScript, ESLint, and the production build are
clean; Vite reports only its existing chunk-size advisory. A focused real
two-player Chromium flow drafts Core Run, enters the live scene, receives the
objective snapshot, and renders its marker. The full Playwright matrix passes
13 tests with 11 intentional scoped skips across desktop Chromium, desktop
Firefox, and mobile landscape.

**Tuning watch:** 45 carry seconds, the 30px claim radius, and 12-second return
are strong first-play defaults rather than group-tested balance verdicts.
Watch whether carriers can kite too safely on open routes, whether a death
creates enough time for a satisfying steal, and whether disabling map power
weapons focuses the chase or removes too much variance. No fighter, weapon,
ability, mutator, or existing-mode balance values changed.

**Deployment:** not run; production deployment remains an explicit separate
operation under `CLAUDE.md`.

### Session 34 — 2026-07-13 — Scavenger Caches

**Shipped:** every arena now hides two red scavenger caches in a fair
180-degree rotational pair. Shooting one permanently clears its low-cover
cell and reveals the match's shared hidden reward, creating a small tactical
choice between conserving ammunition, opening a route, racing for loot, or
using the exposed pickup as bait. Rifle, pistol, shotgun, grenade, and exposed
barrel damage all feed the existing authoritative scenery-destruction path.

Both caches use one deterministic match-id roll from a weighted ammo,
bandage, grenade, pistol, and shotgun table without consuming gameplay RNG.
Mode and active-mutator filters convert incompatible loot to something useful,
including bandage-only caches in Gun Game and One in the Chamber. Rewards use
normal authoritative pickup effects but are explicitly one-shot: collection
gets one inactive snapshot for reliable feedback, then the pickup retires
instead of respawning. The client reuses the attributed red ammo-crate art,
immediately clears prediction collision on the reliable tile event, and adds a
quick crush, fade, and gold reveal burst without another network message.

The final regression pass also fixed a lag-compensation edge case uncovered by
the new tests: multiple rewind snapshots can share one `Date.now()` millisecond,
and timestamp ties now use server tick order so zero-latency shots always see
the freshest snapshot rather than intermittently rewinding to an old spawn.

**Verification:** 950 unit tests pass across 58 files (295 suites), including
202 Match tests and a dedicated rewind timestamp-tie regression. TypeScript,
ESLint, and the production build are clean; Vite still reports only its existing
chunk-size advisory. The full Playwright matrix passes 13 tests with 11
intentional scoped skips across desktop Chromium, desktop Firefox, and mobile
landscape, while a focused Practice smoke confirms both cache sprites load and
render in the live game scene.

**Tuning watch:** the two-cache count, authored locations, shared reward, and
2/2/2/1/1 weighting are strong symmetric defaults rather than group-tested
balance verdicts. Watch whether opening a cache is worth the ammunition and
lost cover, whether the reveal creates contested movement, and whether weapon
drops arrive often enough to feel exciting without overwhelming normal map
control. No fighter, weapon, mode, or mutator values changed.

**Deployment:** not run; production deployment remains an explicit separate
operation under `CLAUDE.md`.

### Session 33 — 2026-07-13 — Rook + Breach Dash

**Shipped:** Rook joins as the sixth selectable fighter and the roster's first
frequent mobility specialist. At 95 HP and 1.10× baseline speed, Rook trades
durability for tempo. Breach Dash covers up to three tiles along aim every
eight seconds, stopping cleanly at current collision—including closed gates
and intact destructible cover—without damage, immunity, or player collision.
A blocked zero-distance cast is refunded, while a useful partial dash commits
the cooldown.

The dash is responsive without weakening authority: one shared swept-AABB
helper feeds server activation, immediate client prediction, and reconciliation
replay. Prediction receives the selected mode's ability contract so One in the
Chamber cannot create a false local jump. The local presentation adds a quick
cyan travel streak, arrival ring, camera tick, cooldown sweep, and activation
callout; remote fighters remain readable through normal buffered interpolation.

Rook's look uses the dormant Helmet art as intended: a separate synchronized
head layer over the existing human body, not a tiny standalone character. The
new registry-level `bodyOverlay` contract loads and animates the tightly cropped
idle/run/punch/death sheets, keeps freeze tint and big-head scale in sync, and
also composes the helmet on Rook's selector card. Six dense cards fit the
existing 960px canvas in one row. Dynamic mastery/backfill paths already derive
from `CHARACTER_IDS`, so older version-1 stats files receive `rook: 0` on load
without a schema-version change.

**Verification:** 938 unit tests pass across 58 files, including shared
dash/registry coverage, immediate prediction, reconciliation, persistence
backfill, and 196 Match tests. TypeScript, ESLint, and the production build are
clean; the full Playwright matrix passes 13 tests with 11 intentional scoped
skips across desktop Chromium, desktop Firefox, and mobile landscape. A
dedicated two-client Rook flow verifies both the authoritative selection and
the live helmet renderer layer.

**Tuning watch:** 95 HP / 1.10× speed / 3 tiles / 8 seconds are deliberately
aggressive starting values. Group play should watch whether the dash is strong
enough to justify the health trade, whether the visual trail gives opponents
enough information, and whether 8 seconds creates too much disengage uptime.
No existing fighter, weapon, mode, mutator, or map values changed.

**Deployment:** not run; production deployment remains an explicit separate
operation under `CLAUDE.md`.

### Session 32 — 2026-07-12 — Shootable Arena Gates

**Shipped:** every arena now contains permanent tactical shortcuts players can
choose to reveal mid-fight. Wasteland and Scrapyard expose dormant cuts through
existing walls; Suburb closes two narrow passages; Overpass adds four gates
that let teams punch side entrances into the central objective bank. Every
placement has a 180-degree partner and bridges walkable space on opposite sides,
so the opportunity is fair and legible rather than random map destruction.

The server initializes closed gates from map decorations and consumes a gate
exactly once when an ordinary bullet or shotgun pellet stops on it. Grenades,
barrel chains, and Bruce's fire breath feed the same match-local collision and
reliable tile-destruction machinery. No new wire message or replicated state was
needed, and Rusty's pathfinding sees newly opened routes immediately. The map
validator rejects oversized, perimeter, non-wall, or hazard-combined gates;
registry coverage locks every arena's pair symmetry and lane value.

The client gives the dormant seven-frame asset a gameplay role: closed gates
start at frame 6, fit within one tile despite the 21×22 source dimensions, then
play backward to frame 0 when the server clears the tile. The wall underneath
is removed while the open posts remain, preserving both a satisfying opening
beat and a readable reminder that the route is now passable.

**Verified:** focused shared validation/map tests, pure client frame/scale tests,
and the 193-test Match suite cover rifle, pistol, shotgun, grenade, fire-breath,
state, and collision behavior. The complete suite passes 925 tests across 57 files;
typecheck, lint, and the production build are clean (the existing Vite chunk-size
warning remains). Playwright passes all 12 applicable Chromium, Firefox, and
mobile-landscape cases with 9 intentional project skips. An attempted in-app
browser smoke was stopped by its localhost navigation policy after an initial
loopback connection miss; no policy bypass was attempted, so presentation is
covered by deterministic client tests plus the repository browser suite rather
than a separate manual canvas capture.

**Carry-over:** gate count, locations, permanent opening, and one-shot cost are
strong authored defaults, not group-tested balance verdicts. Watch whether
players notice the closed gates quickly, whether opening one feels tactically
worth ammunition, and whether Overpass's four options make the center more
interesting without becoming too porous. Move gates only after real play rather
than adding health bars or automatic resets speculatively.

---

### Session 31 — 2026-07-12 — One in the Chamber

**Shipped:** the sixth mode turns every exchange into a tiny risk story. Each
fighter begins with one lethal pistol round; landing it scores and reloads,
while missing immediately leaves only a lethal punch until the fighter earns a
round back. Pistol-triggered barrel kills count as deliberate bank shots. First
to eight wins, and the normal clock/tied-overtime machinery remains intact.

The server owns every rule through existing weapon state: it re-chambers match
start, respawns, kills, and overtime; validates pistol and punch through the
normal lag-compensated rays; applies the mode's lethal damage only after a real
hit; leaves spawn protection untouched; and removes every pickup except
bandages. Grenades, reloads, and character abilities are rejected server-side
and suppressed in desktop/touch input, including hidden touch buttons. Random
rolls exclude both conflicting loadout mutators and redundant no-effect rules,
while Big Heads, Blackout, Super Speed, and Second Wind keep offering useful
variation. Rusty spends and earns the same chamber through ordinary inputs.

The HUD explicitly distinguishes `ROUND LOADS ON FIGHT`, `CHAMBER LOADED`,
`FISTS - EARN A ROUND`, and `ROUND LOADS ON RESPAWN`. Those two pending labels
were added after live QA caught generic countdown/death snapshots otherwise
looking like misses. The same smoke also exposed Low Health as a redundant
random announcement, so it joined Vampire and Turbo Grenades in the mode's
random exclusions rather than consuming a chaos slot without changing play.

**Verified:** deterministic mode tests cover loadout transitions, lethal direct
hits, barrel credit, wrong-source/self-kill rejection, respawn, overtime,
pickup/input gates, score target, result identity, and mutator exclusions.
Integration tests fire the real pistol and punch paths, prove Rusty's ranged-to-
melee adaptation, and exercise rotation/draft succession. Pure client tests
cover secondary-action filtering and every HUD state. All 915 unit/integration
tests pass across 56 files; typecheck, lint, and the production build are clean
(the existing Vite chunk-size warning remains). The full 21-case Playwright run
finished with 11 direct passes, 9 intentional project skips, and one mobile
canvas-setup timeout that passed on retry; an immediate isolated smoke rerun
then passed all six desktop Chromium, Firefox, and mobile-landscape cases with
no retry. In-app browser Practice rendered the mode briefing, pending/loaded/
fists states, useful Big Heads + Blackout stacking, and the final results screen
with no browser warnings or errors.

**Carry-over:** first-to-eight, lethal fists, and one round per kill are strong
party-mode defaults, not group-tested balance verdicts. Watch whether punch
recoveries feel heroic or too easy, and whether ordinary three-minute matches
reach eight often enough; tune only `ONE_IN_THE_CHAMBER.SCORE_TARGET` after a
real group night rather than weakening the one-shot identity speculatively.

---

### Session 30 — 2026-07-12 — Weapon Roulette

**Shipped:** ordinary matches can now become a synchronized four-style gauntlet.
Every ten seconds both sides receive the same shotgun, pistol, fists, or rifle,
forcing range, route, and aggression decisions to change repeatedly without
touching any weapon's baseline damage, cooldown, spread, or reach. Special steps
carry one equal reserve magazine; spending it early leaves a readable dry window
instead of silently manufacturing a rifle or free refill.

The server owns the step index and timer, reasserts the current loadout after
respawns and compatible mode hooks, and retires gun-ammo plus special-weapon
pickups once Roulette owns the economy. The shared conflict rule now treats
Roulette, Fists Only, and Grenades Only as mutually exclusive random loadouts;
Gun Game also vetoes Roulette so its earned ladder stays authoritative. Clients
turn snapshot weapon edges into concise cyan weapon callouts with a sting and
zoom pulse, requiring no extra network event or client-side timer guess.

**Verified:** focused tests cover the frozen complete weapon order, equal initial
restocking, every timed transition, dry-weapon persistence, respawn enforcement,
dynamic pickup retirement, all symmetric loadout conflicts, Gun Game exclusion,
and every presentation state. A live two-player Deathmatch with forced Super
Speed + Weapon Roulette rendered the combined active label, a stocked shotgun,
and the next stocked pistol on the fully rendered active client.
The inactive browser tab's WebGL screenshot was incomplete, so it is not counted
as visual synchronization evidence; authoritative multi-player tests cover equal
server state. All 895 unit tests pass, typecheck and lint are clean, and the
production build succeeds. An initial Playwright run collided with stale local
dev watchers on the matchmaking port; after retiring those repository processes
and disabling server reuse, all 21 cases completed with 12 passes, 9 intentional
skips, and zero failures across Chromium, Firefox, and mobile landscape.

**Carry-over:** ten seconds and one reserve magazine are first-pass fun pacing,
not a balance verdict. Watch whether shotgun windows feel deliciously scarce or
too short, and whether the callout cadence energizes rather than interrupts; do
not retune the underlying weapons without group-play evidence.

---

### Session 29 — 2026-07-12 — Fists Only

**Shipped:** Fists Only can now take over the middle or finale of a match,
instantly stripping every fighter down to the existing lag-compensated punch
and turning open gunfights into a close-range scramble. Grenades and special
ammo disappear, reloads are cancelled, and the server reasserts the brawl
loadout after respawns, pickups, and mode hooks. Signature abilities remain
available, preserving character choice inside the shared chaos rule.

The random scheduler treats Fists Only and Grenades Only as an impossible pair
in either order, including when a forced final event constrains a random middle
slot. Gun Game vetoes the mutator's random selection so its weapon ladder stays
coherent. Rusty now derives melee pursuit spacing from punch range and closes
far enough to swing through the same authoritative input and damage paths as a
human player.

**Verified:** focused shared and server tests prove activation, punch damage,
grenade lockout, loadout reassertion, random conflict handling, Gun Game
exclusion, and Rusty's ability to close and land a punch. A live two-client
forced match showed synchronized `SUPER SPEED + FISTS ONLY`, `FISTS`, zero
grenades, and no gun overlays, with no warnings or errors in either browser
console. All 887 unit tests pass, typecheck and lint are clean, the production
build succeeds, and Playwright completes all 21 cases with 12 passes, 9
intentional skips, and zero failures across Chromium, Firefox, and mobile
landscape.

**Carry-over:** abilities intentionally remain live, so one-hit low-health
rounds and character-specific attacks can make especially volatile brawls.
Watch whether the chaos feels like a highlight or needs a lower random weight;
do not tune punch damage or range without the next group playtest's evidence.

---

### Session 28 — 2026-07-12 — Fighter Mastery

**Shipped:** each selectable fighter owns a persistent mastery journey (six as
of Session 33).
The character-select roster shows Untested, Blooded, Proven, Veteran, or Master
plus exact progress toward the next tier, turning every choice into a visible
long-term goal and making underplayed fighters inviting rather than anonymous.

The server records one mastery win only for the authoritative fighter used by a
real-match winner. It folds that value into the existing asynchronous lifetime
store, fills missing roster keys when old files load, and privately sends the
local totals with every `matchFound`. A direct rematch therefore exposes the
fresh win before either player locks again. No client claim, draw, loss, or
Practice result can manufacture progress.

**Verified:** shared tests cover the frozen ladder, every exact boundary, invalid
totals, and full-roster initialization; persistence tests prove winner-only
credit and old-file backfill; matchmaking integration proves zeroed first-match
delivery and refreshed rematch delivery; pure client tests cover all compact copy
states. A live seeded two-client character select rendered all five tiers at once
(`0/1`, `1/3`, `3/7`, `9/15`, and open-ended 18 wins) with clean card geometry
and zero browser warnings/errors. The fixed 960×720 scene geometry is uniformly
scaled on smaller displays, and the mobile-landscape canvas/control regression
passes in the standard browser matrix. All 881 unit tests pass, typecheck and lint
are clean, the production build succeeds, and Playwright completes all 21 cases
with 12 passes, 9 intentional skips, and zero failures across Chromium, Firefox,
and mobile landscape.

**Carry-over:** the tier names and 1/3/7/15 pacing are first-pass motivation
tuning. Watch whether friends naturally rotate fighters or tunnel harder into one
main; either behavior is valid, but the cards should make both choices feel owned.

---

### Session 27 — 2026-07-12 — Hot Streaks

**Shipped:** real-match wins now carry momentum beyond the current rivalry set.
Each nickname keeps a restart-safe active run and personal best; the next results
screen tells both sides whether a run grew, set a new record, survived a draw, or
ended on the loss. A single win still reads clearly without pretending it is a
multi-win streak.

The server captures streak state immediately before and after the same synchronous
in-memory lifetime update that already records wins and losses. That makes the
wire story authoritative for normal wins, overtime, N-player results, and
forfeits while keeping file I/O queued in the background. Old stats backfill
cleanly, old clients ignore the optional field, and Practice remains invisible to
the career system.

**Verified:** persistence tests cover consecutive wins, draw holds, loss resets,
restart durability, and version-1 backfill; matchmaking tests prove both players'
snapshots and Practice omission; pure client tests cover the full copy/tone state
machine. A live seeded two-client deathmatch advanced STREAKA from 2 to a new best
of 3 and ended STREAKB's active 4 while retaining its best of 6. Both stories fit
inside the results panel at 1280×720 and 844×390 beside the existing rivalry,
contract, rank, controls, and stat rows with zero browser warnings/errors. All
873 unit tests pass, typecheck and lint are clean, the production build succeeds,
and Playwright completes all 21 cases with 12 passes, 9 intentional skips, and
zero failures across Chromium, Firefox, and mobile landscape.

**Carry-over:** draws currently preserve a streak and one win is displayed as
the start of a run. Both are deliberate first-pass social rules; change them only
if group play makes either interpretation feel dishonest or confusing.

---

### Session 26 — 2026-07-12 — Wasteland Reputation

**Shipped:** contract clears now build a visible Wasteland career. Every player
starts as a Drifter, then climbs through Scavenger, Road Dog, Marauder, and
Wasteland Veteran toward Legend of the Waste. The lobby's all-time board carries
a compact rank badge, and each eligible results screen reports the next milestone
or celebrates a promotion earned in that round.

The ladder is a pure projection of the existing `contractsCompleted` field. It
adds no persistent state, migration, RNG draw, gameplay power, or matchmaking
input. Practice stays consequence-free, old payloads degrade safely, and max-rank
players keep accumulating visible clears instead of being pointed at a nonexistent
next tier.

**Verified:** focused shared and presentation tests cover all six thresholds,
invalid totals, exact-boundary promotion detection, false-promotion prevention,
max rank, Practice/partial results, and compact leaderboard formatting. A live
two-client Wasteland deathmatch showed the seeded Scavenger badge in the lobby and
the `3/8 TO ROAD DOG` results progress at both 1280×720 and 844×390 without layout
collisions or browser warnings/errors. Typecheck and the focused 52-test bundle
are clean; all 867 unit tests pass, lint and the production build succeed, and
Playwright completes all 21 cases with 12 passes, 9 intentional skips, and zero
failures across Chromium, Firefox, and mobile landscape.

**Carry-over:** thresholds and titles are deliberately cosmetic first-pass
tuning. Evaluate whether promotions arrive at satisfying intervals only after
real contract completion cadence exists; do not attach combat power to rank.

---

### Session 25 — 2026-07-12 — Combat Medals

**Shipped:** every authoritative kill now carries the combat story around it.
The opening non-suicide earns First Blood; kills chained inside six simulated
seconds escalate through Double Kill, Triple Kill, and open-ended Mayhem; and a
grenade or other delayed attack that finishes the job after its owner dies earns
From the Grave. The local winner sees a punchy dedicated-lane callout, zoom beat,
and pitch-shaped kill cue while everyone else keeps the normal feed and audio.

The implementation is match-scoped and N-player safe. It does not read wall
clock time, does not consume RNG, and does not add a new reliable message—the
existing `server:playerKilled` path carries optional context that older clients
can ignore. Shutdown remains the highest-priority story, followed by posthumous
and rapid medals, so simultaneous qualifications never flicker through several
labels or erase mutator/overtime messaging.

**Verified:** focused authority tests cover suicide exclusion, once-only First
Blood, the inclusive six-second edge, reset just beyond the window, and a killer
already dead. Pure client tests cover Double/Triple/unbounded Mayhem copy,
posthumous sound/pulse presentation, remote/suicide silence, and the complete
priority ladder. A live two-client run completed lobby, draft, character lock,
and active KOTH at desktop and 844×390 mobile landscape with zero browser
warnings/errors; the forced short match rolled Grenades Only before the static
test fighters connected a medal kill, so medal animation/audio truth remains
the focused deterministic presentation suite rather than a claimed live sighting.
Typecheck and lint are clean; all 858 unit tests pass; the production build
succeeds; and Playwright completes all 21 cases with 12 passes, 9 intentional
skips, and zero failures across Chromium, Firefox, and mobile landscape.

**Carry-over:** six seconds and the current presentation priority are first-pass
feel tuning. Watch whether real 1v1 respawn cadence makes Double Kill satisfyingly
rare or practically impossible; change the window only after group-night evidence.

---

### Session 24 — 2026-07-12 — Wasteland Contracts

**Shipped:** every round now offers one optional Wasteland Contract. Players
can chase accuracy, damage, a streak, movement, both explosive barrels, hill
time, or enemy tag confirms while still pursuing the real mode objective.
Progress is visible live, completion lands in its own celebratory HUD lane,
and the results screen banks a career completion that remains visible as `C`
on the all-time lobby board. Neither player is penalized for ignoring it.

Contract selection is stable for the round without consuming the injected
gameplay RNG, filters mode-only goals, and carries the previous id through
Practice, FORCE, and revenge-draft rematches so the next round must change the
side bet. The explicit smoke pin still wins. Server snapshots own progress;
old clients safely ignore it, and new clients treat missing partial state as
no card. Practice exercises the full loop but intentionally never touches the
friend-group career store.

**Verified:** focused tests cover all seven progress sources, target clamping,
per-player independence, deterministic/mode-aware selection, forced pins,
no-repeat rematches through the draft, snapshot transport/reset, match-end
career enrichment, one-per-match persistence, old-file zero backfill, and
leaderboard formatting. Live desktop and 844×390 mobile-landscape Practice
confirmed the Hot Shot card stays readable over the perimeter, does not cover
playable terrain or HUD controls, and produces no browser warnings/errors.
Typecheck and lint are clean; all 849 unit tests pass; the production build
succeeds; and Playwright completes all 21 cases with 12 passes, 9 intentional
skips, and zero failures across Chromium, Firefox, and mobile landscape.

**Carry-over:** contract targets and the seven-goal pool are first-pass
engagement tuning, not balance tuning. Watch completion rates at group night:
goals should pull tactics without distracting players from the actual mode.
Do not add gameplay rewards or raise/lower targets without that evidence.

---

### Session 23 — 2026-07-12 — Chain-Reaction Barrels

**Shipped:** every arena now contains two bright red explosive barrels. A
well-placed rifle or pistol round, any shotgun pellet, a grenade, or another
barrel can set one off. The blast uses the game's established grenade damage
and visibility rules, tears open the barrel's cover cell, can cascade through
other exposed hazards, and awards any resulting elimination to the player who
started the reaction under the distinct `barrel` attribution.

The implementation stays authoritative end to end. Hitscan reports the exact
solid cell it struck; Match consumes each hazard before resolving recursion;
clients receive reliable tile removal plus a transient environmental-blast cue
that deliberately reuses the mature grenade effects path. The map validator
enforces the one-cell low-cover contract, persistent stats back-fill the new
weapon key for old files, and constructing a rematch restores every barrel.

**Verified:** focused tests cover solid-cell hit reporting, direct rifle
detonation, barrel kill attribution, grenade-driven two-barrel recursion,
ordinary-wall shielding, transient cue forwarding, one-tick cleanup, fresh
match restoration, persistence compatibility, and the two-per-map contract.
A live Collapsed Overpass practice match confirmed both curated barrel sprites
render clearly among the existing wrecks and containers. Typecheck and lint are
clean; all 837 unit tests pass; the production build succeeds; and Playwright
completes all 21 cases with 12 passes, 9 intentional skips, and zero failures
across Chromium, Firefox, and mobile landscape.

**Carry-over:** barrel blasts intentionally reuse grenade tuning, and two per
map is an authored starting point rather than a balance verdict. Watch whether
Grenades Only or Turbo Grenades makes chains too easy during the next real
group session; do not alter counts, radius, or damage without playtest evidence.

---

### Session 22 — 2026-07-12 — Blastable Cover

**Shipped:** grenades now permanently reshape the current round. An exposed
`COVER_LOW` tile inside the configured blast radius breaks independently;
wrecks and containers break as atomic multi-cell props. Their authoritative
collision disappears with the art, opening new movement routes, bullet lanes,
bot sightlines, and future grenade paths. Ordinary and perimeter walls remain
immune, and every new match rebuilds the pristine map from registry data.

Explosion damage intentionally resolves first against the intact collision
grid. Cover can therefore save a fighter from the same blast that destroys it,
without the client guessing or retroactively changing damage. The existing
reliable `server:tilesDestroyed` event now carries both fire-breath walls and
grenade-broken cover, while the raycaster exposes the exact first solid tile so
walls and nearer props shield anything behind them.

**Verified:** focused visibility tests cover exposed low cover, ordinary-wall
shielding, nearer-cover shielding, atomic decoration-backed interior walls,
unrelated props, and perimeter immunity. Match integration covers manual and
safety-fuse detonation, pre-destruction LOS protection, transient broadcasts,
immutable map JSON, and live collision clearing. A two-client Collapsed
Overpass pass exercised grenade/rematch behavior; a removed dev-only visual pin
confirmed that the real two-cell gray wreck and both backing wall sprites
disappear together, revealing the floor, and a new round restores the prop.
There were no browser warnings/errors after reconnect. Typecheck and lint are
clean; all 830 unit tests pass; the production build succeeds; and Playwright
completes all 21 cases with 12 passes, 9 intentional skips, and zero unexpected
or flaky cases across Chromium, Firefox, and mobile landscape.

**Deviation:** shipped decoration props are backed by interior `WALL` cells,
not `COVER_LOW` as the old map-type comment implied. The implementation treats
only decoration-backed interior walls as blastable and explicitly preserves
the arena perimeter; no map JSON or combat constants changed.

**Carry-over:** the destruction radius is the existing grenade damage radius,
not a new tuning value. Group play should reveal whether three starting
grenades open arenas too quickly, especially under Grenades Only/Turbo
Grenades; do not adjust that economy without a real playtest verdict.

---

### Session 21 — 2026-07-12 — Authoritative Hit Confirmation

**Shipped:** every rifle, pistol, and applied shotgun-pellet trail can now carry
the server-authoritative victim and post-mitigation damage that actually
landed. Confirmed shots play one of two curated three-frame impact splashes at
bullet arrival, while misses keep the existing sparks, dust, and wall decals.
The local shooter also hears a short original hit-confirm tick; shotgun pellets
share one tick per blast without hiding their individual impact splashes.

The confirmation is deliberately downstream of `applyDamage()`, so Iron Hide,
lethal pellet ordering, discarded pellets, and every existing combat rule stay
truthful. Old or incomplete payloads safely use ordinary impact feedback, and
the client never predicts damage from geometry alone.

**Verified:** a live Warlord Practice match produced real confirmed kills and
ordinary wall impacts with no browser warnings or errors. The desktop canvas,
mobile-landscape canvas, and touch path all pass the Playwright matrix. Focused
coverage checks rifle, pistol, shotgun, lethal-pellet, mitigation, network
forwarding, compatibility, and sound-grouping behavior. Typecheck and lint are
clean; all 822 unit tests pass; the production build succeeds; and Playwright
completes all 21 cases with 12 passes, 9 intentional skips, and zero unexpected
or flaky cases.

**Carry-over:** the hit tick is intentionally local-only and understated. A
group playtest should decide whether its mix needs adjustment; no weapon or
character balance values changed in this session.

---

### Session 20 — 2026-07-11 — Character Death Animations

**Shipped:** eliminations now use the asset pack's real character-specific
death sheets instead of instantly hiding the defeated renderer. Mighty Man and
Frost Wizard share the no-hands human fall, Bruce uses Zombie Small, Bubba uses
Zombie Big, and Jack has distinct with-axe and no-axe falls. Each animation
plays once and leaves a readable corpse until the server revives that player.

The renderer now owns a small authoritative life-state edge machine. Living
overlays and labels disappear during death, normal snapshot updates cannot
clobber the corpse pose, and respawn restores the latest body/weapon state.
This also makes the previously unused `playDeathAnimation` path real rather
than letting `ClientPlayerManager` hide every dead snapshot immediately.

**Verified:** the character registry and horizontal aim projection have focused
coverage. A forced 45-second Last Stand match against Warlord showed Bruce's
fall, the corpse held through `RESPAWN IN 3/2/1`, and a clean return at the
authoritative spawn; a mobile 844×390 pass kept the arena and HUD readable.
All curated sheets loaded with zero browser warnings after correcting Jack's
no-axe crop to its measured 22×18 frame. Typecheck and lint are clean; all 818
unit tests pass; the production build succeeds; and Playwright completes all 21
cases with 12 passes, 9 intentional skips, and zero unexpected or flaky cases.

**Carry-over:** this pass intentionally uses each character's first death
variant. The pack includes alternate human/zombie falls that can become
cosmetic randomization later, but deterministic first-death presentation is
the stronger baseline.

---

### Session 19 — 2026-07-11 — Mode Briefings

**Shipped:** every match now teaches its objective during the familiar 3/2/1
beat. The selected mode name appears in gold with a short win-condition line
directly beneath it, then both fade with `FIGHT`. The shared mode registry owns
the copy, keeping Deathmatch, KOTH, Gun Game, Last Stand, and Kill Confirmed
consistent without a second client-only rules table.

The presentation reuses the authoritative countdown stream and its snapshot
repair path. It adds no protocol surface, match delay, or blocking tutorial,
and it is recreated cleanly for rematches and scene restarts.

**Verified:** focused shared-config and client logic coverage is green. A forced
Kill Confirmed Practice match displayed `KILL CONFIRMED` and `CONFIRM ENEMY
TAGS · DENY YOUR OWN` during countdown on both the default desktop viewport and
an 844×390 mobile-landscape viewport; both layouts remained clear and the
browser console had no warnings or errors. The complete automated gate is
green: typecheck and lint pass; all 816 unit tests pass; the production build
succeeds; and the 21-case Playwright matrix reports 12 passes, 9 intentional
skips, 0 unexpected results, and 0 flaky results.

**Carry-over:** objective copy is deliberately terse. Group play should reveal
whether any line needs plainer wording, but the presentation timing and layout
should remain stable unless players consistently miss the countdown.

---

### Session 18 — 2026-07-11 — Kill Confirmed

**Shipped:** Kill Confirmed joins the draft and fallback rotation as the fifth
mode. A death now starts a second contest: the killer can push into danger to
bank the gold tag, while the victim can return and recover the green tag to
erase the opportunity. First to eight confirmations wins, and abandoned tags
expire after 20 seconds so the arena never accumulates stale objectives.

The mode owns tag state behind narrow objective hooks while continuing to use
the normal score, result, respawn, combat, map, mutator, and rivalry paths.
Snapshots carry the durable tag list; transient authoritative collection
events produce explicit CONFIRMED/DENIED callouts and audio without asking the
client to reverse-engineer score changes. Rusty chooses the nearest tag as a
movement goal and can finish a confirmation while its opponent is respawning.

**Verified:** focused mode, match, N-player, bot, rotation, draft, network, and
presentation coverage is green. A forced Warlord Practice match showed the
correct preview, objective label, Rusty confirmation scoring, ENEMY CONFIRMED
feedback, and no browser-console warnings. Typecheck and lint are clean; all
816 unit tests pass; the production build succeeds; and the 21-case Playwright
matrix passes all 12 applicable desktop/mobile flows with 9 intentional skips.

**Carry-over:** eight confirmations, the 20-second lifetime, and 30px pickup
radius are first-pass pacing choices. Group play should decide whether tags
linger too long or whether the target produces matches shorter than the other
modes; do not tune from solo Warlord performance alone.

---

### Session 17 — 2026-07-11 — Last Stand

**Shipped:** Last Stand joins the draft and fallback rotation as the fourth
mode. Each fighter starts with five lives, and every death spends one until
only one contender remains. Positive-life fighters keep the familiar combat
and respawn rhythm; zero-life fighters stay eliminated, including in N-player
matches where the surviving contenders continue fighting.

The implementation keeps remaining lives in the existing score field and adds
one narrow `GameMode.canRespawn` lifecycle hook. That preserves the established
snapshot, results, bot, mutator, map, and rivalry paths instead of creating a
parallel rules engine. Regulation ties still flow into sudden death, but a
fighter already eliminated from stock cannot re-enter the duel.

The HUD now labels the score as lives and shows a permanent `ELIMINATED` state
at zero. A forced Practice smoke verified the character-select preview, the
Collapsed Overpass load, a 5–5 opening score, the lives label, and a clean
browser console.

**Verified:** focused shared/server/client coverage passes 266 tests, including
stock accounting, suicides, respawns, double-knockout draws, N-player
elimination, overtime, mode
rotation, rematches, draft projection, and death-overlay labels. Typecheck and
lint are clean; all 801 unit tests pass; the production build succeeds; and the
21-case Playwright matrix passes all 12 applicable desktop/mobile flows with 9
intentional project skips. A live forced Practice match also verified the
fourth mode's preview and opening HUD with no browser-console warnings.

**Carry-over:** five lives is a deliberately legible starting point, not a
balance verdict. Group play should determine whether match length calls for
four or six; do not tune stock count from solo Rusty behavior alone.

---

### Session 16 — 2026-07-11 — Fresh-Chaos Rematches

**Shipped:** consecutive rounds now remember the completed match's active
mutators and remove both from the next random draw. A Blackout/Vampire round,
for example, guarantees that the immediate rematch will build its two-event
arc from the other seven choices. This compounds the existing map/mode revenge
draft and character re-pick, making rematches feel structurally fresh as well
as competitively connected.

`PostMatchState` owns the tiny handoff. Human rematches carry it through the
pre-match draft; Practice and FORCE paths pass it directly. `Match` folds the
pair into its normal candidate-exclusion set alongside Gun Game bans and the
other slot's pick. Explicit smoke pins still bypass every random filter.

**Verified:** focused Match and MatchmakingManager coverage passes 196 tests,
including random exclusion, FORCE override, human draft handoff, and direct
Practice handoff. Typecheck and lint are clean; all 787 unit tests pass; the
production build succeeds; and the 21-case Playwright matrix passes all 12
applicable desktop/mobile flows with 9 intentional project skips. The run also
made the draft helper accept an already-reached CharacterSelectScene after
server timeout auto-picks, eliminating a slow-worker false failure.

**Carry-over:** this intentionally prevents only immediate repeats. A deeper
shuffle bag would reduce variety once the pool is nearly exhausted and is not
warranted with nine choices and two activations per match.

---

### Session 15 — 2026-07-11 — Blackout

**Shipped:** Blackout joins the mutator pool as a close-range cat-and-mouse
state. When it activates, the arena drops into deep indigo darkness while the
living local player keeps a small soft pool of visibility. The opponent is no
longer readable across the map, but glowing pickups still provide landmarks
and gunfire or explosions briefly expose the space around them.

The server owns selection, timing, stacking, and reliable activation through
the existing typed mutator pipeline. The actual visibility curve stays in a
small immutable client profile because it changes presentation only—no combat,
physics, movement, input, or wire state branches were introduced.

**Verified:** 167 focused mutator, scheduler, match, and lighting-profile tests
pass. A forced 70-second Deathmatch on Collapsed Overpass confirmed the normal
pre-event grade, `BLACKOUT` HUD state, 140px local light, distant concealment,
pickup beacons, no light while dead, and light restoration after respawn. Full
release gates are green: typecheck and lint clean, all 784 unit tests pass,
production build succeeds, and the 21-case Playwright matrix passes all 12
applicable desktop/mobile flows with 9 intentional project skips.

**Carry-over:** the 0.78 darkness and 140px radius are first-pass atmosphere
tuning. Group play should answer whether opponents get enough warning from
gunfire and whether the radius is comfortable on smaller mobile displays.

---

### Session 14 — 2026-07-11 — Collapsed Overpass

**Shipped:** a fourth full-size arena joins every normal map draft and the
fallback rotation. Collapsed Overpass is built around heavy central bridge
supports: the shotgun and first KOTH hill tempt players into an exposed middle,
while open top and bottom loops provide safer flanks and recovery routes. Four
spawn points, mirrored side grenades, two bandages, pistol/ammo pickups, and
six validated hill locations keep Deathmatch, KOTH, and Gun Game viable.

The arena has its own `overpass` visual theme using existing bleak ground,
garbage cover, brick boundaries, dark roof supports, wrecks, and containers.
That gives the map a distinct silhouette without adding download weight or
special-case collision. Registry tests lock the four-map order and the new
six-hill tactical identity.

**Verified:** map validation and focused registry/theme tests pass. A live
desktop KOTH practice match rendered the complete arena, created Rusty on the
authoritative server, and showed the bot navigating to and scoring on the
central objective. Typecheck and lint are clean; all 781 unit tests pass; the
production build is green; and the full 21-case Playwright matrix passed its
12 applicable desktop/mobile browser flows with 9 intentional project skips.

**Carry-over:** watch whether the center shotgun is worth its exposure and
whether six hills feel varied rather than unpredictable during group play.

---

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
incl. altBody frame-dim integrity and hill\*hog priority slot, KOTH
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
Jack's axe throw flipped BOTH clients' body animation prefix to `jack-noaxe`
for the cooldown window and back to `jack` at expiry, zero uncaught
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
character hitboxes, `big_heads` scale, wall blocking, and the lag-comp
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
- ~~The same mutator can recur immediately across rematches.~~ **DONE in
  Session 16:** both active mutators are excluded from the next direct
  rematch's random rolls; FORCE pins still bypass the memory.
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
