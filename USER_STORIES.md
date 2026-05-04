# Mighty Man's Revenge — User Stories

> A post-apocalyptic sci-fi retro shooter built with Phaser.js, Node.js, and Geckos.io.
> Late 1980s pixel art aesthetic. Authoritative server with full latency compensation.

---

## How to Read This Document

- Stories are grouped into **Epics** (major feature areas)
- Each story follows the format: `As a [role], I want [goal], so that [benefit]`
- **Size labels**: S (< half day), M (half day–1 day), L (1–2 days)
- **Priority**: P0 (must-have for MVP), P1 (important), P2 (nice-to-have)
- **Acceptance criteria** are listed under each story
- Stories are ordered within each epic by dependency — earlier stories generally unblock later ones
- Stories are scoped for implementation by Claude Agent Teams, with each story suitable for a single teammate

---

## Epic 1: Project Scaffolding & Dev Environment

### 1.1 — Initialize Monorepo Structure (S, P0)
**As a** developer, **I want** a well-organized monorepo with client and server packages, **so that** the codebase is maintainable and agents can work on client/server independently.

**Acceptance Criteria:**
- Root `package.json` with workspace configuration
- `/client` directory with Phaser.js + Vite setup (TypeScript)
- `/server` directory with Node.js + TypeScript setup
- `/shared` directory for types, constants, and game config shared between client and server
- `.gitignore` configured for Node.js, build artifacts, and environment files
- `tsconfig.json` at root and per-package with project references
- ESLint and Prettier configured at root with shared rules
- All packages install and build without errors

### 1.2 — Configure Git Repository & Branch Strategy (S, P0)
**As a** developer, **I want** a properly configured Git repo with branch protections and conventional commits, **so that** the codebase stays clean as multiple agents contribute.

**Acceptance Criteria:**
- Git repo initialized and pushed to GitHub
- `main` branch created and set as default
- `.github/CODEOWNERS` file created
- Branch naming convention documented: `feature/`, `fix/`, `chore/`
- Commit message convention documented (Conventional Commits)
- `CLAUDE.md` at repo root with project conventions, build commands, and testing instructions for agent sessions

### 1.3 — Configure GitHub Actions CI Pipeline (M, P0)
**As a** developer, **I want** CI that runs on every PR, **so that** broken code never reaches `main`.

**Acceptance Criteria:**
- GitHub Actions workflow triggers on PR to `main` and on push to `main`
- Pipeline runs: lint, type-check, unit tests (Vitest), integration tests, Playwright E2E tests
- Pipeline runs for both `/client` and `/server` packages
- Build step produces deployable artifacts
- CI status check required before PR merge
- Workflow uses caching for `node_modules` to speed up runs

### 1.4 — Configure Local Development Environment (S, P0)
**As a** developer, **I want** a single command to start both client and server in dev mode, **so that** local development is frictionless.

**Acceptance Criteria:**
- `npm run dev` at root starts both client (Vite dev server) and game server concurrently
- Hot module reload works on client
- Server restarts on file changes (using `tsx watch` or similar)
- Environment variables loaded from `.env` files (with `.env.example` committed)
- Ports are configurable via environment variables
- Console output from client and server are clearly labeled

---

## Epic 2: Shared Game Configuration & Types

### 2.1 — Define Shared Game Constants & Configuration (S, P0)
**As a** developer, **I want** a single source of truth for game balance values and configuration, **so that** client and server always agree on game rules.

**Acceptance Criteria:**
- `/shared/config/game.ts` with all balance constants:
  - Player: base speed, sprint speed, sprint duration, sprint recharge rate, max health
  - Gun: damage (min/max), falloff range (min/max), fire rate, magazine size, reload time
  - Grenade: damage, blast radius, fuse time, max carry capacity
  - Ammo pickups: gun ammo amount, grenade amount, respawn timer
  - Respawn: respawn delay, invulnerability duration
  - Match: kill target for win, time limit
- Tick rate constant (e.g., 20 ticks/sec)
- Map tile size constant
- All values exported as frozen objects

### 2.2 — Define Shared TypeScript Types & Interfaces (S, P0)
**As a** developer, **I want** shared type definitions for all network messages and game state, **so that** client and server have compile-time safety on their communication protocol.

**Acceptance Criteria:**
- `/shared/types/` directory with:
  - `player.ts`: PlayerState, PlayerInput, PlayerStats
  - `projectile.ts`: BulletState, GrenadeState
  - `pickup.ts`: PickupState, PickupType
  - `game.ts`: GameState, MatchState, MatchResult, GameMode enum
  - `network.ts`: All message types (ClientMessage, ServerMessage) as discriminated unions
  - `map.ts`: TileType enum, MapData, CollisionGrid
  - `lobby.ts`: LobbyPlayer, LobbyState, MatchmakingStatus
- All types are pure (no runtime dependencies)
- Types support N-player architecture (arrays/maps of players, not hardcoded player1/player2)

### 2.3 — Implement Shared Utility Functions (S, P0)
**As a** developer, **I want** shared math and physics helpers used by both client prediction and server simulation, **so that** prediction and authority agree exactly.

**Acceptance Criteria:**
- `/shared/utils/math.ts`: vector math (add, subtract, normalize, distance, lerp, angle)
- `/shared/utils/collision.ts`: point-rect, rect-rect, circle-rect collision checks, line-of-sight raycast against tile grid
- `/shared/utils/physics.ts`: movement calculation given input + delta time, sprint stamina logic
- `/shared/utils/damage.ts`: damage falloff calculation given distance
- 100% unit test coverage on all shared utilities (Vitest)
- Deterministic — no randomness or floating-point ambiguity

