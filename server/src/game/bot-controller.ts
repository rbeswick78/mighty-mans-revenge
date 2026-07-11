import {
  BOT,
  KOTH,
  MatchPhase,
  GameModeType,
  WEAPONS,
  gunGameRungForScore,
  raycastAgainstGrid,
} from '@shared/game';
import type {
  CollisionGrid,
  PlayerId,
  PlayerInput,
  PlayerState,
  Vec2,
} from '@shared/game';
import type { Match } from './match.js';

export interface GridPoint {
  x: number;
  y: number;
}

/** Small deterministic BFS over the map's shared collision grid. */
export function findGridPath(
  grid: CollisionGrid,
  start: GridPoint,
  goal: GridPoint,
): GridPoint[] {
  const inBounds = (point: GridPoint): boolean =>
    point.x >= 0 &&
    point.x < grid.width &&
    point.y >= 0 &&
    point.y < grid.height;
  if (!inBounds(start) || !inBounds(goal)) return [];
  if (grid.solid[start.y][start.x] || grid.solid[goal.y][goal.x]) return [];

  const key = (point: GridPoint): string => `${point.x},${point.y}`;
  const queue: GridPoint[] = [start];
  const cameFrom = new Map<string, GridPoint | null>([[key(start), null]]);
  const directions: readonly GridPoint[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];

  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor++];
    if (current.x === goal.x && current.y === goal.y) break;
    for (const direction of directions) {
      const next = {
        x: current.x + direction.x,
        y: current.y + direction.y,
      };
      const nextKey = key(next);
      if (
        !inBounds(next) ||
        grid.solid[next.y][next.x] ||
        cameFrom.has(nextKey)
      ) {
        continue;
      }
      cameFrom.set(nextKey, current);
      queue.push(next);
    }
  }

  if (!cameFrom.has(key(goal))) return [];
  const reversed: GridPoint[] = [];
  let current: GridPoint | null = goal;
  while (current !== null) {
    reversed.push(current);
    current = cameFrom.get(key(current)) ?? null;
  }
  return reversed.reverse();
}

function normalized(dx: number, dy: number): Vec2 {
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
}

/**
 * A moderate server-authoritative opponent. It submits ordinary sequenced
 * PlayerInput, so every action goes through the real shared physics and
 * Match combat/mode state machines.
 */
export class BotController {
  private sequence = 0;
  private elapsedSeconds = 0;
  private pathRecalcSeconds = 0;
  private waypoint: Vec2 | null = null;
  private strafeSeconds = BOT.STRAFE_SWITCH_SECONDS;
  private strafeSign = 1;
  private fireSeconds = 0;
  private grenadeSeconds = 2.5;
  private activeGrenadeSeconds = 0;
  private abilitySeconds = BOT.ABILITY_OPENING_DELAY_SECONDS;

  constructor(readonly playerId: PlayerId) {}

  update(dt: number, match: Match, tick: number): void {
    if (match.phase !== MatchPhase.ACTIVE) return;
    const bot = match.players.get(this.playerId);
    if (!bot || bot.isDead) return;
    const target = this.pickTarget(bot, match.players);
    if (!target) return;

    this.elapsedSeconds += dt;
    this.pathRecalcSeconds -= dt;
    this.strafeSeconds -= dt;
    this.fireSeconds -= dt;
    this.grenadeSeconds -= dt;
    this.abilitySeconds -= dt;
    if (this.strafeSeconds <= 0) {
      this.strafeSeconds = BOT.STRAFE_SWITCH_SECONDS;
      this.strafeSign *= -1;
    }

    const dx = target.position.x - bot.position.x;
    const dy = target.position.y - bot.position.y;
    const distance = Math.hypot(dx, dy);
    const directAngle = Math.atan2(dy, dx);
    const grid = match.mapManager.getCollisionGrid();
    const ray = raycastAgainstGrid(
      grid,
      bot.position.x,
      bot.position.y,
      directAngle,
      distance,
    );
    const hasLineOfSight = !ray.hitTile || ray.distance >= distance - 8;
    const movementGoal = this.chooseMovementGoal(bot, target, match, grid);
    const movementDx = movementGoal.position.x - bot.position.x;
    const movementDy = movementGoal.position.y - bot.position.y;
    const movementDistance = Math.hypot(movementDx, movementDy);
    const movementAngle = Math.atan2(movementDy, movementDx);
    const movementRay = raycastAgainstGrid(
      grid,
      bot.position.x,
      bot.position.y,
      movementAngle,
      movementDistance,
    );
    const hasDirectMovementPath =
      !movementRay.hitTile || movementRay.distance >= movementDistance - 8;
    const movement = movementGoal.holdPosition
      ? { x: 0, y: 0 }
      : this.chooseMovement(
          bot,
          movementGoal.position,
          grid,
          hasDirectMovementPath,
          movementDistance,
          movementGoal.isCombatTarget,
        );
    const aimAngle =
      directAngle + Math.sin(this.elapsedSeconds * 1.7) * BOT.AIM_WOBBLE_RADIANS;

    const activeGrenade = match.combatManager.getActiveGrenadeFor(this.playerId);
    let throwPressed = false;
    let detonatePressed = false;
    if (activeGrenade) {
      this.activeGrenadeSeconds += dt;
      if (this.activeGrenadeSeconds >= BOT.GRENADE_DETONATE_SECONDS) {
        detonatePressed = true;
        this.activeGrenadeSeconds = 0;
      }
    } else {
      this.activeGrenadeSeconds = 0;
      const grenadeRung =
        match.gameModeType === GameModeType.GUN_GAME &&
        gunGameRungForScore(bot.score).weapon === 'grenade';
      if (
        this.grenadeSeconds <= 0 &&
        bot.grenades > 0 &&
        distance >= 80 &&
        distance <= 440
      ) {
        throwPressed = true;
        this.grenadeSeconds = grenadeRung
          ? BOT.GRENADE_RUNG_INTERVAL_SECONDS
          : BOT.GRENADE_INTERVAL_SECONDS;
      }
    }

    const weapon = WEAPONS[bot.weaponId];
    const usefulRange = Math.min(
      BOT.FIRE_RANGE,
      'maxRange' in weapon ? weapon.maxRange : BOT.FIRE_RANGE,
    );
    const reload = this.shouldReload(bot);
    const firePressed =
      !reload &&
      hasLineOfSight &&
      distance <= usefulRange &&
      this.fireSeconds <= 0;
    if (firePressed) this.fireSeconds = BOT.FIRE_INTERVAL_SECONDS;

    const abilityPressed =
      hasLineOfSight &&
      distance <= BOT.FIRE_RANGE &&
      this.abilitySeconds <= 0 &&
      bot.abilityActiveSeconds <= 0 &&
      bot.abilityCooldownSeconds <= 0;
    if (abilityPressed) this.abilitySeconds = BOT.ABILITY_OPENING_DELAY_SECONDS;

    const input: PlayerInput = {
      sequenceNumber: ++this.sequence,
      moveX: movement.x,
      moveY: movement.y,
      aimAngle,
      aimingGun: hasLineOfSight,
      firePressed,
      aimingGrenade: false,
      throwPressed,
      detonatePressed,
      sprint:
        movementDistance > BOT.PREFERRED_DISTANCE * 1.5 &&
        bot.stamina > 0.35,
      reload,
      abilityPressed,
      tick,
    };
    match.queueInput(this.playerId, input);
  }

