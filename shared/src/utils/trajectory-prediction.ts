import { Vec2, PlayerId } from '../types/common.js';
import { PlayerState } from '../types/player.js';
import { CollisionGrid } from '../types/map.js';
import { GUN, GRENADE, PLAYER, TRAJECTORY } from '../config/game.js';
import { raycastAgainstGrid } from './collision.js';
import { rayIntersectsAABB } from './ray-aabb.js';
import { vecAdd, vecFromAngle, vecScale } from './math.js';
import { stepGrenade } from './grenade-physics.js';

export interface BulletAim {
  endPos: Vec2;
  hitPlayerId: PlayerId | null;
}

/**
 * Mirror of the server's hit-scan calculation, used client-side to draw the
 * aim line. Excludes the shooter; ignores dead/invulnerable players. Pure —
 * does not mutate any input.
 */
export function predictBulletRay(
  shooterId: PlayerId,
  origin: Vec2,
  aimAngle: number,
  players: Map<PlayerId, PlayerState> | Iterable<PlayerState>,
  grid: CollisionGrid,
): BulletAim {
  const dir = vecFromAngle(aimAngle);
  const maxRayDistance = GUN.FALLOFF_RANGE_MAX * 2;

  const wallHit = raycastAgainstGrid(grid, origin.x, origin.y, aimAngle, maxRayDistance);
  const wallDistance = wallHit.hitTile ? wallHit.distance : maxRayDistance;

  let closestHit: { playerId: PlayerId; distance: number } | null = null;

  const iter: Iterable<PlayerState> =
    players instanceof Map ? players.values() : players;

  for (const playerState of iter) {
    if (playerState.id === shooterId) continue;
    if (playerState.isDead) continue;
    if (playerState.invulnerableTimer > 0) continue;

    const halfW = PLAYER.HITBOX_WIDTH / 2;
    const halfH = PLAYER.HITBOX_HEIGHT / 2;

    const hitDist = rayIntersectsAABB(
      origin.x,
      origin.y,
      dir.x,
      dir.y,
      playerState.position.x,
      playerState.position.y,
      halfW,
      halfH,
    );

    if (hitDist !== null && hitDist > 0 && hitDist < wallDistance) {
      if (!closestHit || hitDist < closestHit.distance) {
        closestHit = { playerId: playerState.id, distance: hitDist };
      }
    }
  }

  if (closestHit) {
    return {
      endPos: vecAdd(origin, vecScale(dir, closestHit.distance)),
      hitPlayerId: closestHit.playerId,
    };
  }

  return {
    endPos: wallHit.hitTile
      ? { x: wallHit.hitX, y: wallHit.hitY }
      : vecAdd(origin, vecScale(dir, maxRayDistance)),
    hitPlayerId: null,
  };
}

/**
 * Forward-simulate a thrown grenade and return the polyline of positions it
 * would visit. Uses the same `stepGrenade` integrator as the server, so the
 * preview matches the actual flight (including bounces).
 */
export function predictGrenadePath(
  origin: Vec2,
  aimAngle: number,
  grid: CollisionGrid,
  durationSeconds: number = TRAJECTORY.PREVIEW_SECONDS,
  stepDt: number = TRAJECTORY.PREVIEW_STEP_DT,
): Vec2[] {
  const velocity = vecScale(vecFromAngle(aimAngle), GRENADE.THROW_SPEED);
  const sim = {
    position: { x: origin.x, y: origin.y },
    velocity: { x: velocity.x, y: velocity.y },
  };

  const points: Vec2[] = [{ x: sim.position.x, y: sim.position.y }];
  const totalSteps = Math.max(1, Math.ceil(durationSeconds / stepDt));

  for (let i = 0; i < totalSteps; i++) {
    stepGrenade(sim, stepDt, grid);
    points.push({ x: sim.position.x, y: sim.position.y });
  }

  return points;
}
