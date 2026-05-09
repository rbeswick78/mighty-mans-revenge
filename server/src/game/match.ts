import {
  MatchPhase,
  GameModeType,
  MATCH,
  RESPAWN,
  PLAYER,
  GUN,
  GRENADE,
  SERVER,
  EVENT,
  CHARACTER_IDS,
  calculateMovement,
  eventToMovementModifiers,
} from '@shared/game';
import type {
  PlayerId,
  PlayerState,
  PlayerInput,
  MapData,
  MatchResult,
  KillFeedEntry,
  PickupState,
  BulletTrail,
  GrenadeState,
  FinalMinuteEvent,
  CharacterId,
  ServerCharacterSelectStateMessage,
} from '@shared/game';
import { logger } from '../utils/logger.js';
import { PickupManager } from './pickup-manager.js';
import { StatsTracker } from './stats-tracker.js';
import { MapManager } from './map-manager.js';
import { CombatManager } from './combat-manager.js';
import { LagCompensator } from './lag-compensator.js';
import { getGameMode } from './modes/index.js';
import type { GameMode, MatchContext } from './modes/game-mode.js';
import { InputQueue } from './input-queue.js';

interface PendingBurst {
  shotsRemaining: number;
  /** Seconds until the next shot in the burst fires. */
  nextShotIn: number;
  /** Aim angle locked when the player released LMB. */
  lockedAngle: number;
}

export class Match implements MatchContext {
  readonly matchId: string;
  phase: MatchPhase = MatchPhase.CHARACTER_SELECT;
  countdownTimer = 0;
  matchTimer = 0;
  players: Map<PlayerId, PlayerState> = new Map();
  /**
   * Per-player character-select state. Populated for every player in the
   * constructor; mutated by setHover / setLock and consumed by
   * updateCharacterSelect when select completes.
   */
  selectionState: Map<PlayerId, { hovered: CharacterId | null; locked: CharacterId | null }> = new Map();
  /** Seconds remaining on the character-select auto-lock timer. */
  private selectTimer: number = MATCH.CHARACTER_SELECT_TIMEOUT_SEC;
  readonly stats: StatsTracker;
  readonly pickupManager: PickupManager;
  readonly mapManager: MapManager;
  private readonly gameMode: GameMode;
  private readonly killFeed: KillFeedEntry[] = [];
  readonly combatManager: CombatManager = new CombatManager();
  /**
   * Server-side rewind path for "favor the shooter" hit detection. Owns a
   * RewindBuffer of recent player states and routes processShot through it
   * using the shooter's measured RTT. Wraps combatManager — see
   * lag-compensator.ts.
   */
  private readonly lagCompensator: LagCompensator = new LagCompensator(
    this.combatManager,
  );
  /**
   * Monotonic counter passed to the rewind buffer as its tick key. Distinct
   * from server tick — internal so tests don't need to thread an external
   * counter.
   */
  private rewindTickCounter = 0;
  /**
   * Resolver for the shooter's most recent measured RTT (ms). Installed by
   * MatchmakingManager from GameManager's per-player ping cache. Defaults
   * to 0 so unit tests get pass-through behavior identical to the
   * pre-lag-comp path.
   */
  private rttForShooter: (playerId: PlayerId) => number = () => 0;
  /** Recent bullet trails from this tick, cleared after broadcast. */
  private tickBulletTrails: BulletTrail[] = [];
  /** Kills recorded this tick, cleared after broadcast. */
  private tickKillFeedEntries: KillFeedEntry[] = [];
  /** Pickups collected this tick, cleared after broadcast. */
  private tickPickupCollections: Array<{ pickupId: string; playerId: PlayerId }> = [];
  /** Ordered input queue per player. Inputs are acked only after consumption. */
  private inputQueues: Map<PlayerId, InputQueue> = new Map();
  /** Active 3-shot bursts in flight, keyed by player. */
  private pendingBursts: Map<PlayerId, PendingBurst> = new Map();
  /** Timestamp when the match became ACTIVE, for duration tracking. */
  get matchStartTime(): number {
    return this._matchStartTimeMs;
  }
  private _matchStartTimeMs = 0;
  private connectedPlayers: Set<PlayerId> = new Set();

