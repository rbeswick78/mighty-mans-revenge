# Mighty Man's Revenge

Post-apocalyptic 1v1 retro shooter (late 1980s pixel art). Authoritative server with full latency compensation. Built for <10 friends in the NY/NJ area.

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

**Persistent state on the VM:** lifetime player stats and head-to-head
records live in `/opt/mighty-mans-revenge/server/data/persistent-stats.json`
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

### Why This Matters for Agents

Client prediction and server simulation **must use identical physics code** from `/shared`. If you change movement, collision, or physics logic, you must change it in `/shared` and verify both client and server still agree. A mismatch between client prediction and server authority causes visible rubber-banding.

Movement modifiers (per-character speed × active mutators × second-wind boost) are folded by the shared `playerMovementModifiers()` in `shared/src/utils/event-modifiers.ts` — the ONE function all three movement call sites use (server input loop, client prediction, client reconciliation). Never compute a speed multiplier anywhere else.

### Characters

The 5-character roster lives in `CHARACTERS` (`shared/src/config/game.ts`) with per-character stat identities: `maxHealth` (committed onto PlayerState at select lock), `speedMultiplier` (via `playerMovementModifiers`), and `hitbox` — the **hit-validation AABB only** (bullets/pellets/fire breath/axes, live and lag-comp-rewound alike; derive via `characterHitbox()`). Movement collision intentionally stays `PLAYER.HITBOX_*` for everyone (same contract as the big_heads mutator), so map geometry plays identically across the roster. Abilities: Mighty Man x-ray, Bruce fire breath, Frost Wizard freeze, Bubba Iron Hide (50% damage reduction, applied inside `CombatManager.applyDamage` — the single damage choke point; callers must consume the returned `damageApplied` for stats/vampire), Jack Axe Throw (server-simulated projectile like grenades; client throw/landing FX ride the message-granularity `axeThrown`/`axeResolved` events because a point-blank flight can span a single snapshot).

Character presentation is registry-driven for idle, run, attack, and death sheets. The pack only supplies horizontal death facings, so `deathDirectionForAim()` projects the authoritative aim onto side/side-left. `PlayerRenderer.updateLifeState()` owns the alive/dead edge: play the death sheet once, hide living-only cosmetics/name/health, hold the final corpse frame through the server respawn timer, then restore the current body/weapon state on respawn. Never drive visibility directly from every snapshot or the animation will disappear/restart. Jack's alt body declares its own no-axe death sheets; Frost Wizard shares Mighty Man's death art and keeps its tint.

**Weapons** live in `WEAPONS` (`shared/src/config/game.ts`): rifle (always carried), shotgun (announced power-weapon map pickup, special slot), pistol (silent sidegrade map pickup in DM/KOTH — spawns active at match start, never announced — plus a Gun Game rung; shares the special slot, last-picked-up wins), and punch — flat-damage melee validated as `pelletCount` deterministic even-fan rays (`evenFanAngles`, NO jitter) through the same lag-comp rewind as every gun, with `WeaponDef.maxRange` hard-capping ray length (without it rays extend to `falloffRangeMax * 2`). One damage application per victim per swing; a swing can hit multiple victims. Punch swings broadcast as the transient `punches` array on gameState (delivery like `bulletTrails`); the client plays per-character body-level attack animations (`CharacterDef.attackFrames`/`attackFrameCount`, playback normalized to ~350ms regardless of frame count).

Bullet trails also carry authoritative player-hit confirmation. Every trail begins with `hitPlayerId: null` and `damageApplied: 0`; `Match` stamps both only after `CombatManager.applyDamage()` succeeds, using its post-mitigation amount. The client must never infer a fighter hit from the ray endpoint. Confirmed trails play the curated player-hit splash at bullet-arrival time and only the local shooter hears the confirmation tick; misses and scenery hits keep the spark/dust/decal path. Shotgun pellets may each render a splash, but collapse to one confirmation sound per blast.

### N-Player Architecture

The game launches as 1v1 but is architected for N players. Use arrays/maps of players everywhere — never hardcode `player1`/`player2` or assume exactly 2 players. Matchmaking, game state, and rendering must all support variable player counts.

### Game Mode Abstraction

