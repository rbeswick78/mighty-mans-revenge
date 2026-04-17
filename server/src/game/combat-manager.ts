import {
  type PlayerId,
  type Vec2,
  type PlayerState,
  type CollisionGrid,
  type BulletTrail,
  type GrenadeState,
  type KillFeedEntry,
  PLAYER,
  GUN,
  GRENADE,
  RESPAWN,
  calculateDamage,
  calculateGrenadeDamage,
  isInBlastRadius,
  vecDistance,
  vecFromAngle,
  vecAdd,
  vecScale,
  raycastAgainstGrid,
} from '@shared/game';

export interface ExplosionResult {
  position: Vec2;
  damages: { playerId: PlayerId; damage: number; killed: boolean }[];
  grenadeId: string;
  throwerId: PlayerId;
}

export interface ShotResult {
  hit: boolean;
  victimId?: PlayerId;
  damage?: number;
  trail: BulletTrail;
}

let nextGrenadeId = 0;

function generateGrenadeId(): string {
  return `grenade_${Date.now()}_${nextGrenadeId++}`;
}

/**
 * Ray vs AABB intersection test.
 * Returns the distance along the ray to the intersection point, or null if no hit.
 * Position is the center of the AABB.
 */
function rayIntersectsAABB(
  rayOriginX: number,
  rayOriginY: number,
  rayDirX: number,
  rayDirY: number,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
): number | null {
  const minX = centerX - halfWidth;
  const maxX = centerX + halfWidth;
  const minY = centerY - halfHeight;
  const maxY = centerY + halfHeight;

  let tmin = -Infinity;
  let tmax = Infinity;

  if (rayDirX !== 0) {
    const t1 = (minX - rayOriginX) / rayDirX;
    const t2 = (maxX - rayOriginX) / rayDirX;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else {
    if (rayOriginX < minX || rayOriginX > maxX) return null;
  }

  if (rayDirY !== 0) {
    const t1 = (minY - rayOriginY) / rayDirY;
    const t2 = (maxY - rayOriginY) / rayDirY;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else {
    if (rayOriginY < minY || rayOriginY > maxY) return null;
  }

  if (tmax < 0 || tmin > tmax) return null;

  // Return the nearest positive intersection
  return tmin >= 0 ? tmin : tmax >= 0 ? tmax : null;
}

/**
 * Check line-of-sight between two points using the collision grid.
 * Returns true if there is a clear line of sight (no walls blocking).
 */
function hasLineOfSight(
  from: Vec2,
  to: Vec2,
  grid: CollisionGrid,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return true;

  const angle = Math.atan2(dy, dx);
  const result = raycastAgainstGrid(grid, from.x, from.y, angle, dist);
  return !result.hitTile;
}

export class CombatManager {
  private grenades: GrenadeState[] = [];

  getGrenades(): GrenadeState[] {
    return this.grenades;
  }

  processShot(
    shooterId: PlayerId,
    aimAngle: number,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    rewindStates?: Map<PlayerId, PlayerState>,
  ): ShotResult {
    const shooter = (rewindStates ?? players).get(shooterId) ?? players.get(shooterId);
    if (!shooter) {
      // Shooter not found — return a miss
      return {
        hit: false,
        trail: {
          startPos: { x: 0, y: 0 },
          endPos: { x: 0, y: 0 },
          shooterId,
          timestamp: Date.now(),
        },
      };
    }

    const startPos = { x: shooter.position.x, y: shooter.position.y };
    const dir = vecFromAngle(aimAngle);

    // Raycast against grid to find max distance (wall hit)
    const maxRayDistance = GUN.FALLOFF_RANGE_MAX * 2; // extend past falloff for actual hits
    const wallHit = raycastAgainstGrid(grid, startPos.x, startPos.y, aimAngle, maxRayDistance);
    const wallDistance = wallHit.hitTile ? wallHit.distance : maxRayDistance;

    // Check all living, non-invulnerable, non-shooter players
    let closestHit: { playerId: PlayerId; distance: number } | null = null;
    const targetPlayers = rewindStates ?? players;

    for (const [playerId, playerState] of targetPlayers) {
      if (playerId === shooterId) continue;

      // Use current state for isDead/invulnerableTimer checks
      const currentState = players.get(playerId);
      if (!currentState || currentState.isDead) continue;
      if (currentState.invulnerableTimer > 0) continue;

      const halfW = PLAYER.HITBOX_WIDTH / 2;
      const halfH = PLAYER.HITBOX_HEIGHT / 2;

      const hitDist = rayIntersectsAABB(
        startPos.x,
        startPos.y,
        dir.x,
        dir.y,
        playerState.position.x,
        playerState.position.y,
        halfW,
        halfH,
      );

      if (hitDist !== null && hitDist > 0 && hitDist < wallDistance) {
        if (!closestHit || hitDist < closestHit.distance) {
          closestHit = { playerId, distance: hitDist };
        }
      }
    }

    if (closestHit) {
      const damage = calculateDamage(closestHit.distance);
      const endPos = vecAdd(startPos, vecScale(dir, closestHit.distance));
      return {
        hit: true,
        victimId: closestHit.playerId,
        damage,
        trail: {
          startPos,
          endPos,
          shooterId,
          timestamp: Date.now(),
        },
      };
    }

    // No player hit — trail ends at wall or max distance
    const endPos = wallHit.hitTile
      ? { x: wallHit.hitX, y: wallHit.hitY }
      : vecAdd(startPos, vecScale(dir, maxRayDistance));

    return {
      hit: false,
      trail: {
        startPos,
        endPos,
        shooterId,
        timestamp: Date.now(),
      },
    };
  }

  spawnGrenade(throwerId: PlayerId, position: Vec2, aimAngle: number): GrenadeState {
    const velocity = vecScale(vecFromAngle(aimAngle), GRENADE.THROW_SPEED);
    const grenade: GrenadeState = {
      id: generateGrenadeId(),
      position: { x: position.x, y: position.y },
      velocity,
      fuseTimer: GRENADE.FUSE_TIME,
      throwerId,
    };
    this.grenades.push(grenade);
    return grenade;
  }

  updateGrenades(
    dt: number,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
  ): { explosions: ExplosionResult[] } {
    const explosions: ExplosionResult[] = [];

    for (const grenade of this.grenades) {
      // Move grenade
      const newX = grenade.position.x + grenade.velocity.x * dt;
      const newY = grenade.position.y + grenade.velocity.y * dt;

      // Check wall collisions for bouncing
      const tileX = Math.floor(newX / grid.tileSize);
      const tileY = Math.floor(newY / grid.tileSize);
      const oldTileX = Math.floor(grenade.position.x / grid.tileSize);
      const oldTileY = Math.floor(grenade.position.y / grid.tileSize);

      let hitWallX = false;
      let hitWallY = false;

      // Check X movement
      if (tileX !== oldTileX) {
        const checkX = tileX < 0 || tileX >= grid.width || tileY < 0 || tileY >= grid.height
          ? true
          : grid.solid[Math.floor(grenade.position.y / grid.tileSize)]?.[tileX] ?? true;
        if (checkX) hitWallX = true;
      }

      // Check Y movement
      if (tileY !== oldTileY) {
        const checkY = tileX < 0 || tileX >= grid.width || tileY < 0 || tileY >= grid.height
          ? true
          : grid.solid[tileY]?.[Math.floor(grenade.position.x / grid.tileSize)] ?? true;
        if (checkY) hitWallY = true;
      }

      if (hitWallX) {
        grenade.velocity.x = -grenade.velocity.x;
        // Don't update X position
      } else {
        grenade.position.x = newX;
      }

      if (hitWallY) {
        grenade.velocity.y = -grenade.velocity.y;
        // Don't update Y position
      } else {
        grenade.position.y = newY;
      }

      // Decrement fuse
      grenade.fuseTimer -= dt;
    }

    // Process explosions for grenades whose fuse has expired
    const exploded: GrenadeState[] = [];
    const remaining: GrenadeState[] = [];

    for (const grenade of this.grenades) {
      if (grenade.fuseTimer <= 0) {
        exploded.push(grenade);
      } else {
        remaining.push(grenade);
      }
    }

    this.grenades = remaining;

    for (const grenade of exploded) {
      const damages: ExplosionResult['damages'] = [];

      for (const [playerId, playerState] of players) {
        if (playerState.isDead) continue;

        if (!isInBlastRadius(grenade.position, playerState.position)) continue;

        // Check line of sight — walls block explosion damage
        if (!hasLineOfSight(grenade.position, playerState.position, grid)) continue;

        const dist = vecDistance(grenade.position, playerState.position);
        const damage = calculateGrenadeDamage(dist);

        if (damage > 0) {
          const result = this.applyDamage(playerState, damage, grenade.throwerId);
          damages.push({
            playerId,
            damage,
            killed: result.killed,
          });
        }
      }

      explosions.push({
        position: { x: grenade.position.x, y: grenade.position.y },
        damages,
        grenadeId: grenade.id,
        throwerId: grenade.throwerId,
      });
    }

    return { explosions };
  }

  applyDamage(
    victim: PlayerState,
    damage: number,
    attackerId: PlayerId,
  ): { killed: boolean; entry?: KillFeedEntry } {
    victim.health = Math.max(0, victim.health - damage);

    if (victim.health <= 0) {
      victim.isDead = true;
      victim.respawnTimer = RESPAWN.DELAY;
      victim.deaths += 1;

      const entry: KillFeedEntry = {
        killerId: attackerId,
        victimId: victim.id,
        weapon: 'gun', // caller should override for grenade kills
        timestamp: Date.now(),
      };

      return { killed: true, entry };
    }

    return { killed: false };
  }
}
