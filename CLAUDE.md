# Mighty Man's Revenge

Post-apocalyptic 2–4 player retro shooter (late 1980s pixel art). Authoritative server with full latency compensation. Built for <10 friends in the NY/NJ area.

## Tech Stack

- **Client:** Phaser.js 3 + Vite + TypeScript
- **Server:** Node.js + TypeScript
- **Networking:** Geckos.io (WebRTC/UDP data channels)
- **Monorepo:** pnpm workspaces — `/client`, `/server`, `/shared`
- **Testing:** Vitest (unit/integration), Playwright (E2E + visual regression)
- **Deployment:** Firebase Hosting (client) + Google Cloud Compute Engine VM us-east1 (server)
- **CI/CD:** GitHub Actions
- **Logging:** Pino (structured JSON)
- **Linting:** ESLint + Prettier

## Project Structure

```
/client          — Phaser.js game client (Vite bundled)
/server          — Authoritative game server (Node.js)
/shared          — Types, constants, physics/math utils shared by client & server
/e2e             — Playwright end-to-end tests
/docs            — Architecture Decision Records, infrastructure docs
```

## Commands

```bash
# Install
pnpm install

# Development (starts client + server concurrently)
pnpm dev

# Build
pnpm build                  # builds all packages
pnpm --filter client build  # client only
pnpm --filter server build  # server only

# Test
pnpm test                   # all unit/integration tests (Vitest)
pnpm test:watch             # watch mode
pnpm test:e2e               # Playwright E2E tests
pnpm test:coverage          # with coverage report

# Lint & Format
pnpm lint                   # ESLint
pnpm format                 # Prettier

# Type Check
pnpm typecheck              # tsc --noEmit across all packages
```

## Deployment

**Client (Firebase Hosting):** The Firebase CLI is installed and authenticated on this machine, and `client/.firebaserc` + `client/firebase.json` are configured for the `mighty-mans-revenge` project. Manual deploy is the fastest path:

```bash
pnpm --filter @game/client build
cd client && firebase deploy --only hosting
# Live at https://mighty-mans-revenge.web.app
```

**Server (GCE VM, us-east1):** Instance `mighty-mans-server` in zone `us-east1-b` (external IP `34.24.140.207`). The full repo is checked out at `/opt/mighty-mans-revenge/` owned by user `rybes`, and the server runs under that user's PM2 (process name `mighty-mans-revenge`). There is no systemd unit, no cron auto-restart, and no rsync — deploys are git-pull on the VM. SSH is via `gcloud compute ssh` as the `deploy` user, which has passwordless `sudo -u rybes`.

Prerequisite: the commit you want live must already be on `origin/main` (the VM does `git pull --ff-only` from there).

The VM lives in GCP project `mighty-mans-revenge` under the
`rbeswick@team.couple.com` account — NOT this machine's gcloud defaults
(active account `rybeswick@gmail.com`, project `mighty-coach`), so both
flags below are required or the SSH fails with a SERVICE_DISABLED error
against the wrong project.

```bash
gcloud compute ssh deploy@mighty-mans-server --zone=us-east1-b \
  --project=mighty-mans-revenge --account=rbeswick@team.couple.com \
  --command="\
  sudo -u rybes bash -c 'set -e; \
    cd /opt/mighty-mans-revenge && \
    git pull --ff-only && \
    pnpm install --frozen-lockfile && \
    pnpm --filter @game/server build && \
    pm2 restart mighty-mans-revenge'"

# Health check (tickRate, connections, activeMatches in JSON):
curl http://34.24.140.207:3001/health
```

**Persistent state on the VM:** lifetime player stats, head-to-head records,
and recent Daily Run scoreboards live in
`/opt/mighty-mans-revenge/server/data/persistent-stats.json`
(path overridable via `DATA_DIR`). The directory is untracked/gitignored, so
the git-pull deploy flow never touches it — do not `git clean` or wipe the
checkout without preserving it. This store also feeds the lobby's all-time
top-5 leaderboard (`server:leaderboard`, sent per-connection on open and
rebroadcast after every match) — wiping it visibly resets the lobby.

**Note on the rsync workflow:** `.github/workflows/deploy-server.yml` rsyncs a `deploy/` artifact to `/opt/mighty-mans-revenge/` as user `deploy@`. That layout doesn't match what's actually on the VM (`server/dist/`, not `dist/`) and the live process is owned by `rybes`, not `deploy`. Don't try to make the rsync flow work — use the git-pull flow above. The CI workflow is non-functional anyway because `GCE_SSH_KEY` and `GCE_SERVER_IP` secrets aren't set.

**CI deploy workflows** (`.github/workflows/deploy-client.yml`, `deploy-server.yml`) trigger on pushes to `client/**`/`server/**`/`shared/**` and also support `workflow_dispatch`. Both are currently **non-functional** because the required repo secrets are not set: `FIREBASE_TOKEN` (service account JSON for hosting), `GCE_SSH_KEY`, and `GCE_SERVER_IP`. Deploys must be done manually using the commands above.

## Architecture

### Authoritative Server Model

The server is the single source of truth. Clients never trust their own state — they predict locally for responsiveness, then reconcile when the server responds. This prevents cheating and ensures consistency.

**Server tick loop (20 ticks/sec):** Each tick: process input queue -> simulate physics -> detect hits -> update state -> broadcast snapshot.

### Latency Compensation (4 techniques — all required)

1. **Client-Side Prediction** — Client applies inputs immediately using shared physics code, doesn't wait for server.
2. **Server Reconciliation** — When server state arrives, client replays unacknowledged inputs on top of server's authoritative position. Smooth correction if small difference, snap if large.
3. **Entity Interpolation** — Other players rendered by interpolating between the two most recent server states (one tick behind real-time). Brief extrapolation on packet loss, capped at 200ms.
4. **Lag Compensation (Server-Side Rewind)** — "Favor the shooter." Server keeps a circular buffer of past states (~1 second). On shoot commands, rewinds other players' positions to the shooter's estimated render time (current minus half RTT) and validates hits against that past state.

**Connection recovery (Session 82):** `NetworkConnection` owns one channel,
one five-second handshake timer, and at most one reconnect timer. Automatic
attempts back off 1/2/4/8/16 seconds; explicit Retry Now safely closes the
current channel, cancels both timers, resets the cycle, and connects
immediately. Geckos may throw while closing a channel whose peer was never
created, so teardown clears ownership before best-effort `close()` and ignores
all later callbacks from that stale channel. On `reconnecting` or terminal
`disconnected`, `NetworkManager` immediately clears the old player id and all
match-scoped state. The lobby is the source of user-facing signal status and
keeps every server-backed play action disabled until `connected`; local
selectors and the Codex remain available. Draft/select return to the lobby,
live play shows the interruption beat before returning, and Results disables
rematch. Do not invent client-side match recovery without a server-owned
session-resume protocol.

### Why This Matters for Agents

Client prediction and server simulation **must use identical physics code** from `/shared`. If you change movement, collision, or physics logic, you must change it in `/shared` and verify both client and server still agree. A mismatch between client prediction and server authority causes visible rubber-banding.

Movement modifiers (per-character speed × active mutators × second-wind boost) are folded by the shared `playerMovementModifiers()` in `shared/src/utils/event-modifiers.ts` — the ONE function all three movement call sites use (server input loop, client prediction, client reconciliation). Never compute a speed multiplier anywhere else.

### Characters

The 6-character roster lives in `CHARACTERS` (`shared/src/config/game.ts`) with per-character stat identities: `maxHealth` (committed onto PlayerState at select lock), `speedMultiplier` (via `playerMovementModifiers`), and `hitbox` — the **hit-validation AABB only** (bullets/pellets/fire breath/axes, live and lag-comp-rewound alike; derive via `characterHitbox()`). Movement collision intentionally stays `PLAYER.HITBOX_*` for everyone (same contract as the big_heads mutator), so map geometry plays identically across the roster. Abilities: Mighty Man x-ray, Bruce fire breath, Frost Wizard freeze, Bubba Iron Hide (50% damage reduction, applied inside `CombatManager.applyDamage` — the single damage choke point; callers must consume the returned `damageApplied` for stats/vampire), Jack Axe Throw (server-simulated projectile like grenades; client throw/landing FX ride the message-granularity `axeThrown`/`axeResolved` events because a point-blank flight can span a single snapshot), and Rook Breach Dash (instant aim-directed 3-tile movement, stopped by the shared collision sweep, no damage/invulnerability, 8s cooldown). Rook's dash must stay mirrored in server input processing, client prediction, and reconciliation; modes can disable its local prediction through `NetworkManager.setAbilitiesEnabled()`.