---

## Epic 3: Authoritative Game Server

### 3.1 — Set Up Geckos.io Server with Connection Management (M, P0)
**As a** game server, **I want** to accept WebRTC connections from players and manage their lifecycle, **so that** players can connect, disconnect, and reconnect.

**Acceptance Criteria:**
- Node.js server starts and listens with Geckos.io on configurable port
- Server accepts incoming WebRTC data channel connections
- Each connection is assigned a unique player ID
- Connection, disconnection, and timeout events are logged
- Maximum player count enforced (reject connections when full)
- Graceful handling of abrupt disconnects (timeout detection)
- Integration test: two mock clients connect and server tracks both

### 3.2 — Implement Server Game Loop (Tick System) (M, P0)
**As a** game server, **I want** a fixed-timestep game loop running at the configured tick rate, **so that** the simulation is deterministic and consistent.

**Acceptance Criteria:**
- Server runs a fixed-timestep loop (default 20 ticks/sec, configurable)
- Each tick: process input queue, simulate physics, detect hits, update state, broadcast snapshot
- Loop uses `setInterval` with drift compensation (or high-resolution timer)
- Tick counter incremented each frame and included in state broadcasts
- Performance metrics tracked: actual tick rate, tick processing time
- Unit test: loop runs at correct frequency within ±2ms tolerance
- Integration test: clients receive state updates at expected rate

### 3.3 — Implement Server-Side Player Movement & Physics (M, P0)
**As a** game server, **I want** to process player inputs and compute authoritative positions, **so that** all players see a consistent world.

**Acceptance Criteria:**
- Server receives player input messages (movement direction, sprint toggle)
- Inputs are queued with sequence numbers and timestamps
- Server applies movement using shared physics functions against the tile-based collision map
- Sprint drains stamina; releasing sprint recharges it (using shared config values)
- Wall collisions prevent movement through solid tiles
- Player positions clamped to map boundaries
- Unit tests for movement, sprint stamina, and wall collision
- Integration test: client sends movement inputs, server responds with correct positions

### 3.4 — Implement Hit Detection & Damage System (M, P0)
**As a** game server, **I want** to detect hits and apply damage authoritatively, **so that** combat is fair and cheat-proof.

**Acceptance Criteria:**
- Server processes "shoot" inputs with player aim direction
- Hitscan raycast from player position in aim direction, stopping at walls or players
- Damage calculated using shared falloff function (more damage at close range)
- Hit player's health reduced; death triggered at 0 HP
- Grenade inputs spawn server-side grenade entity with fuse timer
- Grenade explosion applies area damage with distance falloff
- Kill credited to attacker; death event broadcast to all clients
- Unit tests for raycast hit detection, damage calculation, grenade explosion radius
- Integration test: player A shoots player B, B takes correct damage

### 3.5 — Implement Lag Compensation (Server-Side Rewind) (L, P0)
**As a** game server, **I want** to rewind game state to validate hits based on shooter's latency, **so that** the game feels fair and responsive ("favor the shooter").

**Acceptance Criteria:**
- Server maintains a circular buffer of past game states (positions of all entities per tick)
- Buffer holds at least 1 second of history (configurable)
- When a "shoot" command arrives, server calculates the shooter's estimated render time (current time minus half RTT)
- Server rewinds all other player positions to that past tick
- Hit detection runs against the rewound state
- Result applied to current state (damage, kill)
- Rewound state is never broadcast — only used for hit validation
- Unit tests: hit that would miss in current state but hits in rewound state is registered
- Unit tests: rewind buffer correctly stores and retrieves past states
- Integration test with simulated latency validates favor-the-shooter behavior

### 3.6 — Implement Pickup Spawning & Collection (S, P0)
**As a** game server, **I want** to manage ammo and grenade pickups on the map, **so that** players must scavenge for resources.

**Acceptance Criteria:**
- Pickup spawn points defined in map data
- Server spawns pickups at match start and on respawn timers
- When a player's hitbox overlaps a pickup, the pickup is collected
- Gun ammo pickups add rounds (capped at max magazine capacity)
- Grenade pickups add grenades (capped at max carry capacity)
- Collected pickups despawn and start a respawn timer
- Pickup state included in game state broadcasts
- Unit test: pickup collection, capacity caps, respawn timing

### 3.7 — Implement Match Lifecycle & Scoring (M, P0)
**As a** game server, **I want** to manage the full match lifecycle (countdown, active play, match end), **so that** games have structure and win conditions.

**Acceptance Criteria:**
- Match states: `waiting`, `countdown`, `active`, `ended`
- Countdown phase (3-2-1) before match starts; players can't move or shoot
- During active phase, kills increment attacker's score
- Match ends when a player reaches the kill target OR time runs out
- Winner determined by score (ties broken by fewer deaths, then first to reach score)
- Match result broadcast to all players with full stats
- After match end, server waits for rematch/lobby decisions before cleanup
- Player respawn after death: configurable delay, brief invulnerability period, spawn at random spawn point
- Unit tests for scoring, win conditions, respawn logic, state transitions
- Integration test: full match from countdown through to match-end event

### 3.8 — Implement Game Mode Abstraction Layer (S, P1)
**As a** developer, **I want** match logic encapsulated behind a GameMode interface, **so that** new modes can be added without modifying core server code.

**Acceptance Criteria:**
- `GameMode` interface/abstract class with methods: `onStart()`, `onKill()`, `onTick()`, `isMatchOver()`, `getResults()`
- `DeathmatchMode` implements the interface with current scoring/win logic
- Server instantiates the correct GameMode based on match configuration
- Unit tests verify the interface contract
- Adding a new mode requires only a new class and a registry entry

