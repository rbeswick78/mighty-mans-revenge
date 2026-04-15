import {
  MatchPhase,
  GameModeType,
  MATCH,
  RESPAWN,
  PLAYER,
  GUN,
  GRENADE,
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
} from '@shared/game';
import { PickupManager } from './pickup-manager.js';
import { StatsTracker } from './stats-tracker.js';
import { MapManager } from './map-manager.js';
import { getGameMode } from './modes/index.js';
import type { GameMode, MatchContext } from './modes/game-mode.js';

/** Minimal interface for the combat system. The real implementation will satisfy this. */
export interface CombatManager {
  update(dt: number, players: Map<PlayerId, PlayerState>): void;
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
  private combatManager: CombatManager | null = null;
  /** Most recent input per player, processed each tick. */
  private pendingInputs: Map<PlayerId, PlayerInput> = new Map();
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

  /** Optionally attach a combat manager. */
  setCombatManager(combat: CombatManager): void {
    this.combatManager = combat;
  }

  /** Queue a player input to be processed on the next tick. */
  queueInput(playerId: PlayerId, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (!player) return;
    // Keep only the latest input per player; it carries the cumulative state
    // (movement, aim, buttons) so intermediate inputs can be safely dropped.
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

    // Process movement for each player using their most recent input.
    const grid = this.mapManager.getCollisionGrid();
    for (const [playerId, player] of this.players) {
      if (player.isDead) continue;
      const input = this.pendingInputs.get(playerId);
      if (!input) continue;

      const result = calculateMovement(input, player.position, player.stamina, dt, grid);
      player.position = result.newPos;
      player.velocity = result.velocity;
      player.stamina = result.newStamina;
      player.isSprinting = input.sprint && player.stamina > 0;
    }
    this.pendingInputs.clear();

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

    // Update combat if available
    if (this.combatManager) {
      this.combatManager.update(dt, this.players);
    }

    // Game mode tick
    this.gameMode.onTick(this, dt);

    // Check win conditions
    this.checkMatchEnd();
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
    player.grenades = GRENADE.MAX_CARRY;
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
      grenades: GRENADE.MAX_CARRY,
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