Character presentation is registry-driven for idle, run, attack, and death sheets. The pack only supplies horizontal death facings, so `deathDirectionForAim()` projects the authoritative aim onto side/side-left. `PlayerRenderer.updateLifeState()` owns the alive/dead edge: play the death sheet once, hide living-only cosmetics/name/health, hold the final corpse frame through the server respawn timer, then restore the current body/weapon state on respawn. Never drive visibility directly from every snapshot or the animation will disappear/restart. Jack's alt body declares its own no-axe death sheets; Frost Wizard shares Mighty Man's death art and keeps its tint. `CharacterDef.bodyOverlay` is an optional synchronized cosmetic layer with its own cropped frame dimensions; Rook uses it for the helmet across every body state. Keep the overlay top-aligned, scaled with big-heads, and tint-synchronized with freeze.

**Roster-authentic Results (Session 87):** matchmaking copies every locked
`PlayerState.characterId` into optional `MatchResult.playerCharacters` before
wire serialization. Results uses that server-authored map for duel tableaux
and Rumble portrait rows, including Frost Wizard's gradient and Rook's
top-aligned helmet overlay. Older/partial duel results deliberately fall back
to the original Mighty Man/Bruce presentation, while older Rumble results keep
their prior text-only rows. Keep this field presentation-only: it must not
affect standings, score, persistence, rematches, combat, physics, or balance,
and the client must never reconstruct character identity from nickname, sprite
state, or local selection caches.

**Death Animation Variety (Session 61):** `CharacterDef.deathVariants` declares optional cosmetic-only horizontal strips. `deathVariantPrefix()` cycles the base and alternates from the authoritative per-match `SerializedPlayerState.deaths` count, so first render, reconnect, local prediction, and remote presentation need no RNG or new wire state. BootScene loads and creates only death animations for these prefixes, normalizing every strip to the existing 0.65-second duration. Mighty Man and Frost Wizard share a three-collapse cycle; Bruce and Bubba have two; Jack's complete no-axe body has two. Rook stays on its synchronized body/helmet collapse, and armed Jack stays on its complete first-death facing pair because the source pack lacks compatible complete alternates. Do not apply a body alternate when its overlay or both horizontal facings are missing.

**Weapons** live in `WEAPONS` (`shared/src/config/game.ts`): rifle (always carried), shotgun (announced power-weapon map pickup, special slot), pistol (silent sidegrade map pickup in DM/KOTH — spawns active at match start, never announced — plus a Gun Game rung; shares the special slot, last-picked-up wins), and punch — flat-damage melee validated as `pelletCount` deterministic even-fan rays (`evenFanAngles`, NO jitter) through the same lag-comp rewind as every gun, with `WeaponDef.maxRange` hard-capping ray length (without it rays extend to `falloffRangeMax * 2`). One damage application per victim per swing; a swing can hit multiple victims. Punch swings broadcast as the transient `punches` array on gameState (delivery like `bulletTrails`); the client plays per-character body-level attack animations (`CharacterDef.attackFrames`/`attackFrameCount`, playback normalized to ~350ms regardless of frame count).

Bullet trails also carry authoritative player-hit confirmation. Every trail begins with `hitPlayerId: null` and `damageApplied: 0`; `Match` stamps both only after `CombatManager.applyDamage()` succeeds, using its post-mitigation amount. The client must never infer a fighter hit from the ray endpoint. Confirmed trails play the curated player-hit splash at bullet-arrival time and only the local shooter hears the confirmation tick; misses and scenery hits keep the spark/dust/decal path. Shotgun pellets may each render a splash, but collapse to one confirmation sound per blast.

### N-Player Architecture

Quick Match launches as 1v1; Wasteland Rumble launches with 2–4 players; Crew Battle currently launches a fixed 2v2 roster. The game remains architected for N players. Use arrays/maps of players everywhere — never hardcode `player1`/`player2` or assume exactly 2 players. Matchmaking, game state, and rendering must all support variable player counts.

### Game Mode Abstraction