  /** Final-minute event state. */
  private _activeEvent: FinalMinuteEvent | null = null;
  private _warningSent = false;
  private _eventStarted = false;
  /** One-shot warning to broadcast this tick (consumed by matchmaking-manager). */
  private _eventWarningThisTick: { event: FinalMinuteEvent; activatesInMs: number } | null = null;
  /** One-shot start to broadcast this tick (consumed by matchmaking-manager). */
  private _eventStartThisTick: FinalMinuteEvent | null = null;
  /** Injected RNG for event selection — defaults to Math.random, override in tests. */
  private readonly rng: () => number;

  constructor(
    matchId: string,
    mapData: MapData,
    playerEntries: Array<{ id: PlayerId; nickname: string }>,
    gameModeType: GameModeType = GameModeType.DEATHMATCH,
    rng: () => number = Math.random,
  ) {
    this.matchId = matchId;
    this.rng = rng;
    this.stats = new StatsTracker();
    this.pickupManager = new PickupManager();
    this.mapManager = new MapManager();
    this.gameMode = getGameMode(gameModeType);

    this.mapManager.loadMap(mapData);
    this.pickupManager.initFromMap(mapData);

    const spawns = this.mapManager.pickInitialSpawns(playerEntries.length, this.rng);
    // Default-hover assignment: as we iterate over players in insertion order,
    // give each player the first CHARACTER_ID not already taken as a default
    // hover. With only 2 characters and 2 players today this means P1 gets
    // CHARACTER_IDS[0] and P2 gets CHARACTER_IDS[1] — but it generalizes
    // cleanly to any roster size.
    const takenDefaults = new Set<CharacterId>();
    playerEntries.forEach((entry, i) => {
      const player = this.createPlayerState(entry.id, entry.nickname, spawns[i]);
      this.players.set(entry.id, player);
      this.inputQueues.set(entry.id, new InputQueue());
      this.stats.initPlayer(entry.id);
      this.connectedPlayers.add(entry.id);

      const defaultHover = CHARACTER_IDS.find((c) => !takenDefaults.has(c)) ?? CHARACTER_IDS[0];
      takenDefaults.add(defaultHover);
      this.selectionState.set(entry.id, { hovered: defaultHover, locked: null });
    });
  }

  /**
   * Install the resolver used to fetch each shooter's RTT (ms) for the
   * lag-compensation rewind. Called once by MatchmakingManager when the
   * match is created.
   */
  setRttResolver(fn: (playerId: PlayerId) => number): void {
    this.rttForShooter = fn;
  }

  /** Queue a player input to be processed on the next tick. */
  queueInput(playerId: PlayerId, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (input.sequenceNumber <= player.lastProcessedInput) return;

    if (this.phase !== MatchPhase.ACTIVE) {
      player.lastProcessedInput = input.sequenceNumber;
      player.aimAngle = input.aimAngle;
      return;
    }

    // Sequence validation lives in the queue; acks advance only during update.
    const queue = this.inputQueues.get(playerId);
    if (!queue) return;

    queue.push(input);
  }

  /**
   * Start the countdown phase. Called by updateCharacterSelect once both
   * players have locked (or the select timer has expired and any
   * unlocked players have been auto-locked). Every player must have a
   * non-null `characterId` by the time we get here — assert it loudly so
   * a logic bug in select-completion doesn't silently produce a match
   * with unset characters.
   */
  startCountdown(): void {
    if (this.phase !== MatchPhase.CHARACTER_SELECT && this.phase !== MatchPhase.WAITING) return;
    for (const [id, player] of this.players) {
      if (player.characterId === null) {
        logger.error(
          { matchId: this.matchId, playerId: id },
          'startCountdown called with player.characterId still null',
        );
      }
    }
    this.phase = MatchPhase.COUNTDOWN;
    this.countdownTimer = MATCH.COUNTDOWN_DURATION;
  }

  /** Main per-tick update. dt is in seconds. */
  update(dt: number): void {
    switch (this.phase) {
      case MatchPhase.CHARACTER_SELECT:
        this.updateCharacterSelect(dt);
        break;
      case MatchPhase.COUNTDOWN:
        this.updateCountdown(dt);
        break;
      case MatchPhase.ACTIVE:
        this.updateActive(dt);
        break;
      default:
        break;
    }
  }