Match logic is behind a `GameMode` interface (`onStart`, `onKill(…, weapon)`, `onTick`, `isMatchOver`, `getResults`, `determineWinner`, plus optional objective/lifecycle hooks). Six modes exist: `DeathmatchMode`, `KothMode` (King of the Hill — 1 hill point per full second as sole living occupant, contested = nobody scores, hill relocates round-robin through the map's `kothHills` every 25s, first to 60 or highest at time-out; hill points ride in `PlayerState.score`), `GunGameMode`, `LastStandMode`, `KillConfirmedMode`, and `OneInTheChamberMode` (see below). New modes = new class + registry entry; use optional hooks when a rule must affect core lifecycle or serialized objective state.

Every `GAME_MODES` entry also owns a short `objective` string. `GameScene` presents that shared copy beneath the 3/2/1 countdown and fades it with `FIGHT`, so a new or returning player learns the selected win condition before control begins. Keep this copy concise enough for mobile landscape and update it whenever a mode's victory rule changes.

**Gun Game:** every kill made WITH YOUR CURRENT RUNG WEAPON marches you down the ladder rifle → shotgun → pistol → grenades → punch (`GUN_GAME` in shared config: `RUNG_KILLS` [2,2,2,2,1]); the first player through the final rung wins immediately. `PlayerState.score` = total ladder kills; the pure helpers in `shared/src/utils/gun-game.ts` (`gunGameRungForScore`) derive the rung on both server (loadout enforcement in `onTick`) and client (HUD ladder) — never store rung state separately. Ability kills (axe/fire) and self-kills don't advance; no demotion. The mode excludes the `grenades_only`/`infinite_ammo`/`fists_only`/`weapon_roulette` mutators from random rolls, disables all pickups except bandages, gates gun fire on the grenade rung (`areGunsDisabled`), and keeps ammo reserves floored so no rung can strand a player.

**Last Stand:** every fighter starts with 5 lives (`LAST_STAND.STARTING_LIVES`); every death, including a suicide, removes one. `PlayerState.score` = remaining lives, so the existing score wire contract and results ordering stay intact. Dead fighters respawn while their score is positive; zero-life fighters remain eliminated spectators in N-player matches. The last contender wins immediately, while a tied regulation clock uses normal sudden-death overtime and excludes already-eliminated fighters. The client labels the shared score as lives and replaces the respawn countdown with `ELIMINATED` when the local stock reaches zero.

**Kill Confirmed:** deaths create 20-second contested dog tags at the victim's authoritative position. Any living opponent who enters the 30px collection radius banks one point; the owner can recover the tag to deny that point. First to 8 confirmations wins, and tied regulation uses normal sudden-death overtime with all tags retired. `KillConfirmedTagState` rides in each game-state snapshot; one-tick `KillConfirmedCollection` events drive CONFIRMED/DENIED callouts and pickup-rate SFX without client inference. Rusty prioritizes the nearest tag, even while no living combat target exists. Tags and scores are N-player safe; a third player may confirm any non-owned tag.

**One in the Chamber:** every fighter receives exactly one lethal pistol round on match start, respawn, and opponent kill; missing swaps the dry special slot to lethal punch until a direct or pistol-triggered barrel kill earns the round back. First to 8 wins. `OneInTheChamberMode` owns the economy through existing `PlayerState.weaponId`/special-ammo fields, leaves only bandage pickups, disables grenades and character abilities server-side, and re-chambers the normal rifle reset on respawn/overtime before the next snapshot. Its direct-hit damage hook runs only after ordinary lag-comp validation and still routes through `CombatManager.applyDamage`. Random rolls exclude loadout owners plus redundant `low_health`, `vampire`, and `turbo_grenades`; FORCE pins intentionally bypass that safety. Client input also suppresses disabled secondary actions, while the HUD derives loaded/fists/pending states from authoritative snapshots.

**Pre-match map/mode draft (Session 9):** every real match — fresh AND rematch — opens with a player draft instead of blind rotation. It lives in `MatchmakingManager` BEFORE `Match` construction (Match takes mapData/gameMode in its constructor): the server rolls who picks first (injectable RNG), that player claims a category implicitly by picking EITHER a map or a mode (`client:draftPick`), the other player picks the remaining category, then the Match is created and `server:matchFound` ships the final map+mode exactly as before. `server:draftState` broadcasts a full snapshot per tick while drafting (same cadence contract as characterSelectState); pick timeouts auto-random (`DRAFT` block in shared config); a disconnect tears the draft down. The client's `DraftScene` sits between lobby/results and character select. **Setting `FORCE_MAP` or `FORCE_MODE` skips the draft entirely** — that's the smoke-pin path AND the kill switch, and it's the only path where the old rotation cursors still run.

**Rivalry Sets + Revenge Drafts (Session 10):** consecutive 1v1 rematches form an ephemeral first-to-3 set (`RIVALRY_SET.WINS_TO_CLINCH`). `MatchmakingManager` owns the set state outside individual `Match` instances, attaches a full `MatchResult.rivalrySet` snapshot at every match end, resets it when the pairing leaves results or starts again after a clinch, and never persists it into lifetime stats. After a decisive round, the loser is `server:draftState.firstPickerId` with `firstPickerReason: 'revenge'`; a draw or fresh pairing uses the seeded coin-toss roll. The ResultsScene shows set score/champion plus the lifetime rivalry, and DraftScene uses a shorter revenge reveal instead of pretending the result was random. FORCE pins still skip every draft, but set scoring continues.

**Fresh-chaos rematches (Session 16):** `PostMatchState.previousMutators` captures the completed round's active pair and carries it through either the revenge draft or direct Practice/FORCE rematch into `Match.rematchMutatorExclusions`. Random mid-match and final-minute rolls exclude both values in addition to mode exclusions and within-match duplication. Explicit `FORCE_EVENT` / `FORCE_MIDMATCH_MUTATOR` pins are evaluated first and intentionally bypass recency. The memory exists only across a direct rematch; returning to the lobby creates a clean pairing.

**Wasteland Contracts (Session 24):** every Match selects one shared optional side objective from `MATCH_CONTRACTS` without consuming gameplay RNG. The server derives per-player progress from authoritative match stats, objective score, and barrel triggers, broadcasts `MatchContractHudState` every snapshot, and attaches final progress to `MatchResult.contract`. Contracts never alter score, damage, pickups, movement, win conditions, or awards. Non-Practice completions increment `LifetimePlayerStats.contractsCompleted`; old version-1 files back-fill zero. Direct rematches exclude the previous contract, while `FORCE_CONTRACT=<id>` is a smoke pin that intentionally bypasses recency. The HUD contract card/completion callout has a dedicated lane and must not reuse mutator/overtime or streak callout objects.

**Wasteland Reputation (Session 26):** lifetime contract completions project into the frozen `CAREER_RANKS` ladder: Drifter, Scavenger, Road Dog, Marauder, Wasteland Veteran, and Legend of the Waste. Rank is derived at presentation time rather than persisted, so existing stats files need no migration and future threshold tuning cannot strand stored state. The lobby leaderboard shows each player's compact three-letter badge, while ResultsScene shows progress toward the next threshold or a one-round `RANK UP!` celebration when a completed contract crosses it. Practice and old partial results intentionally show no reputation progress. Reputation is cosmetic and never changes matchmaking, combat, contract selection, or scoring.

**Hot Streaks (Session 27):** each persisted `LifetimePlayerStats` record carries `currentWinStreak` and `bestWinStreak`, back-filled to zero when loading older version-1 files. A real-match win extends the current run and personal best, a loss resets only the current run, and a draw preserves both. `MatchmakingManager` captures the before/after values around the synchronous in-memory `recordMatch` update and attaches optional per-player `MatchResult.winStreaks`; Practice skips the store and the field entirely. ResultsScene projects those snapshots beneath each nickname as active, new-best, held, ended, or quiet copy. Streaks never affect matchmaking, draft order, rivalry sets, scoring, or combat.

**Fighter Mastery (Session 28):** `LifetimePlayerStats.characterWins` is a complete `Record<CharacterId, number>` back-filled from `createEmptyCharacterWins()` for older version-1 files. Only a real-match winner gains one win for the fighter locked on that match; losses and draws add none, while Practice may display existing mastery but never writes it. Each reliable per-player `server:matchFound` carries only that local nickname's totals, normalized against the full roster before `GameService` caches them. CharacterSelectScene derives Untested (0), Blooded (1), Proven (3), Veteran (7), or Master (15) from the frozen `CHARACTER_MASTERY_TIERS` and shows current/next progress on every card. Mastery never changes stats, selection locks, abilities, draft order, matchmaking, or combat.

**Fists Only (Session 29):** `fists_only` is a shared mutator that turns every active fighter's core loadout into punch, clears grenades and special ammo, and reasserts that authoritative loadout after mode hooks, respawns, and pickup collection. Character abilities remain available so fighter identity survives the brawl. Random scheduling treats `fists_only` and `grenades_only` as a symmetric conflict and Gun Game excludes fists from random rolls; explicit FORCE pins still intentionally bypass those safety rules. Rusty's punch movement target is derived from `WEAPONS.punch.maxRange`, so a melee-equipped bot closes into swing range instead of holding rifle spacing. Outside an active Fists Only mutator, weapon balance, physics, and bot ranged spacing are unchanged.

**Weapon Roulette (Session 30):** `weapon_roulette` is a fair shared-loadout mutator: every fighter receives shotgun → pistol → punch → rifle in the frozen `MUTATORS.WEAPON_ROULETTE_ORDER`, with a synchronized 10-second step timer and equal ammo restocks only on activation or step changes. A dry special weapon stays equipped until the next step instead of reverting and refilling itself. Respawns and compatible mode hooks are corrected before snapshots; gun-ammo and weapon pickups are retired on activation because the mutator owns that economy, while grenades, healing, and abilities stay live. Client callouts are derived from authoritative local `weaponId` edges. Random scheduling prevents any pair among `weapon_roulette`, `fists_only`, and `grenades_only`; Gun Game excludes Roulette, and explicit FORCE pins still bypass those safeguards for smoke testing.

**Solo Practice vs Rusty (Session 11):** `client:startPractice` bypasses the human queue/draft and creates a normal authoritative `Match` with one synthetic `bot:<uuid>` player. `BotController` submits sequenced `PlayerInput` through the same queue as clients; it uses the shared collision grid for deterministic BFS, shared raycasts for sightlines, ordinary weapon/grenade/ability controls, Gun Game rung helpers, and the live KOTH state for objective movement. Never special-case bot damage or physics. Practice rematches auto-accept for the bot and rotate directly through `MatchResult.nextMapName` / `nextGameMode`, retaining ephemeral Rivalry Set scoring. `MatchResult.isPractice` is the client/wire marker; practice must skip every `PersistentStatsStore` and leaderboard write, and all teardown paths must release the synthetic identity.

**Live combat stories (Session 12):** every `KillFeedEntry` authored by `Match.onKill` carries optional `killerStreak`, `victimStreakEnded`, and `isRevenge` context over the existing reliable `server:playerKilled` event. Current-life streaks live in `StatsTracker` and reset on death; `lastKillerByVictim` lives in the Match and defines payback as killing the opponent who most recently killed you. Client presentation is a pure projection (`combatCalloutFor`): shutdown of a 3+ streak takes priority, then payback, then 2/3/5-kill escalation from `COMBAT_CALLOUTS`. Keep the combat-callout HUD object separate from `eventBannerText` so kills cannot erase mutator/overtime/ability messaging.

**Combat Medals (Session 25):** `Match.onKill` also stamps First Blood, the killer's rolling rapid-kill count, and whether the killer was already dead onto each `KillFeedEntry`. Rapid chains use simulated match time and the frozen `COMBAT_MEDALS.RAPID_KILL_WINDOW_SECONDS`, never `Date.now()`, so tick stalls and tests cannot change eligibility. Suicides claim no medal and never consume First Blood. The client remains a pure presenter: shutdown outranks From the Grave, which outranks Mayhem/Triple/Double Kill, then First Blood, payback, and ordinary streak copy. Earned medals reuse the dedicated combat-callout lane but add a small zoom pulse and pitch-shaped kill confirmation; they never change score, damage, healing, respawns, awards, or mode rules.

**Rusty difficulty (Session 13):** `BotDifficulty` is `rookie | scrapper | warlord`; `BOT_PROFILES` changes aim wobble plus fire/grenade/ability/path decision intervals only. Never scale player stats, weapon damage, movement, ammo, or rule cooldowns by bot difficulty. The lobby persists and sends the selected level on `client:startPractice`; `MatchmakingManager` validates it (Scrapper fallback), stores it by practice match, and carries it across direct rematches. Scrapper is the original Session 11 tuning and the compatibility default for old/malformed clients.

**Blackout mutator (Session 15):** `blackout` is a rendering-only visibility rule in the shared mutator pool. The server schedules/broadcasts it like every other mutator but changes no authoritative combat state. `LightingRenderer` resolves the client-only preset from `lighting-profile.ts`: ambient darkness rises while each living local player keeps a 140px soft light pool; pickups, muzzle flashes, and explosions continue to reveal space. Never add remote-player light or hide HUD state, and pass `null` for the local light while dead.

Modes otherwise rotate DM → KOTH → GUN GAME → LAST STAND → KILL CONFIRMED → ONE IN THE CHAMBER per match (FORCE/no-draft path only), mirroring the map-rotation contract: fresh matches advance a global cursor in `MatchmakingManager`; a rematch plays the mode after the one just played (pinned at match end, shipped as `MatchResult.nextGameMode` — still populated for wire compat even though the draft overrides it in real play). `FORCE_MODE=<deathmatch|koth|gun_game|last_stand|kill_confirmed|one_in_the_chamber>` pins every match to one mode for manual smoke tests, and `FORCE_MATCH_SECONDS=<n>` pins regulation length (server-only; the client clock re-anchors from snapshots — used to reach long-tail states like late Gun Game rungs without full-length matches).

**Overtime (all modes):** when `determineWinner` reports a genuine tie at match end, the match enters 30s sudden-death overtime instead of ending — everyone respawns with a fresh single life (no respawns, live grenades cleared, no new mutators, hill retired), first kill wins, and a kill-less overtime is a true draw (`winnerId: null`). `MatchResult.wentToOvertime` drives the results-screen callout.

### Map System

Tile-based maps stored as JSON in `/shared/maps/`. Tile types: `floor`, `wall`, `cover_low`, `spawn_point`, `pickup_spawn`. Map fits entirely in viewport (no scrolling). Collision grid generated from tile data and used by both client (prediction) and server (authority). `cover_low` blocks movement, bullets, and explosion LOS. A grenade resolves damage against that intact grid, then destroys exposed low cover and decoration-backed interior solids inside `GRENADE.BLAST_RADIUS`; ordinary/perimeter walls remain immune, and Bruce's fire breath still destroys interior walls only. Both paths reuse the reliable `server:tilesDestroyed` event and mutate only the match-local collision grid.

Maps are visually themed: map JSON carries an optional `theme` id resolved client-side in `client/src/rendering/map-themes.ts` (floor/cover variant pools + auto-tiled wall styles; unknown ids fall back to the wasteland look), plus optional `decorations` — sprites (wrecked cars, containers, explosive barrels, wire gates) centered on tile rects whose underlying tiles carry collision. Theme and decoration art stay client-only; the server uses each decoration rect to group its backing solid cells as one atomic destructible prop, recognizes `hazard: "explosive_barrel"` as a one-cell shot-triggered chain reaction, and recognizes `interaction: "shootable_gate"` as a one-cell interior wall that bullets, blasts, or Bruce's fire breath permanently open. Gates reuse the reliable tile-destruction event and live collision grid; the client reverses the seven-frame closing strip and leaves its open frame visible.

Map JSON also carries `kothHills` — top-left tiles of the 2×2 King of the Hill zones, in relocation order. The validator checks bounds/walkability (≥3 entries when present); the registry requires every shipped map to declare them, because mode rotation can put KOTH on any map.

Four arenas ship in registry order: Wasteland Outpost, Overgrown Suburb, Scrapyard, and Collapsed Overpass. Collapsed Overpass uses the `overpass` theme, six hill locations, heavy central supports, and open outer loops to create a riskier center-control map without introducing map-only collision rules or assets.

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