Match logic is behind a `GameMode` interface (`onStart`, `onKill(…, weapon)`, `onTick`, `isMatchOver`, `getResults`, `determineWinner`, plus optional objective/lifecycle hooks). Eight modes exist: `DeathmatchMode`, `KothMode` (King of the Hill — 1 hill point per full second as sole living occupant, contested = nobody scores, hill relocates round-robin through the map's `kothHills` every 25s, first to 60 or highest at time-out; hill points ride in `PlayerState.score`), `GunGameMode`, `LastStandMode`, `KillConfirmedMode`, `OneInTheChamberMode`, `CoreRunMode`, and `BountyHuntMode` (see below). New modes = new class + registry entry; use optional hooks when a rule must affect core lifecycle or serialized objective state.

Every `GAME_MODES` entry also owns a short `objective` string. `GameScene` presents that shared copy beneath the 3/2/1 countdown and fades it with `FIGHT`, so a new or returning player learns the selected win condition before control begins. Keep this copy concise enough for mobile landscape and update it whenever a mode's victory rule changes.

**Gun Game:** every kill made WITH YOUR CURRENT RUNG WEAPON marches you down the ladder rifle → shotgun → pistol → grenades → punch (`GUN_GAME` in shared config: `RUNG_KILLS` [2,2,2,2,1]); the first player through the final rung wins immediately. `PlayerState.score` = total ladder kills; the pure helpers in `shared/src/utils/gun-game.ts` (`gunGameRungForScore`) derive the rung on both server (loadout enforcement in `onTick`) and client (HUD ladder) — never store rung state separately. Ability kills (axe/fire) and self-kills don't advance; no demotion. The mode excludes `grenades_only`, `infinite_ammo`, `fists_only`, `weapon_roulette`, and `last_laugh` from random rolls because those rules bypass or corrupt the ladder, disables all pickups except bandages, gates gun fire on the grenade rung (`areGunsDisabled`), and keeps ammo reserves floored so no rung can strand a player.

**Last Stand:** every fighter starts with 5 lives (`LAST_STAND.STARTING_LIVES`); every death, including a suicide, removes one. `PlayerState.score` = remaining lives, so the existing score wire contract and results ordering stay intact. Dead fighters respawn while their score is positive; zero-life fighters remain eliminated spectators in N-player matches. The last contender wins immediately, while a tied regulation clock uses normal sudden-death overtime and excludes already-eliminated fighters. The client labels the shared score as lives and replaces the respawn countdown with `ELIMINATED` when the local stock reaches zero.

**Kill Confirmed:** deaths create 20-second contested dog tags at the victim's authoritative position. Any living opponent who enters the 30px collection radius banks one point; the owner can recover the tag to deny that point. First to 8 confirmations wins, and tied regulation uses normal sudden-death overtime with all tags retired. `KillConfirmedTagState` rides in each game-state snapshot; one-tick `KillConfirmedCollection` events drive CONFIRMED/DENIED callouts and pickup-rate SFX without client inference. Rusty prioritizes the nearest tag, even while no living combat target exists. Tags and scores are N-player safe; a third player may confirm any non-owned tag.

**One in the Chamber:** every fighter receives exactly one lethal pistol round on match start, respawn, and opponent kill; missing swaps the dry special slot to lethal punch until a direct or pistol-triggered barrel kill earns the round back. First to 8 wins. `OneInTheChamberMode` owns the economy through existing `PlayerState.weaponId`/special-ammo fields, leaves only bandage pickups, disables grenades and character abilities server-side, and re-chambers the normal rifle reset on respawn/overtime before the next snapshot. Its direct-hit damage hook runs only after ordinary lag-comp validation and still routes through `CombatManager.applyDamage`. Random rolls exclude loadout owners plus redundant health, grenade, ability, free-explosive, and supply-race rules; FORCE pins intentionally bypass that safety. Client input also suppresses disabled secondary actions, while the HUD derives loaded/fists/pending states from authoritative snapshots.

**Core Run:** a neutral core begins at the geometric centre of every arena. A living fighter inside the 30px collection radius claims it; simultaneous claims resolve by nearest distance then player id. The carrier earns one point per full second and wins at 45, while combat, abilities, grenades, mutators, and ordinary sustain pickups remain live. Death drops the core at the carrier's position; an unclaimed drop returns home after 12 seconds. Pistol, shotgun, and bat pickups are disabled so centre control stays about the objective rather than a stacked special-weapon prize. `CoreRunState` rides in authoritative snapshots and drives the world marker, HUD, callouts, Blackout beacon, and Rusty's loose-core pursuit. Regulation ties use normal first-kill overtime with the core retired. The mode-specific Core Runner contract tracks authoritative carry seconds through objective score.

**Bounty Hunt:** one living fighter is always the visible mark during regulation. Ordinary kills score 1, the marked fighter's counter-kills score 2, and killing the mark scores 3 and transfers the bounty to a living killer; first to 25 wins. The opening target is derived from the match id over sorted player ids instead of favoring a fixed slot. A dead, self-killed, or missing target advances through the stable N-player order, while posthumous bounty killers earn their three points but cannot retain the mark. `BountyHuntState` drives the gold pulsing world marker, middle-band HUD, target-change callouts, Blackout beacon, and Rusty's priority target. Tied regulation uses ordinary first-kill overtime with scoring and the mark retired.

**Pre-match map/mode draft (Sessions 9 + 78):** every real match — fresh AND rematch — opens with a player draft instead of blind rotation. It lives in `MatchmakingManager` BEFORE `Match` construction (Match takes mapData/gameMode in its constructor). Quick Match and two-player Rumbles use the original two-role flow: the server rolls who picks first (injectable RNG), that player claims a category implicitly by picking EITHER a map or a mode (`client:draftPick`), and the distinct second picker chooses the remainder. Three- and four-player Rumbles use a Draft Rally instead: every entrant gets one immutable map ballot and then one mode ballot, each phase resolves early when everyone votes or after 15 seconds, plurality wins, a server RNG breaks tied leaders, and abstainers receive no invented votes. `server:draftState` broadcasts the active kind, category, and accepted ballots per tick; the final `server:matchFound` contract is unchanged. A disconnect tears the draft down. The client's `DraftScene` sits between lobby/results and character select. **Setting `FORCE_MAP` or `FORCE_MODE` skips the draft entirely** — that's the smoke-pin path AND the kill switch, and it's the only path where the old rotation cursors still run.

**Wasteland Rumble (Sessions 76 + 78):** `RUMBLE 2–4` is a separate server-authoritative queue, leaving Quick Match and its 1v1 rivalry semantics unchanged. Once two fighters gather, a six-second launch window admits more players; reaching four launches immediately. A two-fighter Rumble keeps the two draft roles, while three- and four-fighter groups use the all-player Draft Rally described above. The server enforces unique character locks for the whole group and carries `matchKind: 'rumble'` through match, results, and direct rematch. An active leaver is eliminated, omitted from later live snapshots, retained in the final standings, and never blocks the connected group's rematch consensus. Rumble results use authoritative score/nickname/departure maps and intentionally skip lifetime head-to-head rivalry writes and Rivalry Sets. Keep gathering state tick-driven and throttle reliable queue-status updates to visible whole-second changes.

**Rivalry Sets + Revenge Drafts (Session 10):** consecutive 1v1 rematches form an ephemeral first-to-3 set (`RIVALRY_SET.WINS_TO_CLINCH`). `MatchmakingManager` owns the set state outside individual `Match` instances, attaches a full `MatchResult.rivalrySet` snapshot at every match end, resets it when the pairing leaves results or starts again after a clinch, and never persists it into lifetime stats. After a decisive round, the loser is `server:draftState.firstPickerId` with `firstPickerReason: 'revenge'`; a draw or fresh pairing uses the seeded coin-toss roll. The ResultsScene shows set score/champion plus the lifetime rivalry, and DraftScene uses a shorter revenge reveal instead of pretending the result was random. FORCE pins still skip every draft, but set scoring continues.

**Fresh-chaos rematches (Session 16):** `PostMatchState.previousMutators` captures the completed round's active pair and carries it through either the revenge draft or direct Practice/FORCE rematch into `Match.rematchMutatorExclusions`. Random mid-match and final-minute rolls exclude both values in addition to mode exclusions and within-match duplication. Explicit `FORCE_EVENT` / `FORCE_MIDMATCH_MUTATOR` pins are evaluated first and intentionally bypass recency. The memory exists only across a direct rematch; returning to the lobby creates a clean pairing.

**Wasteland Contracts (Session 24):** every Match selects one shared optional side objective from `MATCH_CONTRACTS` without consuming gameplay RNG. The server derives per-player progress from authoritative match stats, objective score, and barrel triggers, broadcasts `MatchContractHudState` every snapshot, and attaches final progress to `MatchResult.contract`. Contracts never alter score, damage, pickups, movement, win conditions, or awards. Non-Practice completions increment `LifetimePlayerStats.contractsCompleted`; old version-1 files back-fill zero. Direct rematches exclude the previous contract, while `FORCE_CONTRACT=<id>` is a smoke pin that intentionally bypasses recency. The HUD contract card/completion callout has a dedicated lane and must not reuse mutator/overtime or streak callout objects.

**Wasteland Reputation (Session 26):** lifetime contract completions project into the frozen `CAREER_RANKS` ladder: Drifter, Scavenger, Road Dog, Marauder, Wasteland Veteran, and Legend of the Waste. Rank is derived at presentation time rather than persisted, so existing stats files need no migration and future threshold tuning cannot strand stored state. The lobby leaderboard shows each player's compact three-letter badge, while ResultsScene shows progress toward the next threshold or a one-round `RANK UP!` celebration when a completed contract crosses it. Practice and old partial results intentionally show no reputation progress. Reputation is cosmetic and never changes matchmaking, combat, contract selection, or scoring.

**Hot Streaks (Session 27):** each persisted `LifetimePlayerStats` record carries `currentWinStreak` and `bestWinStreak`, back-filled to zero when loading older version-1 files. A real-match win extends the current run and personal best, a loss resets only the current run, and a draw preserves both. `MatchmakingManager` captures the before/after values around the synchronous in-memory `recordMatch` update and attaches optional per-player `MatchResult.winStreaks`; Practice skips the store and the field entirely. ResultsScene projects those snapshots beneath each nickname as active, new-best, held, ended, or quiet copy. Streaks never affect matchmaking, draft order, rivalry sets, scoring, or combat.

**Fighter Mastery (Session 28):** `LifetimePlayerStats.characterWins` is a complete `Record<CharacterId, number>` back-filled from `createEmptyCharacterWins()` for older version-1 files. Only a real-match winner gains one win for the fighter locked on that match; losses and draws add none, while Practice may display existing mastery but never writes it. Each reliable per-player `server:matchFound` carries only that local nickname's totals, normalized against the full roster before `GameService` caches them. CharacterSelectScene derives Untested (0), Blooded (1), Proven (3), Veteran (7), or Master (15) from the frozen `CHARACTER_MASTERY_TIERS` and shows current/next progress on every card. Mastery never changes stats, selection locks, abilities, draft order, matchmaking, or combat.

**Fists Only (Session 29):** `fists_only` is a shared mutator that turns every active fighter's core loadout into punch, clears grenades and special ammo, and reasserts that authoritative loadout after mode hooks, respawns, and pickup collection. Character abilities remain available so fighter identity survives the brawl. Random scheduling treats `fists_only` and `grenades_only` as a symmetric conflict and Gun Game excludes fists from random rolls; explicit FORCE pins still intentionally bypass those safety rules. Rusty's punch movement target is derived from `WEAPONS.punch.maxRange`, so a melee-equipped bot closes into swing range instead of holding rifle spacing. Outside an active Fists Only mutator, weapon balance, physics, and bot ranged spacing are unchanged.

**Weapon Roulette (Session 30):** `weapon_roulette` is a fair shared-loadout mutator: every fighter receives shotgun → pistol → punch → rifle in the frozen `MUTATORS.WEAPON_ROULETTE_ORDER`, with a synchronized 10-second step timer and equal ammo restocks only on activation or step changes. A dry special weapon stays equipped until the next step instead of reverting and refilling itself. Respawns and compatible mode hooks are corrected before snapshots; gun-ammo and weapon pickups are retired on activation because the mutator owns that economy, while grenades, healing, and abilities stay live. Client callouts are derived from authoritative local `weaponId` edges. Random scheduling prevents any pair among `weapon_roulette`, `fists_only`, and `grenades_only`; Gun Game excludes Roulette, and explicit FORCE pins still bypass those safeguards for smoke testing.

**Wasteland Warp (Session 36):** `wasteland_warp` rotates every living fighter through the other living fighters' current positions: first after 8 seconds, then every 12 seconds. Players are sorted by stable id before the cyclic rotation, dead fighters are excluded, destinations are already-valid authoritative positions, and velocity clears on arrival. With fewer than two living fighters the timer advances without a fake sequence edge. `WastelandWarpState` carries the countdown plus actual-rotation sequence in every active snapshot; the client uses it for reconnect-safe HUD copy and fires warp feedback only on a later sequence edge. The mutator retires during overtime and otherwise composes with every mode, fighter, weapon, pickup, and other mutator.

**Last Laugh (Session 37):** `last_laugh` makes every regulation death leave a stationary, victim-owned grenade at the corpse position with the frozen 1.4-second `MUTATORS.LAST_LAUGH_FUSE_SECONDS` fuse. It uses the ordinary authoritative explosion path, so line of sight, Iron Hide, Vampire, barrels, blastable scenery, chains, posthumous credit, and medals remain consistent; it never consumes the victim's grenade inventory or counts as a player throw. The client identifies `GrenadeState.isDeathBomb`, renders an accelerating red pulse, and exposes it as a Blackout light beacon. Overtime suppresses new death bombs and clears existing grenades. Random Gun Game and One in the Chamber schedules exclude Last Laugh because free grenade kills would corrupt their weapon economies; explicit FORCE pins still intentionally bypass those draft safeguards.

**Scavenger Rush (Session 41):** `scavenger_rush` immediately creates one short-lived supply, then rotates a new one through the arena's authored KOTH anchors every 12 seconds. Match-id hashing chooses the starting anchor and reward sequence without consuming gameplay RNG; the shared Scavenger Cache loot table supplies ammo, healing, grenades, or rare weapons, then live mode/mutator ownership substitutes unusable rewards. `PickupState.isScavengerRushDrop` plus `expiresInSeconds` makes the cyan halo, label, and accelerating pulse reconnect-safe. Only one Rush supply exists at a time, each expires after 8 seconds, and overtime retires it and suppresses later drops. Rusty detours for live supplies outside objective-owned movement. Gun Game and One in the Chamber exclude the random roll because their economy veto leaves no meaningful contest; FORCE pins remain safe diagnostics.

**Wasteland Bat (Session 42):** `bat` is a finite-use melee special weapon with four committed swings, 80 flat damage, 72px reach, a deterministic nine-ray 110-degree arc, and a 0.7-second cooldown. Every swing spends one use; the fourth returns the owner to rifle, while Infinite Ammo keeps it full. It uses the generic lag-compensated melee path, so walls, per-victim dedupe, multi-target sweeps, Big Heads, Iron Hide, and Vampire remain authoritative. Every arena has one silent 30-second bat spawn; caches/Rush can roll it rarely, and Power Weapon Drops preserve exact remaining swings. Rusty treats every `maxRange` weapon as melee. The client renders the bat for all fighters independently of gun overlays, hides the aim line, shows remaining swings, and reuses the reliable punch event with optional `weaponId`. Bat kills feed lifetime weapon stats and the `Slugger` award.

**Radiation Storm (Session 43):** `radiation_storm` chooses one authored KOTH anchor by stable match-id hash, opens with a radius that contains the whole arena, then closes linearly for 18 seconds to 144px. Living non-invulnerable fighters outside take a 10-HP pulse each second, clamped at 1 HP: radiation never kills, scores, records damage, advances contracts, heals Vampire, or invokes Iron Hide. `RadiationStormState` carries center/radius/shrink time in every snapshot; overtime omits it and stops all pulses before fresh spawns. Random scheduling treats it as conflicting with `low_health`; FORCE pins still bypass conflicts. Rusty prioritizes the center only while outside. The client draws a pulsing boundary, local outside wash/warning, and rounded shrink clock entirely from snapshots.

**Rusty's Scavenger Instincts (Session 44):** Practice Rusty now evaluates every active ordinary pickup from authoritative player/pickup state and may take a deterministic, six-tile detour for a useful bandage, special weapon, grenade, or ammo box. Critical healing outranks weapons, power weapons outrank refills, distance then pickup id break ties, expiring rewards must remain reachable, and a live shotgun/bat is never discarded for a pistol sidegrade. Radiation safety, KOTH, loose Core Run cores, Kill Confirmed tags, and an enemy Bounty target retain movement priority; Scavenger Rush supplies remain the next short-lived obligation. Rusty keeps aiming and firing while scavenging, and collection still uses the ordinary overlap plus `PickupManager.applyPickup` path, so mode/mutator pickup vetoes remain authoritative.

**Scrap Armor (Session 45):** every arena has one center-lane `armor` pickup that grants a 35-point temporary shield and respawns after 25 seconds; the same type is a rare Scavenger Cache/Rush reward. `PlayerState.armor` is authoritative and required throughout snapshots, interpolation, reconciliation, and render assembly. Ordinary damage applies Iron Hide first, then armor before health, while `damageApplied` remains the whole post-reduction hit for stats/Vampire/contracts; Radiation Storm bypasses the shield. Respawn and overtime clear armor, Low Health clears shields and retires armor pickups, Gun Game/One in the Chamber exclude it, and Clutch requires armor 0. Keep local and overhead shield bars snapshot-driven. Rusty values armor below power weapons and above ordinary healing but ignores a full plate.

**Scrapstorm (Session 46):** `scrapstorm` paints one captured living-fighter position for 1.5 seconds, then drops a 96px-radius, 45-damage arena blast; the first warning begins after 2.5 seconds and later warnings begin every 6 seconds. Target selection is stable round-robin, and the painted position never follows its fighter, so movement always provides a fair escape. Damage is authoritative but nonlethal: it respects death/invulnerability and Iron Hide, drains Scrap Armor before health, clamps at 1 HP, and never scores, records stats, advances contracts, heals Vampire, or emits kill feed. `ScrapstormState` is present throughout active regulation, uses null target fields during quiet windows, and is omitted in overtime. Random scheduling conflicts with Low Health and Radiation Storm; FORCE pins still bypass conflicts. Rusty prioritizes an open tile outside an active blast. The client renders the snapshot-driven orange ring, countdown, local move warning, impact VFX/SFX, and reconnect-safe active-mutator label.

**Demolition Wave (Session 56):** `demolition_wave` is a one-shot arena rewrite in the shared mutator pool. On activation the authoritative Match removes every still-solid ordinary `COVER_LOW` cell and shootable gate through the existing `server:tilesDestroyed` stream; clients therefore update rendering and prediction collision, while Rusty's live collision grid changes on the same tick. Explosive-barrel and scavenger-cache decoration cells are explicitly protected, and ordinary/perimeter walls never qualify, so the event opens sightlines without silently triggering damage or deleting loot. The map definition remains immutable and a rematch rebuilds its geometry. The amber banner, screen flash, zoom pulse, and camera shake are presentation only. It composes with all modes and mutators, and its Gauntlet danger bounty is 300.

**Blood Rush (Session 59):** `blood_rush` grants a surviving killer a four-second 1.35x movement boost after an opponent kill. Suicides and posthumous kills never trigger it; later qualifying kills refresh the duration rather than stacking it. The server writes the existing `PlayerState.secondWindTimer`, and shared `playerMovementModifiers` consumes that snapshot field on authority, prediction, reconciliation, and Rusty input, so there is no parallel movement state. The legacy field now represents either a Second Wind respawn boost or a Blood Rush kill boost. Those mutators conflict in ordinary scheduling because they share the timer; FORCE pins may still combine them through the established override behavior. Activation teaches `KILLS GRANT 4 SEC SPEED`, boosted fighters reuse the snapshot-driven sprint dust, and crimson flash/banner feedback is presentation only. Blood Rush is valid in every mode and pays a 200-point Gauntlet danger bounty.

**Ability Overdrive (Session 66):** `ability_overdrive` multiplies only the authoritative `abilityCooldownSeconds` countdown by the frozen 3x recharge multiplier. Ability active durations, Frost Wizard freeze timers, damage, movement, and input stay unchanged; existing snapshots drive every HUD and readiness decision, including Rusty's normal ability use. One in the Chamber excludes the random roll because that mode disables abilities, while explicit FORCE pins retain their diagnostic override. Overcharge Cells still perform their ordinary instant refresh and compose safely. The violet activation teaches `3X ABILITY RECHARGE`, and the shared boon pays a 100-point Gauntlet danger bounty.

**Mutator Rule Callouts (Session 60):** every mutator activation banner pairs its display name with compact uppercase rule copy from the shared `eventStartDetail` helper. `EVENT_START_DETAILS` is an exhaustive `Readonly<Record<MutatorId, string>>`, so adding a future mutator without teaching copy is a compile error. Details stay at 30 characters or fewer for the existing two-line 22px banner; persistent HUD labels and advance-warning banners remain name-only. The client renders shared copy and owns no gameplay policy, and this feature changes no authoritative mutator behavior.

**Overcharge Cells (Session 47):** every arena places one immediately active `overcharge` pickup in the unused tile of its central 2x2 resource square. A living fighter may claim it only while no ability effect is active and at least 2 seconds of ability cooldown remain; collection clears the entire cooldown and the authored cell respawns after 30 seconds. Scavenger Caches and Scavenger Rush may roll one rarely. Gun Game and One in the Chamber exclude it with their existing bandage-only economies, while Core Run permits it. Rusty values a useful cell below the shotgun/bat and above Scrap Armor. Successful authoritative collections advance the compatible `POWER TRIP` contract; rejected overlaps never do. The client uses the ordinary pickup snapshot/event path for its procedural violet/yellow cell, `CHARGE` halo, steady pulse, and local `OVERCHARGED / ABILITY READY` feedback.

**Twin-stick gamepads (Session 48):** `GamepadInput` samples the first connected standard browser gamepad behind an injectable provider, applies a circular 20% dead zone with full-range rescaling, and preserves the mouse/touch release-to-fire contract. Mapping: left stick move, right stick aim, RT fire, LT grenade/detonate, LB or L3 sprint, RB ability, X/Square reload. `InputManager` switches among keyboard, touch, and gamepad on meaningful intent without changing `PlayerInput`, prediction, reconciliation, or server authority; mouse movement and touch reclaim their modes immediately. Controller mode hides the stale mouse crosshair, announces its mapping once, and uses optional haptics only for locally valid attacks/actions and incoming damage. `MenuGamepadInput` provides edge-triggered D-pad/left-stick plus A/B/X navigation to lobby, draft, character select, and results; `PixelButton.setFocused()`/`activate()` keep controller actions on the ordinary button path. Browsers and pads without haptics remain fully supported.

**Power Weapon Drops (Session 39):** a regulation death while carrying a non-empty shotgun, pistol, or bat spills that weapon at the authoritative death position for 14 seconds. The one-shot pickup preserves exactly the victim's surviving magazine plus reserve (remaining swings for bat) instead of minting a full refill, then disappears when collected or expired. `PickupState.isDroppedWeapon` and its authoritative `expiresInSeconds` drive the client's gold accelerating pulse; the exact ammo payload remains server-only. Dry weapons and overtime never drop. Gun Game, One in the Chamber, Core Run, Fists Only, Weapon Roulette, and Grenades Only retain ownership of their loadout economies; activating a loadout mutator also retires any live special-weapon drops. Cache rewards remain non-expiring and keep their authored full-ammo behavior.

**Solo Practice vs Rusty (Session 11):** `client:startPractice` bypasses the human queue/draft and creates a normal authoritative `Match` with one synthetic `bot:<uuid>` player. `BotController` submits sequenced `PlayerInput` through the same queue as clients; it uses the shared collision grid for deterministic BFS, shared raycasts for sightlines, ordinary weapon/grenade/ability controls, Gun Game rung helpers, and the live KOTH state for objective movement. Never special-case bot damage or physics. Practice rematches auto-accept for the bot and rotate directly through `MatchResult.nextMapName` / `nextGameMode`, retaining ephemeral Rivalry Set scoring. `MatchResult.isPractice` is the client/wire marker; practice must skip every `PersistentStatsStore` and leaderboard write, and all teardown paths must release the synthetic identity.

**Favorite Mode Sparring (Session 62):** ordinary `sparring` may include an optional `client:startPractice.gameMode` chosen by the persisted lobby `SPAR MODE` selector. The server validates it against `GAME_MODE_ROTATION`, ignores it for Gauntlet, and retains a valid pin through result metadata and direct Practice rematches while maps still rotate. `FORCE_MODE` remains strongest. Missing, stale, or malformed values retain the ordinary random-first, rotating-rematch behavior; PvP draft and Gauntlet route authorship are unchanged. Keep `gameMode` optional for old clients and keep every mode's rules, bot behavior, scoring, and physics on their ordinary authoritative paths.

**Choose Your Rival (Session 63):** ordinary `sparring` may also include an optional `client:startPractice.opponentCharacterId` from the persisted lobby `RIVAL` selector. The server validates it against `CHARACTER_IDS`, locks that fighter for Rusty before human selection, and carries the pin through direct Spar rematches. Missing, stale, or malformed values keep random rival selection. Gauntlet ignores the field and continues to own its route rivals/no-repeat history; PvP is unchanged. Keep the field optional for old clients, keep the normal one-fighter-per-match selection rule, and never let a client-authored rival enter Gauntlet state.

**Custom Chaos Sparring (Session 69):** ordinary `sparring` may include an optional `client:startPractice.mutatorId` from the persisted lobby `SPAR CHAOS` selector. Validate it with the shared mutator guard, ignore it for Gauntlet/Daily, and echo only an accepted choice as optional `server:matchFound.practiceMutatorId` so Character Select renders server truth. `MODE_MUTATOR_EXCLUSIONS` is the single compatibility source for authoritative modes, matchmaking, and client filtering. A Random-mode Spar chooses and rotates only through compatible modes; an explicit mode pin remains stronger and rejects an impossible pairing. A valid choice owns the ordinary mid-match slot across direct rematches even when recency contains it, while the final-minute slot stays random and conflict-safe. `FORCE_MIDMATCH_MUTATOR` / `FORCE_EVENT` remain strongest and suppress any replaced/conflicting promise. Do not let this client preference affect PvP, Gauntlet forecasts, Daily determinism, combat, scoring, physics, bot tuning, or persistence.

**Wasteland Gauntlet (Sessions 49–55):** `client:startPractice.kind` distinguishes ordinary `sparring` from an optional three-stage `gauntlet`. The server—not the client—assigns Rookie, Scrapper, then Warlord from `PRACTICE_GAUNTLET`, attaches the live stage to `server:matchFound`, resolves advancement from the authoritative winner, and carries only the computed next stage through the normal direct-Practice rematch path. A loss or draw ends the run and resets the next fight to stage 1; a stage-3 win clears it. Advanced results offer server-authored Route A/B map, mode, Rusty-fighter, and compatible mid-match mutator previews. The selected rival and forecast are pinned into the next match. The server carries one run history for both, so neither a fighter nor a promised chaos event repeats within a run—even when a forecast never activates. Forecast generation is deterministic without consuming Match RNG, respects each mode's exclusions and a forced final event's conflicts, and leaves `FORCE_MIDMATCH_MUTATOR` strongest. `Match` revalidates a planned forecast against its ordinary exclusions before using it. `GAUNTLET_CHAOS_BOUNTIES` exhaustively maps every forecast to a frozen 100/200/300 danger payout. Stage one has no forecast or bounty; winning a forecast stage banks its payout whether or not the event activated, so score play never rewards stalling. Losses and draws pay zero. `chaosBountyBonus` is optional for old results and presentation treats it as zero. Missing or invalid route input retains the complete Route A offer; old payloads with no forecast remain compatible. Gauntlet skips Rivalry Set creation as well as every Practice stats/leaderboard write. Maps, modes, contracts, bot inputs, and combat all keep their ordinary authoritative paths. Keep all Gauntlet route metadata optional for old/ordinary Practice payloads, and never let client input invent a difficulty, rival, forecast, or bounty.

**Gauntlet Boon Drafts (Session 70):** every advanced Gauntlet/Daily result attaches one distinct server-authored boon to each Route A/B offer. Selecting the route appends that boon to the run's normalized, unique, maximum-two `boonIds`; missing or malformed route input still selects the complete Route A offer, and failure or completion resets the build. Daily offers derive from its stable challenge key, while ordinary Gauntlet uses the run's authored route context. Boons apply only to non-bot entrants: Scrap Plating restores 25 armor at opening and every legal respawn unless Low Health owns durability; Kill Salvage grants a surviving opponent-killer 20 health and one grenade unless the mode disables grenades; Quick Charge multiplies only authoritative cooldown countdown by 1.5 and composes with Ability Overdrive; Spawn Rush grants four seconds of 1.3x movement at opening and every legal respawn through a separate optional `spawnRushTimer` snapshot field consumed by shared server/prediction/reconciliation physics. Mode authority stays strongest: One in the Chamber pistol/punch damage remains lethal through armor by returning current health plus armor. Rusty receives no boon benefits. Route/build metadata stays optional for old payloads, and the client only renders server truth in route labels, Character Select, and Results. Never let a client invent a boon or let a boon alter PvP, Spar, score, contract, persistence, bot tuning, or frozen base balance.

**Gauntlet Build Codex (Session 71):** the six canonical two-boon pairs have presentation-only identities: Iron Scavenger, Arc Plating, Ram Raid, Combat Engine, Bloodhound, and Redline. `gauntletBuildForBoons` resolves server-authored `boonIds` order-independently; it never changes their effects. Only a fully cleared Gauntlet or Daily finale discovers the active two-boon build. The client stores a normalized, duplicate-free allowlist in device-local `mmr_gauntlet_build_codex`, tolerates malformed/old storage, and never sends or writes it to server lifetime stats. Character Select/Results name the complete active build, Results celebrates a new discovery, and the lobby shows collection progress out of six. Failed or merely advanced runs never unlock an entry. Keep this as a Practice collection chase: no combat, score, Daily ranking, PvP, Spar, balance, or authoritative persistence consequences.

**Gauntlet Build Mastery (Session 72):** the lobby's `BUILD CODEX` button opens a six-card trophy board. Recipes stay visible so locked builds are discoverable, but their names and flavor remain hidden until a full clear. Discovered cards show their best clear score, and the board sums those independent records into a combined best. `mmr_gauntlet_build_codex` now includes a sanitized `bestScores` map keyed only by discovered canonical build IDs; loading transparently migrates the Session 71 discovered-only shape. Only authoritative `result.runScore` from a fully cleared Gauntlet or Daily finale may improve a build record. Results distinguishes first discovery from a repeat `NEW BUILD BEST`. This remains device-local presentation and motivation: never use it for gameplay effects, server persistence, lifetime stats, Daily ranking, PvP, Spar, or balance. The compact lobby button deliberately expands only its invisible vertical pointer target through `PixelButton.hitPaddingY`; preserve the visible layout and gamepad focus order.

**Daily Gauntlet (Session 65):** `client:startPractice.kind = 'daily'` requests a server-authored Daily Run. The server clock creates an ISO UTC `challengeKey`; a stable hash chooses the opening map, mode, and Rusty fighter, and each fight seeds Match RNG plus contract/cache/hazard selection from date, stage, map, mode, and rival. Retrying the same stage therefore reproduces the meaningful challenge state, including spawn layout and contract. `FORCE_MAP`, `FORCE_MODE`, and other explicit smoke pins remain strongest. The optional key travels only with Daily Run Gauntlet metadata, preserving old clients and ordinary Gauntlet/PvP behavior. The client may persist the completed clear's daily best and consecutive UTC-day clear streak locally, but it never authors challenge gameplay or writes Practice results to lifetime stats. Unlimited attempts are intentional.

**Daily Scoreboard (Session 67):** only a completed Daily Run clear enters the server-owned board for its UTC `challengeKey`. `MatchmakingManager` records the authoritative Gauntlet `runScore`; clients never submit a score. `PersistentStatsStore` keeps one best score per normalized callsign/date, ranks by score descending then first-achieved time and normalized name ascending, and retains the newest 14 boards inside the existing persistent JSON without touching lifetime PvP, contracts, reputation, mastery, rivalries, or hot streaks. The server attaches `dailyRank` and `dailyBestScore` to the clear result, sends the current top five reliably on connect, rebroadcasts after every clear, and checks UTC rollover once per second so long-open lobbies cannot remain on yesterday's board. The lobby's mirrored `DAILY TOP 5` panel renders only that server snapshot; an empty board explicitly invites the first clear.

**Daily Rival Chase (Session 68):** every Daily Run attempt receives one optional server-authored `dailyChase` in its existing Gauntlet metadata. `PersistentStatsStore` chooses the closest meaningful objective from the complete ranked board: set the first score, show the projected next open top-five slot, beat the cutoff, catch the callsign immediately ahead (including first-achieved ties), or improve the leading callsign's own best. Every score-bearing target is the exact amount required to move ahead. Matchmaking locks the target across all three stages so concurrent clears cannot move the goalposts, then recomputes it only after the run fails or clears. Character Select and Results render exhaustive presentation-only copy plus the remaining gap, a score-met instruction appropriate to an active or failed run, or a completed `TARGET BEATEN`; missing metadata preserves old Daily/ordinary Gauntlet behavior. Multi-line Gauntlet briefings move the fighter grid down by their actual line count so forecasts and chase copy remain readable on desktop and mobile landscape. Combat, scoring, persistence writes, and deterministic Daily RNG are unchanged.

**Gauntlet Style Bonuses (Sessions 57–58):** a won stage converts the human's existing authoritative `KillFeedEntry` highlights into score: First Blood 50, Double Kill 100, Clutch 150, Triple Kill 200, From the Grave 250, and Mayhem 300. Each kill earns only its highest-priority eligible style award, following the medal ladder (`posthumous` before rapid-chain tiers, then Clutch, then First Blood), and the whole stage bonus caps at 600 so farming a long deathmatch cannot outweigh clearing the stage. Losses and draws bank zero. Matchmaking reads the completed Match kill feed; the client only itemizes the server result. `practiceGauntletStylePointsForKill` is the shared single-award source used by both the final aggregate and Gauntlet-only live callout decoration. The live copy says `IF CLEARED`, does not track a reconnect-unsafe client total, and never appears in Spar or PvP. `styleBonus` remains optional on the wire so older results render as zero. Do not change ordinary mode score, combat behavior, stats persistence, or medal presentation to support this bonus.

**Live combat stories (Session 12):** every `KillFeedEntry` authored by `Match.onKill` carries optional `killerStreak`, `victimStreakEnded`, and `isRevenge` context over the existing reliable `server:playerKilled` event. Current-life streaks live in `StatsTracker` and reset on death; `lastKillerByVictim` lives in the Match and defines payback as killing the opponent who most recently killed you. Client presentation is a pure projection (`combatCalloutFor`): shutdown of a 3+ streak takes priority, then payback, then 2/3/5-kill escalation from `COMBAT_CALLOUTS`. Keep the combat-callout HUD object separate from `eventBannerText` so kills cannot erase mutator/overtime/ability messaging.

**Rumble Lead Drama (Session 79):** matches that begin with 3+ fighters author an optional persistent `rumbleLead` snapshot during ACTIVE play. `Match` reads the highest existing mode score after `gameMode.onStart` and each mode tick, excludes disconnected fighters, sorts the full tied leader set, and increments its sequence only when that set changes. Sequence 0 is the silent opening baseline. The client emits only forward sequence edges, suppressing first-snapshot/reconnect replays plus duplicate or out-of-order packets, then projects sole-local, sole-rival, local-tie, rival-tie, or full-field-tie copy into the existing combat-callout lane. Keep the state server-authored and mode-agnostic; never teach the client scoring rules or let this presentation change scoring, balance, persistence, Crown state, or two-player matches.

**Rumble Grudges (Session 80):** at the end of a Rumble that began with 3+ fighters, `resolveRumbleGrudges` reads only the authoritative non-suicide kill feed and connected roster. Each fighter who suffered a knockout targets the connected opponent who knocked them out most; the latest kill-feed entry breaks a count tie, then player id is the final deterministic fallback. The complete map rides only on that result, while a direct group rematch carries only the local fighter's `rumbleGrudge` through draft/force paths into `server:matchFound`. Results and Character Select present the score to settle. Fresh queues and rounds that begin with two fighters author nothing; two connected survivors may still carry a prior group round's valid story into their direct rematch. Quick Match, Practice, lobby return, disconnect teardown, and rematch timeout carry no grudge. Keep it ephemeral and presentation-only: no marker, bonus, targeting rule, persistence, stats write, Crown change, score, combat, physics, or balance effect.

**Rumble Assists (Session 81):** only matches that begin with 3+ fighters run the match-scoped `RumbleAssistTracker`. Every authoritative attributed hit records its post-reduction damage against the victim on simulated match time. When an opponent knockout lands, one connected non-killer helper may earn credit for at least 20 damage inside the last 8 seconds; highest recent damage wins, latest hit breaks a tie, then player id. Death consumes that victim's ledger and disconnect removes a fighter from every ledger. Optional `KillFeedEntry.assistId`/`assistDamage` drive the local live callout, `PlayerStats.assists` drives K/A/D, and the outright assist leader may earn Wingman. The centralized attributed-damage path also records the existing `damageTaken` stat so Pincushion reflects real combat. Keep assists recognition-only: they never alter mode score, kill/death credit, streaks, contracts, Crown/Grudge state, persistence, matchmaking, healing, combat, physics, or balance. Two-player matches remain assist-free.

**Combat Medals (Sessions 25 + 40):** `Match.onKill` stamps First Blood, the killer's rolling rapid-kill count, whether the killer was already dead, and any living critical-health finish onto each `KillFeedEntry`. Rapid chains use simulated match time and the frozen `COMBAT_MEDALS.RAPID_KILL_WINDOW_SECONDS`, never `Date.now()`, so tick stalls and tests cannot change eligibility. A Clutch kill uses the killer's pre-heal HP and an inclusive `COMBAT_MEDALS.CLUTCH_HEALTH_FRACTION`; suicides and posthumous kills cannot earn it. The client remains a pure presenter: shutdown outranks From the Grave, which outranks Mayhem/Triple/Double Kill, Clutch, First Blood, payback, and ordinary streak copy. Earned medals reuse the dedicated combat-callout lane but add a small zoom pulse and pitch-shaped kill confirmation; they never change score, damage, healing, respawns, awards, or mode rules.

**Rusty difficulty (Session 13):** `BotDifficulty` is `rookie | scrapper | warlord`; `BOT_PROFILES` changes aim wobble plus fire/grenade/ability/path decision intervals only. Never scale player stats, weapon damage, movement, ammo, or rule cooldowns by bot difficulty. The lobby persists and sends the selected level on `client:startPractice`; `MatchmakingManager` validates it (Scrapper fallback), stores it by practice match, and carries it across direct rematches. Scrapper is the original Session 11 tuning and the compatibility default for old/malformed clients.

**Scrap Pit Rivals (Session 84):** `SCRAP_PIT_RIVALS` is the shared frozen source of callsign, tactic, and pre-fight role copy. Rusty uses the ordinary balanced nearest-threat/resource logic. Scrapjaw's `hunter` tactic targets the highest-scoring living opponent (distance then id break ties) and ignores optional loot unless critically wounded; explicit mode objectives, hazards, and the Bounty Hunt mark still outrank that personality. Clank's `scavenger` tactic uses the same value/expiry checks but may range ten tiles instead of six for ordinary resources. Tactics are orthogonal to `BotDifficulty` and only change target/detour decisions: never let them scale physics, health, damage, ammo, cooldowns, fire cadence, aim quality, score, persistence, or mode authority. Matchmaking derives controllers from the shared roster on fresh Scrap Pits and direct rematches; Spar and Gauntlet remain balanced.

**Scrap Pit Banter (Session 85):** every `SCRAP_PIT_RIVALS` entry also owns one approved `signatureTauntId`. Matchmaking registers those signatures only for a live `rusty_rumble`: after an accepted human taunt, the nearest living crew member who is off cooldown answers, with player id as the deterministic distance tie-break; when a registered crew member knocks out the unregistered human, `Match` queues that rival's signature in the same authoritative tick. Both paths must pass the existing live/alive/four-second simulation-time `tryTaunt` gate and reuse reliable `server:taunt`; never add free-form text, client-authored bot speech, a second cooldown, combat effects, score, persistence, or wire state. Registered crew do not answer one another. Ordinary Spar and Gauntlet Rusties remain autonomous-taunt free.

**Scrap Pit Records (Session 86):** `mmr_scrap_pit_record` is device-local cosmetic progression updated only when Results receives both `practiceKind === 'rusty_rumble'` and an authoritative completed `MatchResult`. It tracks rounds, wins, current consecutive wins, best run, and the last match id. Wins extend the run, draws preserve it, and losses reset it; `lastMatchId` makes scene recreation idempotent. Normalize malformed storage and cap impossible counts before rendering. Results owns the first-win/new-best/held/ended story, while the lobby's existing Scrap Pit button carries the compact career target. Never infer a win from client score text or let this record affect server persistence, lifetime PvP, matchmaking, AI, difficulty, combat, rewards, physics, score, rematch authority, or wire types.

**Crew Battle 2v2 (Sessions 88–89):** `client:startPractice.kind = 'crew_battle'` launches a four-fighter match with immutable server-authored `blue`/`red` assignments. `Match` owns teammate relationships, combined team score, overtime winner, and optional `winnerTeamId` / `playerTeams` / `teamScores` result fields. Friendly fire is disabled at both target acquisition and the centralized damage choke: hitscan, melee fans, shotgun pellets, axes, grenades, barrels, fire breath, and delayed explosives must skip teammates while self-damage stays legal. `BotController` may only select opponents. The client renders the server map as an `ALLY` marker, a two-score HUD, and grouped roster-authentic Results; it never infers teams from callsign or entry order.

`CREW_BATTLE_MODES` is the complete team-compatible allowlist: Deathmatch sums kills to 15; KOTH lets any number of allies hold together, preserves fractional progress across allied handoffs, and contests only when both sides enter; Kill Confirmed lets any ally deny a teammate's tag while only an opposing side confirms; Core Run sums individual carrier seconds to 45. KOTH, tag, and core targets resolve match end and overtime from combined side totals. Results must use the objective's real unit (`KOs`, `PTS`, `TAGS`, or `SEC`). A compatible favorite mode stays pinned; Random rotates through only this allowlist on direct rematches. An incompatible `FORCE_MODE` or stored favorite cannot bypass the allowlist. Rematches retain teams, bot identities, difficulty, and compatible Solo Chaos while rotating maps. Crew Battle is Practice: no lifetime stats, rivalry, mastery, leaderboard, Crown, or Grudge writes. Keep team support N-player-safe and do not add another mode until its scoring, possession, denial, end, overtime, bot, HUD, and Results semantics are explicit.

**Crew Tour (Session 90):** `mmr_crew_tour` is device-local motivation for the four-mode Crew allowlist. Results may update it only for `practiceKind === 'crew_battle'` after identifying the local side in an authoritative `duos` result. A win secures the current objective's unique patch and extends the win run; duplicate-mode wins extend only the run; draws preserve both; losses reset only the run. Four unique patches increment `toursCompleted` and clear the patch set for another tour. `lastMatchId` makes Results recreation idempotent. Normalize unknown modes, duplicates, impossible counts, streaks, and ids before rendering. The lobby, Character Select, and Results may present this record, but it must never affect matchmaking, mode choice, teams, bots, difficulty, combat, score, rematches, wire types, server persistence, or lifetime PvP progression. Never infer a win from rendered team totals; use `winnerTeamId` plus `playerTeams`.

**Crew Up (Session 91):** Crew Battle starts in a server-tick-owned six-second `CrewQueue` ally window. Two humans launch immediately on blue against Scrapjaw and Clank; one human at expiry launches with Rusty on blue against the original rivals. The first entrant is captain, so only their validated difficulty, compatible Crew mode, and compatible Solo Chaos preference author the match; a joiner contributes identity and fighter selection only. Queue membership is mutually exclusive with duel/Rumble queues. A direct rematch retains exact humans, bots, sides, and settings; bots auto-vote, but every human must vote. Any human departure dissolves a queued, pre-fight, active, or post-match Practice duo and returns survivors with `opponentDisconnected`. Status countdowns derive from server ticks, and Character Select derives ally copy only from authoritative `playerTeams`; never infer a human crew from callsigns, arrival order, or local preference state. The flow remains Practice and cannot write lifetime PvP progression.

**Blackout mutator (Session 15):** `blackout` is a rendering-only visibility rule in the shared mutator pool. The server schedules/broadcasts it like every other mutator but changes no authoritative combat state. `LightingRenderer` resolves the client-only preset from `lighting-profile.ts`: ambient darkness rises while each living local player keeps a 140px soft light pool; pickups, muzzle flashes, and explosions continue to reveal space. Never add remote-player light or hide HUD state, and pass `null` for the local light while dead.

Modes otherwise rotate DM → KOTH → GUN GAME → LAST STAND → KILL CONFIRMED → ONE IN THE CHAMBER → CORE RUN → BOUNTY HUNT per match (FORCE/no-draft path only), mirroring the map-rotation contract: fresh matches advance a global cursor in `MatchmakingManager`; a rematch plays the mode after the one just played (pinned at match end, shipped as `MatchResult.nextGameMode` — still populated for wire compat even though the draft overrides it in real play). `FORCE_MODE=<deathmatch|koth|gun_game|last_stand|kill_confirmed|one_in_the_chamber|core_run|bounty_hunt>` pins every match to one mode for manual smoke tests, and `FORCE_MATCH_SECONDS=<n>` pins regulation length (server-only; the client clock re-anchors from snapshots — used to reach long-tail states like late Gun Game rungs without full-length matches).

**Overtime (all modes):** when `determineWinner` reports a genuine tie at match end, the match enters 30s sudden-death overtime instead of ending — everyone respawns with a fresh single life (no respawns, live grenades cleared, no new mutators, hill retired), first kill wins, and a kill-less overtime is a true draw (`winnerId: null`). `MatchResult.wentToOvertime` drives the results-screen callout.

### Map System

Tile-based maps stored as JSON in `/shared/maps/`. Tile types: `floor`, `wall`, `cover_low`, `spawn_point`, `pickup_spawn`. Map fits entirely in viewport (no scrolling). Collision grid generated from tile data and used by both client (prediction) and server (authority). `cover_low` blocks movement, bullets, and explosion LOS. A grenade resolves damage against that intact grid, then destroys exposed low cover and decoration-backed interior solids inside `GRENADE.BLAST_RADIUS`; ordinary/perimeter walls remain immune, and Bruce's fire breath still destroys interior walls only. Both paths reuse the reliable `server:tilesDestroyed` event and mutate only the match-local collision grid.

Maps are visually themed: map JSON carries an optional `theme` id resolved client-side in `client/src/rendering/map-themes.ts` (floor/cover variant pools + auto-tiled wall styles; unknown ids fall back to the wasteland look), plus optional `decorations` — sprites (wrecked cars, containers, explosive barrels, wire gates, scavenger caches) centered on tile rects whose underlying tiles carry collision. Theme and decoration art stay client-only; the server uses each decoration rect to group its backing solid cells as one atomic destructible prop, recognizes `hazard: "explosive_barrel"` as a one-cell shot-triggered chain reaction, and recognizes `interaction: "shootable_gate"` as a one-cell interior wall that bullets, blasts, or Bruce's fire breath permanently open. Gates reuse the reliable tile-destruction event and live collision grid; the client reverses the seven-frame closing strip and leaves its open frame visible.

**Scavenger Caches (Session 34):** every shipped arena has one rotational pair of red one-cell caches backed by `COVER_LOW`. Ordinary rifle/pistol/shotgun scenery hits and exposed grenade/barrel blasts open them through the existing authoritative tile-destruction path; piercing shots, punches, and Bruce's wall-only fire cone retain their existing semantics. `selectScavengerCacheReward()` hashes the match id without consuming gameplay RNG and gives every cache in that round the same weighted reward (ammo, bandage, grenade, rare pistol/shotgun), filtered through the mode's pickup contract. Late loadout-owning mutators substitute sustain rather than spawning unusable gear. `PickupManager.spawnOneShot()` keeps a collected cache reward inactive for one snapshot so typed collection audio still works, then deletes it permanently—cache loot never respawns or emits the shotgun incoming announcement.

Map JSON also carries `kothHills` — top-left tiles of the 2×2 King of the Hill zones, in relocation order. The validator checks bounds/walkability (≥3 entries when present); the registry requires every shipped map to declare them, because mode rotation can put KOTH on any map.

Six arenas ship in registry order: Wasteland Outpost, Overgrown Suburb, Scrapyard, Collapsed Overpass, Checkpoint Zero, and Rusted Refinery. Collapsed Overpass uses the `overpass` theme, six hill locations, heavy central supports, and open outer loops. Checkpoint Zero uses the `checkpoint` theme, rotationally paired gates/props, and dense horizontal plus vertical low-cover lanes. Rusted Refinery uses the `refinery` theme, a red-roofed central power vault with open north/south approaches, and two diagonal shootable side gates. All three create destructible route choices without introducing map-only collision rules.

**Rusted Refinery (Session 73):** the 20×12 arena is exactly rotationally symmetric at the tile layer, with four paired spawns, five legal KOTH sites, the standard pickup economy, and rotational pairs of barrels, caches, and gates. Its open north/south vault approaches provide stable primary routes while the shootable diagonal gates create optional east/west shortcuts. The `refinery` theme is presentation-only and reuses the reinforced barricade treatment; collision, destruction, spawn validation, bot navigation, and mode behavior stay on the shared map contracts.

**Arena Mastery (Session 74):** each persistent player record owns a complete, registry-keyed `arenaWins` map. Only the authoritative winner of a real match advances the played arena; Practice, draws, losses, and unknown arena names never do. Loading normalizes old or malformed saves against the current registry, dropping removed names and zero-filling newly shipped arenas. Draft snapshots carry optional per-player records so old clients remain compatible; the client renders those server-owned totals as a 1v1 comparison or an N-player-safe field best. Match results attach each player's previous/current arena wins for promotion copy, but tiers are cosmetic and never influence draft authority, matchmaking, spawns, combat, physics, balance, or scoring. When adding a map, preserve the registry-derived default/migration path and the full six-map/eight-mode draft layout.

**Readable Barricades (Session 64):** themes opt into `coverStyle: 'tile' | 'barricade'`. Barricade sources are 16×14, scale to 48×42 instead of stretching to a square, and rotate 90 degrees when neighboring `COVER_LOW` cells form a stronger vertical run. The pure `coverBarricadeAngle()` helper owns that deterministic presentation choice; backing tiles, destruction, collision, and network state remain unchanged. Checkpoint Zero uses reinforced barricades, while Overgrown Suburb uses the wooden variant for its undecorated low cover.

Map choice is player-drafted per match since Session 9 (see the pre-match draft under Game Mode Abstraction). The old round-robin rotation (`shared/src/maps/registry.ts` registry order, global cursor for fresh matches, rematch pinned via `MatchResult.nextMapName`) only runs on the FORCE/no-draft path. `FORCE_MAP=<map name>` pins every match to one map for manual smoke tests and skips the draft.

## Code Conventions

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- No `any` — use `unknown` + type narrowing if the type isn't known
- Shared types are pure (no runtime dependencies) and live in `/shared/types/`
- Prefer discriminated unions for message types (tagged with a `type` field)
- Use `as const` and `Object.freeze()` for game constants

### File Organization

- One module per file, named to match its primary export
- Test files co-located with source: `foo.ts` -> `foo.test.ts`
- Barrel exports (`index.ts`) at package boundaries only, not in every directory

### Naming

- Files: `kebab-case.ts`
- Classes/Interfaces/Types: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for primitive config values, `PascalCase` for frozen objects
- Event names: `camelCase` strings (e.g., `playerConnected`, `matchStarted`)

### Imports

- Shared package imported as `@shared/...` (workspace alias)
- Order: node builtins -> external packages -> `@shared` -> relative imports
- No circular imports between packages

## Git Conventions

- **Workflow:** Solo hobby project — commit and push directly to `main`. No feature branches, no PRs. Don't propose a PR-based alternative.
- **Commits:** Conventional Commits format — `feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`
  - Scope is optional but encouraged: `feat(server): add lag compensation rewind buffer`

## Testing Guidelines

### Unit Tests (Vitest)

- **Coverage target:** 80% overall, 90%+ on server game logic and shared utils
- Shared utils: 100% coverage, fully deterministic (no randomness or floating-point ambiguity)
- Mock/stub Phaser for client unit tests — don't import the full engine
- Test file naming: `*.test.ts`

### Integration Tests

- Use real Geckos.io server with mock clients
- Clean up server and connections after each test
- Longer timeouts acceptable for network tests

### E2E Tests (Playwright)

- Test both desktop (1920x1080) and mobile landscape viewports
- Use custom fixtures: `gamePage`, `lobbyPage`
- Visual regression snapshots for key screens
- Retry logic for timing-sensitive assertions (network variability)
- Video recording on failure for debugging

## Critical Rules

1. **Shared physics are sacred.** Movement, collision, stamina, and damage functions live in `/shared` and are used identically by client and server. Never duplicate or fork this logic.
2. **Don't break the tick loop.** Server tick processing must complete well within the tick budget (50ms at 20 ticks/sec). No blocking I/O, no heavy computation in the tick path. Profile if adding logic to the tick.
3. **Network messages use discriminated unions.** All `ClientMessage` and `ServerMessage` types have a `type` field. Add new message types to the shared union — don't use untyped strings or ad-hoc formats.
4. **Game constants are centralized.** All balance values (speeds, damage, timers, etc.) live in `/shared/config/game.ts` as frozen objects. Never hardcode magic numbers in client or server code.
5. **Inputs carry sequence numbers.** Every player input gets a monotonically increasing sequence number. This is how reconciliation works — the server tells the client "I've processed up to input #N", and the client replays everything after N. Don't strip or skip sequence numbers.
6. **Interpolation is one tick behind.** Entity interpolation intentionally renders other players slightly in the past to ensure a smooth buffer of states. This is by design, not a bug.
7. **Rewind state is never broadcast.** The server's lag compensation rewind buffer is internal only — used to validate hits, never sent to clients.
8. **Test determinism matters.** Game logic tests must be deterministic. Seed any randomness. Avoid floating-point comparisons without epsilon tolerance.
9. **Mobile is first-class.** Touch controls (dual floating joysticks) are not an afterthought. HUD must work on mobile. Layout must be responsive in landscape. Test on mobile viewports.
10. **Environment config via `.env` files.** Ports, server URLs, API keys — all configurable via environment variables. Commit `.env.example`, never `.env`.

## Common Pitfalls

- **Forgetting to update shared types when adding a network message.** If you add a new server->client or client->server message, add it to the discriminated union in `/shared/types/network.ts`. The TypeScript compiler will then flag any unhandled cases. For client->server messages there is a SECOND registration point: the wire allowlist in `server/src/network/server.ts` (`CLIENT_MESSAGE_TYPE_FLAGS`) silently drops unregistered types before any handler runs. It's typed as an exhaustive Record over `ClientMessage['type']`, so `pnpm typecheck` catches a missing entry — but only if the union was updated first.
- **Using `setTimeout`/`setInterval` naively for the game loop.** The server tick loop needs drift compensation. A simple `setInterval(fn, 50)` will drift. Use high-resolution timing.
- **Modifying physics in only one place.** If you touch movement speed, collision, or stamina logic, check that you changed `/shared` (not a client-only or server-only copy). Grep for the function name to verify it's only defined once.
- **Blocking the server tick with async operations.** Database calls, file I/O, HTTP requests — none of these belong in the tick loop. Handle them outside the tick and queue results.
- **Don't gate touch-input behavior on `pointer.wasTouch`.** Phaser's `Pointer.wasTouch` flag is unreliable across mobile browsers — particularly when `dom.createContainer: true` is set. Use `isTouchDevice()` (`client/src/input/is-touch-device.ts`) for capability detection and branch on that instead.
- **Hardcoding 2 players.** The matchmaking, game state, and rendering support N players. Use `Map<playerId, PlayerState>` patterns, not `player1`/`player2` fields.
- **Ignoring browser autoplay policy for audio.** Audio can't play until the user has interacted with the page. The AudioManager must handle this gracefully.

## Reference Links

- [Valve Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) — the foundational article for this game's netcode approach
- [Geckos.io docs](https://github.com/geckosio/geckos.io) — WebRTC networking library
- [Phaser 3 docs](https://photonstorm.github.io/phaser3-docs/) — game engine
- User stories and full spec: `USER_STORIES.md` in repo root
- Replayability build plan (multi-session, in progress): `docs/REPLAYABILITY_ROADMAP.md` — read it before working on weapons, modes, maps, mutators, characters, or stats/awards