  /**
   * Tick the character-select phase. Transitions to COUNTDOWN once every
   * player has locked, OR once the select timer hits zero (unlocked
   * players are auto-locked onto their current hover, falling back to
   * CHARACTER_IDS[0] if somehow nothing is hovered). On transition,
   * commits the locked character onto each player's persistent
   * playerState.characterId.
   */
  updateCharacterSelect(dt: number): void {
    this.selectTimer -= dt;

    let allLocked = true;
    for (const sel of this.selectionState.values()) {
      if (sel.locked === null) {
        allLocked = false;
        break;
      }
    }

    const timedOut = this.selectTimer <= 0;
    if (!allLocked && !timedOut) return;

    if (timedOut) {
      this.selectTimer = 0;
      for (const sel of this.selectionState.values()) {
        if (sel.locked === null) {
          sel.locked = sel.hovered ?? CHARACTER_IDS[0];
        }
      }
    }

    // Commit locks onto persistent player state.
    for (const [playerId, sel] of this.selectionState) {
      const player = this.players.get(playerId);
      if (!player) continue;
      // sel.locked is non-null here: either the all-locked branch made it so,
      // or the timeout branch just auto-locked any stragglers.
      player.characterId = sel.locked;
    }

    this.startCountdown();
  }

  /**
   * Update a player's hovered character during CHARACTER_SELECT. Silently
   * ignored if the match isn't in select, the player isn't in this match,
   * or the requested character is already locked by someone else (the
   * server's broadcast will reflect the actual state).
   */
  setHover(playerId: PlayerId, characterId: CharacterId): void {
    if (this.phase !== MatchPhase.CHARACTER_SELECT) return;
    const sel = this.selectionState.get(playerId);
    if (!sel) return;
    // Reject hovers onto a character another player has already locked.
    for (const [otherId, otherSel] of this.selectionState) {
      if (otherId === playerId) continue;
      if (otherSel.locked === characterId) return;
    }
    sel.hovered = characterId;
  }

  /**
   * Lock a player onto a character during CHARACTER_SELECT. Silently
   * ignored if the match isn't in select, the player isn't in this match,
   * the player has already locked, or the character is already locked by
   * another player. Auto-snaps any other player whose hover matches the
   * just-locked character to a different available character so the UI
   * never shows two players hovering the same locked option.
   */
  setLock(playerId: PlayerId, characterId: CharacterId): void {
    if (this.phase !== MatchPhase.CHARACTER_SELECT) return;
    const sel = this.selectionState.get(playerId);
    if (!sel) return;
    if (sel.locked !== null) return;
    for (const [otherId, otherSel] of this.selectionState) {
      if (otherId === playerId) continue;
      if (otherSel.locked === characterId) return;
    }

    sel.locked = characterId;
    sel.hovered = characterId;

    // Auto-snap any other player whose hover collides with the new lock.
    for (const [otherId, otherSel] of this.selectionState) {
      if (otherId === playerId) continue;
      if (otherSel.locked !== null) continue;
      if (otherSel.hovered !== characterId) continue;
      // Find the first character not currently locked by anyone.
      const taken = new Set<CharacterId>();
      for (const s of this.selectionState.values()) {
        if (s.locked !== null) taken.add(s.locked);
      }
      const fallback = CHARACTER_IDS.find((c) => !taken.has(c)) ?? CHARACTER_IDS[0];
      otherSel.hovered = fallback;
    }
  }

  /**
   * Build the per-tick character-select state message from the selection
   * map. The matchmaking manager broadcasts this in place of gameState
   * while the match is in CHARACTER_SELECT.
   */
  getSelectStateMessage(): ServerCharacterSelectStateMessage {
    const selections: ServerCharacterSelectStateMessage['selections'] = [];
    for (const [playerId, sel] of this.selectionState) {
      const player = this.players.get(playerId);
      selections.push({
        playerId,
        nickname: player?.nickname ?? '',
        hoveredCharacterId: sel.hovered,
        lockedCharacterId: sel.locked,
      });
    }
    return {
      type: 'server:characterSelectState',
      selections,
      timeRemainingMs: Math.max(0, this.selectTimer * 1000),
    };
  }