---

## Epic 4: Client — Game Engine & Rendering

### 4.1 — Set Up Phaser.js Game Shell with Scene Management (M, P0)
**As a** player, **I want** the game to load and transition between scenes smoothly, **so that** the experience feels polished.

**Acceptance Criteria:**
- Phaser 3 game instance configured with WebGL renderer (Canvas fallback)
- Fixed game resolution with locked aspect ratio (e.g., 960x540 or 16:9 equivalent)
- Responsive scaling: fills screen on desktop and landscape mobile without scrollbars
- Scene manager with scenes: `BootScene`, `LobbyScene`, `GameScene`, `ResultsScene`
- `BootScene` loads shared assets (sprite sheets, fonts) and shows a loading bar
- Transitions between scenes with fade effect
- Pixel-perfect rendering (no anti-aliasing on sprites)
- Playwright test: game canvas renders at correct aspect ratio on desktop and mobile viewports

### 4.2 — Create Tile-Based Map Renderer (M, P0)
**As a** player, **I want** to see a retro-styled arena with walls and cover, **so that** I can plan tactical movement.

**Acceptance Criteria:**
- Map data loaded from JSON (tile grid: floor, wall, cover types)
- Tile spritesheet with retro pixel art tiles (placeholder art acceptable for MVP)
- Map renders as a static tilemap layer in Phaser
- Walls and cover visually distinct (walls opaque, cover destructible-looking)
- Map fits entirely within the game viewport (no scrolling)
- Collision layer generated from map data for client-side prediction
- Spawn points and pickup locations visually indicated
- Playwright test: map renders with correct number of tiles, no visual artifacts

### 4.3 — Implement Player Rendering & Animation (M, P0)
**As a** player, **I want** to see my character and opponents as animated retro sprites, **so that** the game has visual personality.

**Acceptance Criteria:**
- Player sprite sheet with animations: idle, walk, run, shoot, throw grenade, death, respawn
- 8-directional or smooth rotation facing aim direction
- Local player visually distinguished from opponents (color tint or palette swap)
- Health bar rendered above each player
- Sprint visual indicator (speed lines or particle trail)
- Death animation plays on kill, followed by respawn effect at new location
- Invulnerability after respawn shown with flashing/transparency effect
- Placeholder sprites acceptable for MVP (can be replaced later)
- Playwright test: player sprite visible and animates on movement input

### 4.4 — Implement Projectile & Grenade Rendering (S, P0)
**As a** player, **I want** to see bullets and grenades with retro visual effects, **so that** combat feels impactful.

**Acceptance Criteria:**
- Bullet rendered as a fast-moving pixel tracer (hitscan shown as brief line flash)
- Muzzle flash effect on gun fire
- Grenade rendered as a small thrown sprite with arc trajectory
- Explosion effect: expanding circle with pixel particles, screen shake
- Damage numbers or hit flash on player when hit
- All effects use retro pixel art style with limited palette
- Aim preview lines (bullet ray, grenade arc) turn red when the matching ammo pool is empty; releasing the fire/throw button while empty triggers a small camera shake and an out-of-ammo click

### 4.5 — Implement HUD (Heads-Up Display) (M, P0)
**As a** player, **I want** to see my health, ammo, score, and match timer at a glance, **so that** I can make tactical decisions.

**Acceptance Criteria:**
- HUD layer renders on top of game scene (fixed position, not affected by game world)
- Health bar (current HP / max HP) with color gradient (green → yellow → red)
- Ammo counter: current magazine / max, with reload indicator
- Grenade count with icon
- Sprint/stamina bar
- Kill score for both players
- Match timer (countdown)
- Kill feed: recent kills shown briefly (e.g., "Player1 fragged Player2")
- HUD scales correctly on both desktop and mobile
- Retro pixel font for all text elements
- Playwright test: all HUD elements present and show correct initial values

### 4.6 — Implement Pickup Rendering (S, P0)
**As a** player, **I want** to see pickups on the map with clear visual indicators, **so that** I know where to find ammo and grenades.

**Acceptance Criteria:**
- Ammo pickup sprite with bobbing/pulsing animation
- Grenade pickup sprite with distinct visual from ammo
- Pickup respawn visual effect (fade in or sparkle)
- Collection effect when player picks up (brief flash or particle burst)
- Empty spawn point is visually empty (pickup gone until respawn)

---

## Epic 5: Client — Input & Controls

### 5.1 — Implement Desktop Keyboard & Mouse Controls (M, P0)
**As a** desktop player, **I want** to use WASD to move and mouse to aim/shoot, **so that** controls feel natural and responsive.

**Acceptance Criteria:**
- WASD keys for 8-directional movement (including diagonals)
- Shift key for sprint toggle
- Mouse position determines aim direction (relative to player character)
- Left mouse button fires gun
- Right mouse button (or G key) throws grenade
- R key to reload manually
- Input captured at 60fps and sent to server with sequence numbers
- Inputs are responsive with zero perceived local delay (client-side prediction)
- Key bindings documented in a controls screen accessible from lobby
- Playwright test: simulate keyboard/mouse input, verify player moves on screen

### 5.2 — Implement Mobile Touch Controls (Dual Virtual Joysticks) (L, P0)
**As a** mobile player, **I want** touch-friendly controls that work well in landscape mode, **so that** I can play competitively on my phone.

