import {
  MatchPhase,
  GameModeType,
  MATCH,
  RESPAWN,
  PLAYER,
  GUN,
  calculateMovement,
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
} from '@shared/game';
import { PickupManager } from './pickup-manager.js';
import { StatsTracker } from './stats-tracker.js';
import { MapManager } from './map-manager.js';
import { CombatManager } from './combat-manager.js';
import { getGameMode } from './modes/index.js';
import type { GameMode, MatchContext } from './modes/game-mode.js';

interface PendingBurst {
  shotsRemaining: number;
  /** Seconds until the next shot in the burst fires. */
  nextShotIn: number;
  /** Aim angle locked when the player released LMB. */
  lockedAngle: number;
}

export class Match implements MatchContext {
  readonly matchId: string;
  phase: MatchPhase = MatchPhase.WAITING;
  countdownTimer = 0;
  matchTimer = 0;
  players: Map<PlayerId, PlayerState> = new Map();
  readonly stats: StatsTracker;
  readonly pickupManager: PickupManager;
  readonly mapManager: MapManager;
  private readonly gameMode: GameMode;
  private readonly killFeed: KillFeedEntry[] = [];
  readonly combatManager: CombatManager = new CombatManager();
  /** Recent bullet trails from this tick, cleared after broadcast. */
  private tickBulletTrails: BulletTrail[] = [];
  /** Most recent input per player, processed each tick. */
  private pendingInputs: Map<PlayerId, PlayerInput> = new Map();
  /** Active 3-shot bursts in flight, keyed by player. */
  private pendingBursts: Map<PlayerId, PendingBurst> = new Map();
  /** Timestamp when the match became ACTIVE, for duration tracking. */
  get matchStartTime(): number {
    return this._matchStartTimeMs;
  }
  private _matchStartTimeMs = 0;
  private connectedPlayers: Set<PlayerId> = new Set();

  constructor(
    matchId: string,
    mapData: MapData,
    playerEntries: Array<{ id: PlayerId; nickname: string }>,
    gameModeType: GameModeType = GameModeType.DEATHMATCH,
  ) {
    this.matchId = matchId;
    this.stats = new StatsTracker();
    this.pickupManager = new PickupManager();
    this.mapManager = new MapManager();
    this.gameMode = getGameMode(gameModeType);

    this.mapManager.loadMap(mapData);
    this.pickupManager.initFromMap(mapData);

    for (const entry of playerEntries) {
      const spawnPos = this.mapManager.getRandomSpawnPoint();
      const player = this.createPlayerState(entry.id, entry.nickname, spawnPos);
      this.players.set(entry.id, player);
      this.stats.initPlayer(entry.id);
      this.connectedPlayers.add(entry.id);
    }
  }

  /** Queue a player input to be processed on the next tick. */
  queueInput(playerId: PlayerId, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (!player) return;

    // Most fields (movement, aim, sprint) are level signals — overwriting is
    // safe. The release/press edge fields are one-shot signals; if multiple
    // inputs arrive within a single tick window, OR them onto the latest so
    // we don't drop a click.
    const existing = this.pendingInputs.get(playerId);
    if (existing) {
      input = {
        ...input,
        firePressed: input.firePressed || existing.firePressed,
        throwPressed: input.throwPressed || existing.throwPressed,
        detonatePressed: input.detonatePressed || existing.detonatePressed,
      };
    }

    this.pendingInputs.set(playerId, input);
    player.lastProcessedInput = input.sequenceNumber;
    player.aimAngle = input.aimAngle;
  }

  /** Start the countdown phase. */
  startCountdown(): void {
    if (this.phase !== MatchPhase.WAITING) return;
    this.phase = MatchPhase.COUNTDOWN;
    this.countdownTimer = MATCH.COUNTDOWN_DURATION;
  }

