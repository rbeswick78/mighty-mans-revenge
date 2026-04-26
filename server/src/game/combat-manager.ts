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
  rayIntersectsAABB,
  stepGrenade,
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

  /** Find this player's in-flight grenade, if any. */
  getActiveGrenadeFor(playerId: PlayerId): GrenadeState | undefined {
    return this.grenades.find((g) => g.throwerId === playerId);
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
      safetyFuseTimer: GRENADE.SAFETY_FUSE,
      throwerId,
    };
    this.grenades.push(grenade);
    return grenade;
  }

  /**
   * Manually detonate a single grenade (typically from a player's second
   * right-click). Removes it from the active list and applies damage to
   * everyone in the blast radius with line of sight. Returns null if the
   * grenade was already gone.
   */
  detonateGrenade(
    grenadeId: string,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
  ): ExplosionResult | null {
    const idx = this.grenades.findIndex((g) => g.id === grenadeId);
    if (idx === -1) return null;
    const grenade = this.grenades[idx];
    this.grenades.splice(idx, 1);
    return this.applyExplosion(grenade, players, grid);
  }

  updateGrenades(
    dt: number,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
  ): { explosions: ExplosionResult[] } {
    const explosions: ExplosionResult[] = [];

    for (const grenade of this.grenades) {
      stepGrenade(grenade, dt, grid);
      grenade.safetyFuseTimer -= dt;
    }

    // Process explosions for grenades whose safety fuse has expired
    const exploded: GrenadeState[] = [];
    const remaining: GrenadeState[] = [];

    for (const grenade of this.grenades) {
      if (grenade.safetyFuseTimer <= 0) {
        exploded.push(grenade);
      } else {
        remaining.push(grenade);
      }
    }

    this.grenades = remaining;

    for (const grenade of exploded) {
      explosions.push(this.applyExplosion(grenade, players, grid));
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

  /** Internal: apply explosion damage to all players in range with LOS. */
  private applyExplosion(
    grenade: GrenadeState,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
  ): ExplosionResult {
    const damages: ExplosionResult['damages'] = [];

    for (const [playerId, playerState] of players) {
      if (playerState.isDead) continue;
      if (!isInBlastRadius(grenade.position, playerState.position)) continue;
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

    return {
      position: { x: grenade.position.x, y: grenade.position.y },
      damages,
      grenadeId: grenade.id,
      throwerId: grenade.throwerId,
    };
  }
}