  /** Record a kill event. */
  onKill(killerId: PlayerId, victimId: PlayerId, weapon: 'gun' | 'grenade'): void {
    this.stats.recordKill(killerId, victimId, weapon);
    this.stats.recordDeath(victimId);

    this.gameMode.onKill(this, killerId, victimId);

    const victim = this.players.get(victimId);
    if (victim) {
      victim.isDead = true;
      victim.respawnTimer = RESPAWN.DELAY;
      victim.deaths++;
    }

    // Reward the killer with 50% of their max health (no overheal). Skip
    // suicide — getting credit for your own death shouldn't refill you.
    if (killerId !== victimId) {
      const killer = this.players.get(killerId);
      if (killer && !killer.isDead) {
        killer.health = Math.min(killer.maxHealth, killer.health + killer.maxHealth * 0.5);
      }
    }

    // Cancel any in-flight burst for the killed player.
    this.pendingBursts.delete(victimId);

    const entry: KillFeedEntry = {
      killerId,
      victimId,
      weapon,
      timestamp: Date.now(),
    };
    this.killFeed.push(entry);
    this.tickKillFeedEntries.push(entry);
  }

  /** Record that a player has disconnected. */
  onPlayerDisconnect(playerId: PlayerId): void {
    this.connectedPlayers.delete(playerId);
  }

  /** Check if the match should end, and if so, transition to ENDED. */
  checkMatchEnd(): boolean {
    if (this.phase !== MatchPhase.ACTIVE) return false;

    let shouldEnd = false;

    // Game mode says it's over (kill target reached or time out)
    if (this.gameMode.isMatchOver(this)) {
      shouldEnd = true;
    }

    // Only one player connected
    if (this.connectedPlayers.size <= 1 && this.players.size > 1) {
      shouldEnd = true;
    }

    if (shouldEnd) {
      this.phase = MatchPhase.ENDED;
      return true;
    }
    return false;
  }

  /** Build the match result. */
  getResult(): MatchResult {
    return this.gameMode.getResults(this);
  }

  getKillFeed(): KillFeedEntry[] {
    return [...this.killFeed];
  }

  getKillTarget(): number {
    return MATCH.KILL_TARGET;
  }

  getTimeLimit(): number {
    return MATCH.TIME_LIMIT;
  }

  /** Bullet trails created in the most recent tick, for broadcasting. */
  getTickBulletTrails(): BulletTrail[] {
    return this.tickBulletTrails;
  }

  /** Kill-feed entries recorded during the most recent tick, for broadcasting. */
  getTickKillFeedEntries(): KillFeedEntry[] {
    return this.tickKillFeedEntries;
  }

  /** Pickup collections recorded during the most recent tick, for broadcasting. */
  getTickPickupCollections(): Array<{ pickupId: string; playerId: PlayerId }> {
    return this.tickPickupCollections;
  }

  /** Active grenades in flight, for broadcasting. */
  getActiveGrenades(): GrenadeState[] {
    return this.combatManager.getGrenades();
  }

  /** The final-minute event that is currently active, or null. */
  get activeEvent(): FinalMinuteEvent | null {
    return this._eventStarted ? this._activeEvent : null;
  }

  /**
   * Consume the eventWarning generated this tick (if any) for broadcasting.
   * Returns null on subsequent calls in the same tick.
   */
  consumeTickEventWarning(): { event: FinalMinuteEvent; activatesInMs: number } | null {
    const w = this._eventWarningThisTick;
    this._eventWarningThisTick = null;
    return w;
  }

  /**
   * Consume the eventStart generated this tick (if any) for broadcasting.
   * Returns null on subsequent calls in the same tick.
   */
  consumeTickEventStart(): FinalMinuteEvent | null {
    const e = this._eventStartThisTick;
    this._eventStartThisTick = null;
    return e;
  }

  /** Collect a pickup for a player, applying its effect. */
  tryCollectPickup(playerId: PlayerId): PickupState | null {
    const player = this.players.get(playerId);
    if (!player || player.isDead) return null;

    const pickup = this.pickupManager.checkCollection(player.position, {
      width: PLAYER.HITBOX_WIDTH,
      height: PLAYER.HITBOX_HEIGHT,
    });
    if (!pickup) return null;

    const applied = this.pickupManager.applyPickup(pickup, player);
    if (!applied) return null;

    this.pickupManager.collectPickup(pickup.id);
    return pickup;
  }