**Acceptance Criteria:**
- Left floating virtual joystick for movement (appears where left thumb touches)
- Right floating virtual joystick for aiming (appears where right thumb touches)
- Fire button triggers automatically when right joystick is active (twin-stick style), with option for dedicated fire button
- Dedicated grenade button (right side of screen, above joystick area)
- Sprint activated by double-tapping or holding the movement joystick at full extension
- Dead zone on joysticks (15% of radius) to prevent drift
- Joystick visuals: retro-styled semi-transparent circles
- Multitouch support (minimum 3 simultaneous touch points)
- Controls do not interfere with HUD elements
- Responsive to different screen sizes (phone and tablet)
- Playwright test: simulate touch events on mobile viewport, verify player movement

### 5.3 — Implement Input Abstraction Layer (S, P0)
**As a** developer, **I want** a unified input system that normalizes desktop and mobile inputs, **so that** the game logic doesn't care about the input source.

**Acceptance Criteria:**
- `InputManager` class that produces a normalized `PlayerInput` per frame regardless of source
- `PlayerInput` contains: movement vector (x, y normalized), aim angle, shooting flag, grenade flag, sprint flag, reload flag
- Automatically detects input mode (keyboard/mouse vs touch) and switches
- Input sequence numbers assigned for server reconciliation
- Input buffer maintained for replay during reconciliation
- Unit tests: same PlayerInput produced from equivalent desktop and mobile inputs

---

## Epic 6: Client — Networking & Latency Compensation

### 6.1 — Implement Geckos.io Client Connection (M, P0)
**As a** client, **I want** to establish a WebRTC data channel connection to the game server, **so that** I can send inputs and receive game state with minimal latency.

**Acceptance Criteria:**
- Client connects to server using Geckos.io client library
- Connection URL configurable via environment variable
- Connection state tracked: connecting, connected, disconnected, reconnecting
- Automatic reconnection attempts on disconnect (with exponential backoff, max 5 attempts)
- RTT (round-trip time) measured continuously using ping/pong messages
- Connection quality indicator available for HUD display
- Event emitter pattern for connection lifecycle events
- Integration test: client connects to test server, exchanges messages

### 6.2 — Implement Client-Side Prediction (M, P0)
**As a** player, **I want** my character to respond instantly to my inputs, **so that** movement feels lag-free.

**Acceptance Criteria:**
- On each input frame, client immediately applies input to local player state using shared physics
- Predicted state rendered without waiting for server confirmation
- Input history buffer stores all unacknowledged inputs (input + sequence number + predicted state)
- Prediction uses same collision detection as server (shared code)
- Visually, the local player never "waits" — movement is instant
- Unit test: predicted position matches expected position given inputs and collision map

### 6.3 — Implement Server Reconciliation (M, P0)
**As a** player, **I want** my position to silently correct if the server disagrees with my prediction, **so that** I don't notice network corrections.

**Acceptance Criteria:**
- Each server state update includes the last processed input sequence number per player
- Client discards all inputs older than the acknowledged sequence number
- Client replays remaining unacknowledged inputs on top of the server's authoritative position
- If reconciled position differs from current predicted position by less than a threshold, smoothly interpolate
- If difference exceeds threshold (e.g., teleport due to lag spike), snap immediately
- No visual jitter under normal network conditions (< 150ms RTT)
- Unit test: reconciliation correctly replays inputs after server correction
- Integration test: introduce artificial position disagreement, verify smooth correction

### 6.4 — Implement Entity Interpolation (M, P0)
**As a** player, **I want** to see opponents move smoothly even though updates arrive 20 times per second, **so that** the game looks fluid.

**Acceptance Criteria:**
- Other players' positions rendered by interpolating between the two most recent server states
- Interpolation runs one tick behind real-time (intentional delay for smooth buffer)
- If a server update is missed (packet loss), extrapolation briefly continues movement direction
- Extrapolation capped at 200ms before freezing the entity
- Interpolation applies to position, rotation/aim direction, and animation state
- Unit test: interpolation produces correct intermediate positions
- Playwright test: opponent character moves smoothly (no teleporting between positions)

### 6.5 — Implement Network Message Serialization (S, P1)
**As a** developer, **I want** efficient binary serialization for network messages, **so that** bandwidth usage is minimized for mobile players.

**Acceptance Criteria:**
- Game state snapshots serialized to binary format (e.g., using FlatBuffers, MessagePack, or manual ArrayBuffer packing)
- Delta compression: only changed fields sent when possible
- Serialization/deserialization functions shared or mirrored between client and server
- Benchmark: full game state snapshot under 500 bytes for a 2-player match
- Unit tests verify round-trip serialization accuracy

---

## Epic 7: Lobby & Matchmaking

### 7.1 — Implement Lobby UI Scene (M, P0)
**As a** player, **I want** a retro-styled lobby screen where I can enter my name and find a match, **so that** I can get into a game easily.

**Acceptance Criteria:**
- `LobbyScene` renders with post-apocalyptic retro pixel art theme
- Nickname input field (max 12 characters, alphanumeric + underscores)
- Nickname persisted in localStorage for return visits
- "Quick Match" button to enter matchmaking queue
- Player count indicator ("X players online")
- Animated background or idle animation fitting the retro theme
- Mobile-friendly layout (buttons large enough for touch)
- Playwright test: enter nickname, click Quick Match, verify matchmaking state shown

### 7.2 — Implement Server-Side Matchmaking Queue (M, P0)
**As a** player, **I want** to be automatically paired with another player, **so that** I don't have to coordinate outside the game.

