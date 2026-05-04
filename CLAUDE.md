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

```bash
gcloud compute ssh deploy@mighty-mans-server --zone=us-east1-b --command="\
  sudo -u rybes bash -c 'set -e; \
    cd /opt/mighty-mans-revenge && \
    git pull --ff-only && \
    pnpm install --frozen-lockfile && \
    pnpm --filter @game/server build && \
    pm2 restart mighty-mans-revenge'"

# Health check (tickRate, connections, activeMatches in JSON):
curl http://34.24.140.207:3001/health
```

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

### N-Player Architecture

The game launches as 1v1 but is architected for N players. Use arrays/maps of players everywhere — never hardcode `player1`/`player2` or assume exactly 2 players. Matchmaking, game state, and rendering must all support variable player counts.

### Game Mode Abstraction

Match logic is behind a `GameMode` interface (`onStart`, `onKill`, `onTick`, `isMatchOver`, `getResults`). Only `DeathmatchMode` exists now. New modes = new class + registry entry, no core changes.

### Map System

Tile-based maps stored as JSON in `/shared/maps/`. Tile types: `floor`, `wall`, `cover_low`, `spawn_point`, `pickup_spawn`. Map fits entirely in viewport (no scrolling). Collision grid generated from tile data and used by both client (prediction) and server (authority).

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

- **Forgetting to update shared types when adding a network message.** If you add a new server->client or client->server message, add it to the discriminated union in `/shared/types/network.ts`. The TypeScript compiler will then flag any unhandled cases.
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