  // ──────────────────────────── Private ────────────────────────────

  private updateCountdown(dt: number): void {
    this.countdownTimer -= dt;
    if (this.countdownTimer <= 0) {
      this.countdownTimer = 0;
      this.phase = MatchPhase.ACTIVE;
      this.matchTimer = MATCH.TIME_LIMIT;
      this._matchStartTimeMs = Date.now();
      this.gameMode.onStart(this);
    }
  }

  private updateActive(dt: number): void {
    this.matchTimer -= dt;
    if (this.matchTimer < 0) {
      this.matchTimer = 0;
    }

    // Clear last tick's bullet trails — only trails from THIS tick are
    // broadcast in the next gameState message.
    this.tickBulletTrails = [];
    this.tickKillFeedEntries = [];
    this.tickPickupCollections = [];

    // Snapshot positions BEFORE this tick's inputs move anyone. A shot
    // that arrives this tick will rewind opponents to the snapshot taken
    // at (now - rtt/2), which lines up with what the shooter saw on
    // their screen when they pulled the trigger. The buffer self-clamps
    // when empty (first tick of the match), so this is safe even before
    // any state is stored.
    this.rewindTickCounter += 1;
    this.lagCompensator.saveCurrentState(
      this.rewindTickCounter,
      Date.now(),
      this.players,
    );

    this.maybeTriggerFinalMinuteEvent();

    const grid = this.mapManager.getCollisionGrid();

    // Process movement and player-driven actions for each player.
    for (const [playerId, player] of this.players) {
      const queue = this.inputQueues.get(playerId);
      if (!queue) continue;

      if (player.isDead) {
        const ignoredInputs = queue.drain();
        const lastIgnored = ignoredInputs[ignoredInputs.length - 1];
        if (lastIgnored) {
          player.lastProcessedInput = lastIgnored.sequenceNumber;
          player.aimAngle = lastIgnored.aimAngle;
        }
        continue;
      }

      const inputs = queue.drain(SERVER.MAX_INPUTS_PER_PLAYER_PER_TICK);
      if (inputs.length === 0) continue;

      const movementModifiers = eventToMovementModifiers(this.activeEvent);
      const grenadesOnly = this.activeEvent === 'grenades_only';
      const infiniteAmmo = this.activeEvent === 'infinite_ammo';

      for (const input of inputs) {
        // Movement. Each client input represents one fixed simulation tick,
        // so replay queued inputs one at a time with the server tick dt.
        const result = calculateMovement(
          input,
          player.position,
          player.stamina,
          dt,
          grid,
          movementModifiers,
        );
        player.position = result.newPos;
        player.velocity = result.velocity;
        player.stamina = result.newStamina;
        player.isSprinting =
          input.sprint && (input.moveX !== 0 || input.moveY !== 0) && player.stamina > 0;
        player.aimAngle = input.aimAngle;

        // Reload — gated off during infinite_ammo (mag is always full).
        if (
          !infiniteAmmo &&
          input.reload &&
          !player.isReloading &&
          player.ammo < GUN.MAGAZINE_SIZE
        ) {
          player.isReloading = true;
          player.reloadTimer = GUN.RELOAD_TIME;
        }

        // Start a burst on the LMB-release edge. Refuse if the player is
        // already mid-burst, reloading, or out of ammo. During grenades_only
        // the gun is disabled entirely.
        const alreadyBursting = this.pendingBursts.has(playerId);
        if (
          !grenadesOnly &&
          input.firePressed &&
          !alreadyBursting &&
          !player.isReloading &&
          player.ammo > 0
        ) {
          this.fireOneShot(playerId, input.aimAngle, grid);
          // Queue the remaining shots if the burst has more than one round.
          if (GUN.BURST_SIZE > 1) {
            this.pendingBursts.set(playerId, {
              shotsRemaining: GUN.BURST_SIZE - 1,
              nextShotIn: GUN.BURST_INTERVAL,
              lockedAngle: input.aimAngle,
            });
          }
        }

        // Throw grenade (release edge), only if no live grenade for this
        // player and they have at least one grenade in their pouch.
        if (
          input.throwPressed &&
          player.grenades > 0 &&
          !this.combatManager.getActiveGrenadeFor(playerId)
        ) {
          this.combatManager.spawnGrenade(playerId, player.position, input.aimAngle);
          player.grenades -= 1;
          this.stats.recordGrenade(playerId);
        }

        // Manual detonation (press edge), only if a live grenade exists.
        if (input.detonatePressed) {
          const active = this.combatManager.getActiveGrenadeFor(playerId);
          if (active) {
            const explosion = this.combatManager.detonateGrenade(active.id, this.players, grid);
            if (explosion) {
              this.recordExplosion(explosion);
            }
          }
        }

        player.lastProcessedInput = input.sequenceNumber;
      }
    }

    // Advance any pending bursts.
    this.advanceBursts(dt, grid);

    // Update grenades (movement + safety fuse + explosions)
    const { explosions } = this.combatManager.updateGrenades(dt, this.players, grid);
    for (const explosion of explosions) {
      this.recordExplosion(explosion);
    }

    // Reload timers — short-circuited under infinite_ammo so the mag is
    // never empty and reloads can never start.
    const infiniteAmmoActive = this.activeEvent === 'infinite_ammo';
    for (const player of this.players.values()) {
      if (infiniteAmmoActive) {
        player.isReloading = false;
        player.reloadTimer = 0;
        player.ammo = GUN.MAGAZINE_SIZE;
        continue;
      }
      if (player.isReloading) {
        player.reloadTimer -= dt;
        if (player.reloadTimer <= 0) {
          player.isReloading = false;
          player.reloadTimer = 0;
          player.ammo = GUN.MAGAZINE_SIZE;
        }
      }
    }

    // Grenade auto-refill during grenades_only (single-slot regen timer).
    if (this.activeEvent === 'grenades_only') {
      for (const player of this.players.values()) {
        if (player.isDead) continue;
        if (player.grenades >= GRENADE.MAX_COUNT) {
          player.grenadeRegenSeconds = 0;
          continue;
        }
        player.grenadeRegenSeconds += dt;
        if (player.grenadeRegenSeconds >= EVENT.GRENADES_ONLY_REFILL_SECONDS) {
          player.grenades = Math.min(GRENADE.MAX_COUNT, player.grenades + 1);
          player.grenadeRegenSeconds = 0;
        }
      }
    }

    // Update respawn timers for dead players
    for (const player of this.players.values()) {
      if (player.isDead && player.respawnTimer > 0) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) {
          this.respawnPlayer(player);
        }
      }
      // Tick invulnerability timer
      if (player.invulnerableTimer > 0) {
        player.invulnerableTimer -= dt;
        if (player.invulnerableTimer < 0) {
          player.invulnerableTimer = 0;
        }
      }
    }

    // Update pickups
    this.pickupManager.update(dt);

    // Pickup collection
    for (const player of this.players.values()) {
      if (player.isDead) continue;
      const pickup = this.pickupManager.checkCollection(player.position, {
        width: PLAYER.HITBOX_WIDTH,
        height: PLAYER.HITBOX_HEIGHT,
      });
      if (pickup) {
        const applied = this.pickupManager.applyPickup(pickup, player);
        if (applied) {
          this.pickupManager.collectPickup(pickup.id);
          this.tickPickupCollections.push({ pickupId: pickup.id, playerId: player.id });
        }
      }
    }

    // Game mode tick
    this.gameMode.onTick(this, dt);

    // Check win conditions
    this.checkMatchEnd();
  }

  /**
   * Advance burst timers and fire any rounds whose interval has elapsed.
   * Cancels a burst if the player runs out of ammo (and starts a reload) or
   * dies mid-burst.
   */
  private advanceBursts(dt: number, grid: ReturnType<MapManager['getCollisionGrid']>): void {
    for (const [playerId, burst] of this.pendingBursts) {
      const player = this.players.get(playerId);
      if (!player || player.isDead) {
        this.pendingBursts.delete(playerId);
        continue;
      }

      const infiniteAmmo = this.activeEvent === 'infinite_ammo';
      burst.nextShotIn -= dt;
      // Fire all shots whose timer has elapsed (handles slow ticks gracefully).
      while (burst.nextShotIn <= 0 && burst.shotsRemaining > 0) {
        if (!infiniteAmmo && player.ammo <= 0) {
          // Out of ammo mid-burst: drop remaining shots and start a reload.
          if (!player.isReloading) {
            player.isReloading = true;
            player.reloadTimer = GUN.RELOAD_TIME;
          }
          burst.shotsRemaining = 0;
          break;
        }

        this.fireOneShot(playerId, burst.lockedAngle, grid);
        burst.shotsRemaining -= 1;
        burst.nextShotIn += GUN.BURST_INTERVAL;
      }

      if (burst.shotsRemaining <= 0) {
        this.pendingBursts.delete(playerId);
      }
    }
  }

  /**
   * Fire one round at the given angle from the player's current position.
   * Records the shot, decrements ammo, and applies damage.
   */
  private fireOneShot(
    playerId: PlayerId,
    aimAngle: number,
    grid: ReturnType<MapManager['getCollisionGrid']>,
  ): void {
    const player = this.players.get(playerId);
    if (!player) return;

    // Route every shot — including subsequent burst rounds — through lag
    // compensation. The shooter's position stays current (they see
    // themselves in real time); opponents get rewound to render time. RTT
    // of 0 collapses to a normal processShot, so unit tests with no RTT
    // resolver behave identically to the pre-lag-comp path.
    const rtt = this.rttForShooter(playerId);
    const shot = this.lagCompensator.processShootWithRewind(
      playerId,
      aimAngle,
      this.players,
      grid,
      rtt,
    );
    this.tickBulletTrails.push(shot.trail);
    if (this.activeEvent !== 'infinite_ammo') {
      player.ammo = Math.max(0, player.ammo - 1);
    }
    this.stats.recordShot(playerId);

    if (shot.hit && shot.victimId && shot.damage !== undefined) {
      const victim = this.players.get(shot.victimId);
      if (victim) {
        const result = this.combatManager.applyDamage(victim, shot.damage, playerId);
        this.stats.recordHit(playerId);
        this.stats.recordDamage(playerId, shot.damage);
        if (result.killed && result.entry) {
          this.onKill(playerId, shot.victimId, 'gun');
        }
      }
    }
  }

  /** Apply stats and kill credit for an explosion that just happened. */
  private recordExplosion(explosion: { throwerId: PlayerId; damages: { playerId: PlayerId; damage: number; killed: boolean }[] }): void {
    for (const dmg of explosion.damages) {
      // Credit damage to the thrower. Self-damage from your own grenade
      // is real and intentional, but don't award yourself a kill.
      this.stats.recordDamage(explosion.throwerId, dmg.damage);
      if (dmg.killed && dmg.playerId !== explosion.throwerId) {
        this.onKill(explosion.throwerId, dmg.playerId, 'grenade');
      } else if (dmg.killed) {
        // Suicide via own grenade. In a duel, credit the kill to the only
        // other connected player so their score still ticks. In FFA with
        // multiple opponents we can't safely pick one, so the death just
        // costs the suicide victim and no kill is awarded.
        const opponents: PlayerId[] = [];
        for (const id of this.connectedPlayers) {
          if (id !== dmg.playerId) opponents.push(id);
        }
        if (opponents.length === 1) {
          this.onKill(opponents[0], dmg.playerId, 'grenade');
        } else {
          const victim = this.players.get(dmg.playerId);
          if (victim) {
            victim.isDead = true;
            victim.respawnTimer = RESPAWN.DELAY;
            victim.deaths++;
            this.pendingBursts.delete(dmg.playerId);
          }
        }
      }
    }
  }

  private respawnPlayer(player: PlayerState): void {
    // Random spawn that isn't already occupied by another player. Reading
    // positions fresh each call means a co-respawning player processed earlier
    // in this same tick is already at their new spawn and will be avoided.
    const otherPositions: { x: number; y: number }[] = [];
    for (const other of this.players.values()) {
      if (other.id !== player.id) otherPositions.push(other.position);
    }
    const spawnPos = this.mapManager.pickRespawnPoint(otherPositions, this.rng);
    player.position = { ...spawnPos };
    player.velocity = { x: 0, y: 0 };
    // Honor any current cap (e.g. low_health drops maxHealth to 1) instead of
    // resetting to the default — otherwise the event would only bite on first
    // hit after respawn.
    player.health = player.maxHealth;
    player.isDead = false;
    player.respawnTimer = 0;
    player.invulnerableTimer = RESPAWN.INVULNERABILITY_DURATION;
    player.ammo = GUN.MAGAZINE_SIZE;
    player.isReloading = false;
    player.reloadTimer = 0;
    player.stamina = PLAYER.SPRINT_DURATION;
    // During grenades_only, top up to MAX so respawning isn't a death sentence.
    player.grenades =
      this.activeEvent === 'grenades_only' ? GRENADE.MAX_COUNT : GRENADE.STARTING_COUNT;
    player.grenadeRegenSeconds = 0;
  }

  private createPlayerState(id: PlayerId, nickname: string, position: { x: number; y: number }): PlayerState {
    return {
      id,
      nickname,
      // Set during the CHARACTER_SELECT → COUNTDOWN transition by
      // updateCharacterSelect, from each player's locked selection.
      characterId: null,
      position: { x: position.x, y: position.y },
      velocity: { x: 0, y: 0 },
      aimAngle: 0,
      health: PLAYER.MAX_HEALTH,
      maxHealth: PLAYER.MAX_HEALTH,
      ammo: GUN.MAGAZINE_SIZE,
      isReloading: false,
      reloadTimer: 0,
      grenades: GRENADE.STARTING_COUNT,
      grenadeRegenSeconds: 0,
      isSprinting: false,
      stamina: PLAYER.SPRINT_DURATION,
      isDead: false,
      respawnTimer: 0,
      invulnerableTimer: 0,
      lastProcessedInput: 0,
      score: 0,
      deaths: 0,
    };
  }

  /**
   * Check whether the match timer has crossed the warning or activation
   * thresholds and emit the corresponding one-shot events. Idempotent within
   * a match — picks one event uniformly at random and uses the same one for
   * warning and start.
   */
  private maybeTriggerFinalMinuteEvent(): void {
    if (
      !this._warningSent &&
      this.matchTimer <= EVENT.WARNING_AT_REMAINING &&
      this.matchTimer > 0
    ) {
      this._activeEvent = this.pickRandomEvent();
      this._warningSent = true;
      this._eventWarningThisTick = {
        event: this._activeEvent,
        activatesInMs: Math.max(
          0,
          (this.matchTimer - EVENT.ACTIVATION_AT_REMAINING) * 1000,
        ),
      };
    }

    if (!this._eventStarted && this.matchTimer <= EVENT.ACTIVATION_AT_REMAINING) {
      // Defensive: if matchTimer crossed both thresholds in a single tick the
      // warning still goes out first this tick, paired with the same event.
      if (!this._activeEvent) {
        this._activeEvent = this.pickRandomEvent();
        this._warningSent = true;
        this._eventWarningThisTick = {
          event: this._activeEvent,
          activatesInMs: 0,
        };
      }
      this._eventStarted = true;
      this._eventStartThisTick = this._activeEvent;
      this.applyEventOnTrigger(this._activeEvent);
    }
  }

  private pickRandomEvent(): FinalMinuteEvent {
    const forced = process.env.FORCE_EVENT;
    if (forced && (EVENT.POOL as readonly string[]).includes(forced)) {
      return forced as FinalMinuteEvent;
    }
    const idx = Math.floor(this.rng() * EVENT.POOL.length);
    return EVENT.POOL[Math.min(idx, EVENT.POOL.length - 1)];
  }

  private applyEventOnTrigger(event: FinalMinuteEvent): void {
    switch (event) {
      case 'super_speed':
        // Per-tick modifier applied via calculateMovement; nothing to mutate.
        return;
      case 'grenades_only':
        for (const player of this.players.values()) {
          player.grenades = GRENADE.MAX_COUNT;
          player.grenadeRegenSeconds = 0;
        }
        // Cancel in-flight bursts; the gun is gated off from this tick on.
        this.pendingBursts.clear();
        return;
      case 'infinite_ammo':
        for (const player of this.players.values()) {
          player.ammo = GUN.MAGAZINE_SIZE;
          player.isReloading = false;
          player.reloadTimer = 0;
        }
        return;
      case 'low_health':
        for (const player of this.players.values()) {
          player.maxHealth = EVENT.LOW_HEALTH_HP;
          if (!player.isDead) {
            player.health = Math.min(player.health, EVENT.LOW_HEALTH_HP);
          }
        }
        return;
    }
  }
}