**Acceptance Criteria:**
- Server maintains a matchmaking queue (FIFO)
- When a player clicks Quick Match, they're added to the queue
- When two players are in the queue, they're paired into a match
- Players in queue see a "Searching for opponent..." status with elapsed time
- Player can cancel matchmaking and return to lobby
- If opponent disconnects during matchmaking, the remaining player returns to queue
- Server creates a new match instance when a pair is found
- Architecture supports future expansion to N-player matchmaking
- Integration test: two clients queue up, get matched, enter the same game session

### 7.3 — Implement Match Loading & Countdown Transition (S, P0)
**As a** player, **I want** a smooth transition from lobby to gameplay with a countdown, **so that** the match start feels exciting.

**Acceptance Criteria:**
- After matching, both clients transition to `GameScene`
- Loading screen while assets and connection are confirmed
- 3-2-1 countdown overlay with retro-styled numbers
- Players can see the map and opponent during countdown but cannot move
- Match begins immediately after countdown reaches zero
- If a player disconnects during countdown, match is cancelled and the other player returns to lobby

---

## Epic 8: Post-Match Experience

### 8.1 — Implement Results Screen (M, P0)
**As a** player, **I want** to see a satisfying post-match screen with my stats, **so that** the end of a match feels rewarding.

**Acceptance Criteria:**
- `ResultsScene` displays after match ends
- Winner announcement with retro victory animation (flashing text, pixel confetti)
- Loser shown with a "defeated" animation
- Stats displayed for both players:
  - Kills / Deaths / K-D ratio
  - Accuracy percentage (shots hit / shots fired)
  - Damage dealt / Damage taken
  - Grenades thrown / Grenade kills
  - Longest kill streak
- Stats animate in sequentially (arcade-style score tally)
- "Rematch" button (queues both players for an immediate rematch if both agree)
- "Back to Lobby" button
- If opponent disconnects, show results with "Opponent Left" indicator
- Playwright test: results screen shows after match, all stat elements present, buttons functional

### 8.2 — Implement Rematch Flow (S, P1)
**As a** player, **I want** to quickly rematch my opponent, **so that** we can keep playing without going back to the lobby.

**Acceptance Criteria:**
- Both players see "Rematch" and "Back to Lobby" buttons on results screen
- When a player clicks Rematch, their status shown to opponent ("Player wants a rematch!")
- If both click Rematch, a new match starts immediately with the same players
- If one player clicks Back to Lobby, the other is notified and also sent to lobby
- 30-second timeout: if no response, both players return to lobby
- Server reuses the existing connection (no reconnection needed)

---

## Epic 9: Map System

### 9.1 — Design Map Data Format & First Map (M, P0)
**As a** developer, **I want** a flexible map data format, **so that** new maps can be easily created as JSON files.

**Acceptance Criteria:**
- Map format: JSON with metadata (name, dimensions) and 2D tile grid
- Tile types: `floor`, `wall`, `cover_low`, `spawn_point`, `pickup_spawn`
- Spawn points support N players (minimum 4 spawn points for future expansion)
- Pickup spawn points tagged by type (ammo, grenade)
- First map designed: "Wasteland Outpost" — ~20x12 tile arena with:
  - Symmetrical layout for fairness
  - Mix of open lanes and tight corridors
  - Central high-value pickup area
  - Cover positions near spawn points
  - Clear sightlines balanced with ambush spots
- Map file stored in `/shared/maps/wasteland-outpost.json`
- Map validator utility confirms map is playable (spawn points accessible, no unreachable areas)
- Unit test: map validator passes for the first map

### 9.2 — Implement Server-Side Map Loading & Collision (S, P0)
**As a** game server, **I want** to load map data and use it for collision detection, **so that** players can't walk through walls.

**Acceptance Criteria:**
- Server loads map JSON at match start
- Collision grid generated from tile data (solid tiles = impassable)
- Collision checks integrated into movement processing (Epic 3.3)
- Raycast hit detection respects walls (bullets stop at solid tiles)
- Grenade explosions blocked by walls (no damage through solid walls)
- Map selection configurable per match (for future multi-map support)
- Unit test: collision grid correctly generated, movement blocked by walls

---

## Epic 10: Audio System

### 10.1 — Implement Audio Manager & Integration Points (M, P1)
**As a** player, **I want** to hear sound effects and music, **so that** the game feels immersive and retro-authentic.

**Acceptance Criteria:**
- `AudioManager` singleton handles all audio playback through Phaser's sound system
- Sound effect categories wired up with placeholder/silent stubs:
  - Combat: gunshot, grenade throw, explosion, bullet impact, player hit, player death
  - Movement: footsteps (walk and run variants), pickup collection
  - UI: menu select, match countdown beep, match start horn, victory fanfare, defeat sound
- Background music system: lobby music, in-game music (can loop and crossfade)
- Volume controls: master, SFX, and music (persisted in localStorage)
- Mute toggle accessible during gameplay
- Audio respects browser autoplay policies (user interaction required to start)
- Spatial audio: sounds louder when source is closer to player
- All integration points documented so audio assets can be dropped in later
- Architecture supports adding new sounds without code changes (data-driven sound map)

---

## Epic 11: Deployment & Infrastructure

### 11.1 — Provision Google Cloud Compute Engine VM (M, P0)
**As a** developer, **I want** a GCE VM running in us-east1, **so that** the game server runs close to players in the NY/NJ area.

