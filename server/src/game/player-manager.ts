import {
  PLAYER,
  GUN,
  GRENADE,
  RESPAWN,
  calculateMovement,
} from '@shared/game';
import type { PlayerState, PlayerInput, CollisionGrid, Vec2 } from '@shared/game';
import { InputQueue } from './input-queue.js';
import { logger } from '../utils/logger.js';

export class PlayerManager {
  private players = new Map<string, PlayerState>();
  private inputQueues = new Map<string, InputQueue>();
  private spawnPoints: Vec2[] = [];
  private nextSpawnIndex = 0;

  setSpawnPoints(points: Vec2[]): void {
    this.spawnPoints = points;
    this.nextSpawnIndex = 0;
  }

  addPlayer(id: string, nickname: string): PlayerState {
    const spawnPos = this.getNextSpawnPoint();

    const player: PlayerState = {
      id,
      position: { x: spawnPos.x, y: spawnPos.y },
      velocity: { x: 0, y: 0 },
      aimAngle: 0,
      health: PLAYER.MAX_HEALTH,
      maxHealth: PLAYER.MAX_HEALTH,
      ammo: GUN.MAGAZINE_SIZE,
      isReloading: false,
      reloadTimer: 0,
      grenades: GRENADE.STARTING_COUNT,
      isSprinting: false,
      stamina: PLAYER.SPRINT_DURATION,
      isDead: false,
      respawnTimer: 0,
      invulnerableTimer: RESPAWN.INVULNERABILITY_DURATION,
      lastProcessedInput: 0,
      score: 0,
      deaths: 0,
      nickname,
    };

    this.players.set(id, player);
    this.inputQueues.set(id, new InputQueue());

    logger.info({ playerId: id, nickname, spawn: spawnPos }, 'Player added');
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.inputQueues.delete(id);
    logger.info({ playerId: id }, 'Player removed');
  }

  getPlayer(id: string): PlayerState | undefined {
    return this.players.get(id);
  }

  getAllPlayers(): Map<string, PlayerState> {
    return this.players;
  }

  get playerCount(): number {
    return this.players.size;
  }

  processInput(playerId: string, input: PlayerInput): void {
    const queue = this.inputQueues.get(playerId);
    if (!queue) {
      logger.warn({ playerId }, 'Input received for unknown player');
      return;
    }

    if (!queue.push(input)) {
      logger.debug(
        { playerId, seq: input.sequenceNumber },
        'Duplicate/old input rejected',
      );
    }
  }

  update(dt: number, grid: CollisionGrid): void {
    for (const [playerId, player] of this.players) {
      // Process respawn timer
      if (player.isDead) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) {
          this.respawnPlayer(player);
        }
        // Skip movement processing for dead players
        continue;
      }

      // Process invulnerability timer
      if (player.invulnerableTimer > 0) {
        player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dt);
      }

      // Process reload timer
      if (player.isReloading) {
        player.reloadTimer -= dt;
        if (player.reloadTimer <= 0) {
          player.isReloading = false;
          player.reloadTimer = 0;
          player.ammo = GUN.MAGAZINE_SIZE;
        }
      }

      // Drain and process input queue
      const queue = this.inputQueues.get(playerId);
      if (!queue) continue;

      const inputs = queue.drain();
      for (const input of inputs) {
        // Update aim angle from every input
        player.aimAngle = input.aimAngle;

        // Handle reload request
        if (input.reload && !player.isReloading && player.ammo < GUN.MAGAZINE_SIZE) {
          player.isReloading = true;
          player.reloadTimer = GUN.RELOAD_TIME;
        }

        // Calculate movement using shared physics
        const result = calculateMovement(
          input,
          player.position,
          player.stamina,
          dt / inputs.length, // distribute dt across inputs
          grid,
        );

        player.position = result.newPos;
        player.velocity = result.velocity;
        player.stamina = result.newStamina;
        player.isSprinting =
          input.sprint && (input.moveX !== 0 || input.moveY !== 0) && player.stamina > 0;

        player.lastProcessedInput = input.sequenceNumber;
      }
    }
  }

  private respawnPlayer(player: PlayerState): void {
    const spawnPos = this.getNextSpawnPoint();
    player.position = { x: spawnPos.x, y: spawnPos.y };
    player.velocity = { x: 0, y: 0 };
    player.health = PLAYER.MAX_HEALTH;
    player.ammo = GUN.MAGAZINE_SIZE;
    player.isReloading = false;
    player.reloadTimer = 0;
    player.grenades = GRENADE.STARTING_COUNT;
    player.isDead = false;
    player.respawnTimer = 0;
    player.invulnerableTimer = RESPAWN.INVULNERABILITY_DURATION;
    player.stamina = PLAYER.SPRINT_DURATION;

    logger.info({ playerId: player.id, spawn: spawnPos }, 'Player respawned');
  }

  private getNextSpawnPoint(): Vec2 {
    if (this.spawnPoints.length === 0) {
      // Fallback default spawn
      return { x: 100, y: 100 };
    }
    const point = this.spawnPoints[this.nextSpawnIndex % this.spawnPoints.length]!;
    this.nextSpawnIndex++;
    return { x: point.x, y: point.y };
  }
}