  /**
   * KOTH is won by owning space, not by chasing kills. Move into the live
   * hill first, then plant and fight from it; other modes pursue the target.
   */
  private chooseMovementGoal(
    bot: PlayerState,
    target: PlayerState,
    match: Match,
    grid: CollisionGrid,
  ): { position: Vec2; holdPosition: boolean; isCombatTarget: boolean } {
    const koth = match.getKothHudState();
    if (!koth) {
      return {
        position: target.position,
        holdPosition: false,
        isCombatTarget: true,
      };
    }

    const hillLeft = koth.hill.x * grid.tileSize;
    const hillTop = koth.hill.y * grid.tileSize;
    const hillSize = KOTH.HILL_SIZE_TILES * grid.tileSize;
    const isInsideHill =
      bot.position.x >= hillLeft &&
      bot.position.x <= hillLeft + hillSize &&
      bot.position.y >= hillTop &&
      bot.position.y <= hillTop + hillSize;
    return {
      position: {
        x: hillLeft + hillSize / 2,
        y: hillTop + hillSize / 2,
      },
      holdPosition: isInsideHill,
      isCombatTarget: false,
    };
  }

  private pickTarget(
    bot: PlayerState,
    players: Map<PlayerId, PlayerState>,
  ): PlayerState | null {
    let nearest: PlayerState | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const player of players.values()) {
      if (player.id === bot.id || player.isDead) continue;
      const distance = Math.hypot(
        player.position.x - bot.position.x,
        player.position.y - bot.position.y,
      );
      if (distance < nearestDistance) {
        nearest = player;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private chooseMovement(
    bot: PlayerState,
    targetPosition: Vec2,
    grid: CollisionGrid,
    hasDirectPath: boolean,
    distance: number,
    isCombatTarget: boolean,
  ): Vec2 {
    const dx = targetPosition.x - bot.position.x;
    const dy = targetPosition.y - bot.position.y;
    const toward = normalized(dx, dy);
    if (hasDirectPath) {
      this.waypoint = null;
      if (!isCombatTarget) return toward;
      if (distance > BOT.PREFERRED_DISTANCE) return toward;
      if (distance < BOT.RETREAT_DISTANCE) return { x: -toward.x, y: -toward.y };
      return {
        x: -toward.y * this.strafeSign,
        y: toward.x * this.strafeSign,
      };
    }

    if (this.pathRecalcSeconds <= 0 || this.waypoint === null) {
      this.pathRecalcSeconds = BOT.PATH_RECALC_SECONDS;
      const ts = grid.tileSize;
      const path = findGridPath(
        grid,
        {
          x: Math.floor(bot.position.x / ts),
          y: Math.floor(bot.position.y / ts),
        },
        {
          x: Math.floor(targetPosition.x / ts),
          y: Math.floor(targetPosition.y / ts),
        },
      );
      const next = path[1] ?? path[0];
      this.waypoint = next
        ? { x: (next.x + 0.5) * ts, y: (next.y + 0.5) * ts }
        : null;
    }

    return this.waypoint
      ? normalized(
          this.waypoint.x - bot.position.x,
          this.waypoint.y - bot.position.y,
        )
      : toward;
  }

  private shouldReload(bot: PlayerState): boolean {
    if (bot.isReloading || bot.weaponId === 'punch') return false;
    if (bot.weaponId === 'rifle') return bot.ammo <= 0;
    return bot.specialAmmo <= 0 && bot.specialReserve > 0;
  }
}