**Acceptance Criteria:**
- GCE VM created: `e2-small` (or `e2-micro`) in `us-east1-b`
- Ubuntu LTS image
- Firewall rules: allow UDP port range for Geckos.io (e.g., 1025-65535), allow TCP 443/80, allow SSH
- Static external IP assigned
- SSH key configured for deployment access
- Node.js LTS installed on VM
- PM2 or systemd service configured to keep the game server running and restart on crash
- Basic server hardening: disable root SSH, fail2ban installed
- Setup documented in `/docs/infrastructure.md`

### 11.2 — Configure Firebase Hosting for Client (M, P0)
**As a** developer, **I want** the game client served from Firebase Hosting with a CDN, **so that** static assets load fast for players.

**Acceptance Criteria:**
- Firebase project created and configured
- `firebase.json` and `.firebaserc` in `/client`
- Client build output (`/client/dist`) deployed to Firebase Hosting
- Custom domain configured (or default `.web.app` domain documented)
- SPA routing configured (all routes serve `index.html`)
- Cache headers optimized: hashed assets get long cache, `index.html` gets no-cache
- HTTPS enforced
- Manual deploy works: `firebase deploy --only hosting`

### 11.3 — Implement CD Pipeline — Deploy Client to Firebase (M, P0)
**As a** developer, **I want** the client auto-deployed to Firebase when code merges to main, **so that** players always have the latest version.

**Acceptance Criteria:**
- GitHub Actions workflow triggers on push to `main`
- Builds client (`npm run build` in `/client`)
- Deploys to Firebase Hosting using `firebase-tools` with service account token
- Firebase service account credentials stored as GitHub secret
- Deployment only runs if CI passes
- Deploy URL output in workflow summary
- Rollback possible via Firebase console

### 11.4 — Implement CD Pipeline — Deploy Server to GCE (M, P0)
**As a** developer, **I want** the game server auto-deployed to GCE when code merges to main, **so that** the server stays up to date.

**Acceptance Criteria:**
- GitHub Actions workflow triggers on push to `main` (after CI passes)
- Builds server (`npm run build` in `/server`)
- Deploys to GCE via SSH (rsync build artifacts + `pm2 restart` or equivalent)
- Deployment uses a dedicated deploy SSH key stored as GitHub secret
- Zero-downtime deployment: new server process starts before old one stops (or graceful drain)
- Active matches are allowed to finish before the old process exits (graceful shutdown with timeout)
- Server health check after deployment confirms successful start
- Rollback documented: previous build artifacts retained for manual rollback

### 11.5 — Configure Domain & SSL for Game Server (S, P1)
**As a** player, **I want** to connect to the game server over a secure, memorable address, **so that** the connection is trustworthy.