  /** Main per-tick update. dt is in seconds. */
  update(dt: number): void {
    switch (this.phase) {
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

    // Cancel any in-flight burst for the killed player.
    this.pendingBursts.delete(victimId);

    this.killFeed.push({
      killerId,
      victimId,
      weapon,
      timestamp: Date.now(),
    });
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

  /** Active grenades in flight, for broadcasting. */
  getActiveGrenades(): GrenadeState[] {
    return this.combatManager.getGrenades();
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

    const grid = this.mapManager.getCollisionGrid();

    // Process movement and player-driven actions for each player.
    for (const [playerId, player] of this.players) {
      if (player.isDead) continue;
      const input = this.pendingInputs.get(playerId);
      if (!input) continue;

      // Movement
      const result = calculateMovement(input, player.position, player.stamina, dt, grid);
      player.position = result.newPos;
      player.velocity = result.velocity;
      player.stamina = result.newStamina;
      player.isSprinting = input.sprint && player.stamina > 0;
      player.aimAngle = input.aimAngle;

      // Reload
      if (input.reload && !player.isReloading && player.ammo < GUN.MAGAZINE_SIZE) {
        player.isReloading = true;
        player.reloadTimer = GUN.RELOAD_TIME;
      }

      // Start a burst on the LMB-release edge. Refuse if the player is
      // already mid-burst, reloading, or out of ammo.
      const alreadyBursting = this.pendingBursts.has(playerId);
      if (
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

      // Throw grenade (release edge), only if no live grenade for this player.
      if (
        input.throwPressed &&
        !this.combatManager.getActiveGrenadeFor(playerId)
      ) {
        this.combatManager.spawnGrenade(playerId, player.position, input.aimAngle);
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
    }
    this.pendingInputs.clear();

    // Advance any pending bursts.
    this.advanceBursts(dt, grid);

    // Update grenades (movement + safety fuse + explosions)
    const { explosions } = this.combatManager.updateGrenades(dt, this.players, grid);
    for (const explosion of explosions) {
      this.recordExplosion(explosion);
    }

    // Reload timers
    for (const player of this.players.values()) {
      if (player.isReloading) {
        player.reloadTimer -= dt;
        if (player.reloadTimer <= 0) {
          player.isReloading = false;
          player.reloadTimer = 0;
          player.ammo = GUN.MAGAZINE_SIZE;
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
        this.pickupManager.applyPickup(pickup, player);
        this.pickupManager.collectPickup(pickup.id);
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

      burst.nextShotIn -= dt;
      // Fire all shots whose timer has elapsed (handles slow ticks gracefully).
      while (burst.nextShotIn <= 0 && burst.shotsRemaining > 0) {
        if (player.ammo <= 0) {
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

    const shot = this.combatManager.processShot(playerId, aimAngle, this.players, grid);
    this.tickBulletTrails.push(shot.trail);
    player.ammo = Math.max(0, player.ammo - 1);
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
        // Suicide: mark dead without crediting a kill.
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

  private respawnPlayer(player: PlayerState): void {
    // Find a spawn point far from where the player died
    const spawnPos = this.mapManager.getSpawnPointAwayFrom(player.position);
    player.position = { ...spawnPos };
    player.velocity = { x: 0, y: 0 };
    player.health = PLAYER.MAX_HEALTH;
    player.isDead = false;
    player.respawnTimer = 0;
    player.invulnerableTimer = RESPAWN.INVULNERABILITY_DURATION;
    player.ammo = GUN.MAGAZINE_SIZE;
    player.isReloading = false;
    player.reloadTimer = 0;
    player.stamina = PLAYER.SPRINT_DURATION;
  }

  private createPlayerState(id: PlayerId, nickname: string, position: { x: number; y: number }): PlayerState {
    return {
      id,
      nickname,
      position: { x: position.x, y: position.y },
      velocity: { x: 0, y: 0 },
      aimAngle: 0,
      health: PLAYER.MAX_HEALTH,
      maxHealth: PLAYER.MAX_HEALTH,
      ammo: GUN.MAGAZINE_SIZE,
      isReloading: false,
      reloadTimer: 0,
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
}