**Acceptance Criteria:**
- Subdomain configured for game server (e.g., `game.mightymansrevenge.com` or similar)
- SSL/TLS certificate provisioned (Let's Encrypt via Certbot)
- Auto-renewal configured for certificate
- Geckos.io server configured to use HTTPS signaling
- Client configured to connect to the secure server URL
- DNS and SSL documented

---

## Epic 12: Testing — Unit & Integration

### 12.1 — Configure Vitest for Client & Server (S, P0)
**As a** developer, **I want** Vitest configured and running for both packages, **so that** unit and integration tests can be written immediately.

**Acceptance Criteria:**
- Vitest configured in `/client`, `/server`, and `/shared`
- Test files co-located with source: `*.test.ts` or `*.spec.ts`
- Coverage reporter configured (Istanbul or V8)
- Coverage thresholds set: 80% line coverage minimum
- `npm test` at root runs all package tests
- `npm run test:watch` for development
- Mock utilities configured (vi.mock, vi.fn)
- Tests run in CI pipeline (Epic 1.3)

### 12.2 — Write Server Game Logic Unit Tests (L, P0)
**As a** developer, **I want** comprehensive unit tests for all server game logic, **so that** bugs are caught before they reach players.

**Acceptance Criteria:**
- Tests for tick loop timing and processing order
- Tests for player movement with collision (all edge cases: corners, sliding along walls)
- Tests for hit detection: hitscan raycast, grenade area damage
- Tests for lag compensation: rewind buffer storage, retrieval, hit validation against past state
- Tests for damage calculation with range falloff
- Tests for pickup spawning, collection, capacity caps
- Tests for match lifecycle: state transitions, scoring, win conditions, respawn
- Tests for matchmaking queue: pairing, cancellation, edge cases
- All tests deterministic (no flaky tests)
- Coverage: ≥90% on server game logic modules

### 12.3 — Write Client Rendering & Input Unit Tests (M, P0)
**As a** developer, **I want** unit tests for client-side logic, **so that** prediction, reconciliation, and input handling are verified.

**Acceptance Criteria:**
- Tests for `InputManager`: normalized output from keyboard/mouse and touch inputs
- Tests for client-side prediction: correct position given inputs and collision map
- Tests for server reconciliation: input replay, smooth correction, snap on large difference
- Tests for entity interpolation: correct intermediate positions, extrapolation behavior
- Tests for `AudioManager`: correct sounds triggered for game events, volume settings
- Tests for HUD: correct values displayed for health, ammo, score, timer
- Phaser mocked/stubbed where necessary for unit testing

### 12.4 — Write Network Integration Tests (M, P0)
**As a** developer, **I want** integration tests that verify client-server communication, **so that** the networking layer is proven to work end-to-end.

**Acceptance Criteria:**
- Test harness that starts a real server and connects mock clients via Geckos.io
- Test: client connects, receives welcome message with player ID
- Test: client sends movement input, receives updated position in next tick
- Test: two clients connect, each sees the other's position updates
- Test: client disconnects, other client receives disconnect event
- Test: client reconnects after brief disconnect
- Test: matchmaking pairs two clients into a match
- Tests run in CI (may need longer timeout)
- Cleanup: server and connections properly closed after each test

---

## Epic 13: Testing — Playwright E2E & Visual

### 13.1 — Configure Playwright Test Environment (M, P0)
**As a** developer, **I want** Playwright configured to test the game in real browsers, **so that** UI and gameplay flows are validated end-to-end.

**Acceptance Criteria:**
- Playwright installed and configured in `/e2e` directory
- Test config targets Chromium and Firefox (WebRTC-capable browsers)
- Mobile device emulation configured (landscape iPhone, landscape Android)
- Dev server auto-starts before test run (client + server)
- Screenshot comparison enabled for visual regression testing
- Video recording enabled for failed tests (debugging aid)
- Custom Playwright fixtures: `gamePage` (loads game, waits for canvas ready), `lobbyPage` (navigates to lobby)
- Helper utilities: `waitForGameState()`, `simulateKeyboard()`, `simulateTouch()`
- Tests run in CI pipeline headlessly
- `npm run test:e2e` script at root

### 13.2 — Write Lobby Flow E2E Tests (M, P0)
**As a** developer, **I want** E2E tests for the lobby experience, **so that** the entry point to the game is reliable.

**Acceptance Criteria:**
- Test: game loads, boot screen shows loading progress, transitions to lobby
- Test: enter nickname, nickname persists on page reload
- Test: click Quick Match, see "Searching..." status
- Test: cancel matchmaking, return to idle lobby state
- Test: two browser tabs queue for match, both transition to game scene
- Test: lobby renders correctly on desktop viewport (1920x1080)
- Test: lobby renders correctly on mobile landscape viewport (iPhone 14 Pro dimensions)
- Visual regression snapshots for lobby screen (desktop and mobile)

### 13.3 — Write Gameplay E2E Tests (L, P0)
**As a** developer, **I want** E2E tests that verify core gameplay works in a real browser, **so that** we catch rendering, input, and networking bugs.

**Acceptance Criteria:**
- Test: two players match, countdown completes, match begins
- Test: player moves with WASD, character visually moves on screen
- Test: player shoots, muzzle flash and projectile tracer appear
- Test: player throws grenade, grenade and explosion render
- Test: player collects pickup, HUD ammo count increases
- Test: player takes damage, health bar decreases
- Test: player dies, death animation plays, respawn occurs after delay
- Test: match reaches kill target, results screen appears
- Test: HUD elements update correctly during gameplay (kills, timer, ammo)
- Tests use two browser contexts to simulate two players in the same match
- Tests have retry logic for timing-sensitive assertions (network variability)

### 13.4 — Write Mobile-Specific E2E Tests (M, P0)
**As a** developer, **I want** E2E tests that verify the mobile experience, **so that** touch controls and responsive layout work correctly.

**Acceptance Criteria:**
- Test: game renders correctly in landscape mobile viewport
- Test: virtual joysticks appear on touch, disappear on release
- Test: movement joystick moves character
- Test: aim joystick rotates character and fires
- Test: grenade button triggers grenade throw
- Test: HUD is readable and doesn't overlap with touch controls
- Test: no horizontal scroll or viewport overflow
- Test: orientation lock message shown in portrait mode (if applicable)
- Visual regression snapshots for mobile gameplay screen

### 13.5 — Write Results Screen & Rematch E2E Tests (S, P0)
**As a** developer, **I want** E2E tests for the post-match experience, **so that** the game loop from match end back to playing again is solid.

**Acceptance Criteria:**
- Test: results screen shows correct winner
- Test: stats display (kills, deaths, accuracy) matches gameplay events
- Test: both players click Rematch, new match starts
- Test: one player clicks Back to Lobby, both return to lobby
- Test: opponent disconnects during results, appropriate message shown
- Visual regression snapshot for results screen

---

## Epic 14: Observability & Admin

### 14.1 — Implement Structured Server Logging (M, P0)
**As a** developer, **I want** structured JSON logs from the game server, **so that** I can diagnose issues quickly.

**Acceptance Criteria:**
- Logging library integrated (e.g., Pino — fast, structured JSON output)
- Log levels: debug, info, warn, error
- Standard fields on every log: timestamp, level, requestId/sessionId, event
- Game events logged at `info` level:
  - Player connected/disconnected (with player ID, nickname, IP region)
  - Match created/started/ended (with player IDs, final scores, duration)
  - Matchmaking events (queue join, queue leave, pair found)
- Performance logged at `debug` level:
  - Tick processing time (with alert if exceeding budget)
  - Active connections count
  - Memory usage
- Errors logged at `error` level with stack traces
- Log output goes to stdout (consumed by PM2/systemd journal)
- Log rotation configured (PM2 log rotate or logrotate)
- No sensitive data in logs (no IPs in production unless needed, no tokens)

### 14.2 — Build Admin Dashboard (M, P1)
**As an** admin, **I want** a simple web dashboard showing server health and active matches, **so that** I can monitor the game without SSH-ing into the server.

**Acceptance Criteria:**
- Lightweight Express route served on a separate port (or path-protected on main port)
- Protected by a simple API key or basic auth (configurable via environment variable)
- Dashboard shows:
  - Server uptime
  - Current tick rate (actual vs target)
  - Memory and CPU usage
  - Active connections count
  - Active matches with player names, scores, duration
  - Matchmaking queue length
  - Recent match history (last 20 matches with results)
- Auto-refreshes every 5 seconds
- Minimal UI — functional, not pretty (plain HTML or lightweight framework)
- Endpoint: `GET /admin/status` returns JSON (for programmatic access)
- Playwright test: admin dashboard loads and shows expected sections

### 14.3 — Implement Server Health Check Endpoint (S, P0)
**As a** deployment pipeline, **I want** a health check endpoint, **so that** I can verify the server is running correctly after deploy.

**Acceptance Criteria:**
- `GET /health` returns `200 OK` with JSON: `{ "status": "healthy", "uptime": N, "tickRate": N, "connections": N }`
- Returns `503` if tick loop is stalled (no tick processed in last 2 seconds)
- No authentication required (used by monitoring and deploy scripts)
- Response time under 10ms (no heavy computation)
- Used by CD pipeline (Epic 11.4) to verify deployment success

---

## Epic 15: Performance & Optimization

### 15.1 — Implement Server Performance Benchmarks (M, P1)
**As a** developer, **I want** automated benchmarks for the game server, **so that** I can catch performance regressions.

**Acceptance Criteria:**
- Benchmark suite using Vitest `bench` or dedicated benchmark tool
- Benchmarks for:
  - Tick processing time with 2, 4, and 10 simulated players
  - Hit detection raycast performance (1000 raycasts against map)
  - Lag compensation rewind + hit check (100 rewind lookups)
  - State serialization/deserialization (1000 round trips)
  - Collision detection per tick (movement against full map grid)
- Baseline results recorded and committed
- CI step compares against baseline, warns if >20% regression
- Results output as markdown table for easy reading

### 15.2 — Profile & Optimize Client Rendering (S, P1)
**As a** player, **I want** the game to run at 60fps on mid-range devices, **so that** gameplay is smooth.

**Acceptance Criteria:**
- Phaser render loop profiled using Chrome DevTools Performance tab
- Object pooling implemented for frequently created/destroyed objects: bullets, particles, damage numbers
- Sprite batching verified (Phaser's WebGL batch renderer)
- No unnecessary texture swaps per frame
- Tilemap uses static layer (rendered once, not per-frame)
- Target: 60fps on a 2020-era phone in landscape Chrome
- Performance budget documented: max draw calls, max sprites, max particles

---

## Epic 16: Documentation & Agent Onboarding

### 16.1 — Write CLAUDE.md Project Guide (M, P0)
**As a** Claude agent, **I want** a comprehensive CLAUDE.md file, **so that** I understand the project conventions and can contribute effectively.

**Acceptance Criteria:**
- `CLAUDE.md` at repo root with:
  - Project overview and architecture summary
  - Directory structure explanation
  - How to install dependencies and run dev environment
  - How to run tests (unit, integration, E2E)
  - Build and deploy commands
  - Code conventions: naming, file organization, import ordering
  - Git conventions: branch naming, commit messages, PR process
  - Key architectural decisions and their rationale
  - Common pitfalls and how to avoid them
- Kept concise — reference other docs rather than duplicating

### 16.2 — Write Architecture Decision Records (S, P1)
**As a** developer, **I want** documented rationale for key technical decisions, **so that** future agents and contributors understand why things are built this way.

**Acceptance Criteria:**
- `/docs/adr/` directory with decision records:
  - ADR-001: Authoritative server architecture (why not peer-to-peer)
  - ADR-002: Geckos.io for networking (why WebRTC over WebSocket)
  - ADR-003: Tile-based map system (why tiles over freeform)
  - ADR-004: Lag compensation strategy (favor the shooter)
  - ADR-005: GCE + Firebase Hosting split (why not fully serverless)
  - ADR-006: Monorepo with shared package (why shared code matters)
- Each ADR follows format: Context, Decision, Consequences
- Short and focused — one page each maximum

---

## Story Dependency Map (Suggested Implementation Order)

### Phase 1: Foundation
1. Epic 1 (all) — Project scaffolding
2. Epic 2 (all) — Shared types and config
3. Epic 12.1 — Test configuration

### Phase 2: Core Server
4. Epic 3.1 — Server connections
5. Epic 3.2 — Game loop
6. Epic 3.3 — Server movement
7. Epic 9.1–9.2 — Map system
8. Epic 3.4 — Hit detection
9. Epic 3.5 — Lag compensation
10. Epic 3.6 — Pickups
11. Epic 3.7–3.8 — Match lifecycle & game mode abstraction

### Phase 3: Core Client
12. Epic 4.1 — Phaser shell
13. Epic 4.2 — Map rendering
14. Epic 4.3 — Player rendering
15. Epic 5.1 — Desktop controls
16. Epic 5.3 — Input abstraction
17. Epic 5.2 — Mobile controls
18. Epic 6.1 — Client networking
19. Epic 6.2 — Client prediction
20. Epic 6.3 — Server reconciliation
21. Epic 6.4 — Entity interpolation
22. Epic 4.4–4.6 — Projectiles, HUD, pickups

### Phase 4: Game Flow
23. Epic 7.1–7.3 — Lobby & matchmaking
24. Epic 8.1–8.2 — Results & rematch

### Phase 5: Testing & Polish
25. Epic 12.2–12.4 — Unit & integration tests
26. Epic 13.1–13.5 — Playwright E2E tests
27. Epic 6.5 — Network optimization
28. Epic 10.1 — Audio system
29. Epic 15.1–15.2 — Performance

### Phase 6: Deploy & Operate
30. Epic 11.1–11.5 — Infrastructure & CD
31. Epic 14.1–14.3 — Logging, admin, health checks
32. Epic 16.1–16.2 — Documentation

---

*Total: 16 Epics, 53 User Stories*
*Estimated complexity: ~45 days of focused agent work*
