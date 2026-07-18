import {
  type PlayerId,
  type Vec2,
  type PlayerState,
  type CollisionGrid,
  type BulletTrail,
  type AxeState,
  type GrenadeState,
  type RocketState,
  type WeaponInstance,
  type KillFeedEntry,
  type WeaponId,
  type WeaponDef,
  ABILITY,
  WEAPONS,
  GRENADE,
  MUTATORS,
  MAP,
  RESPAWN,
  calculateDamage,
  calculateGrenadeDamage,
  characterHitbox,
  isInBlastRadius,
  vecDistance,
  vecFromAngle,
  vecAdd,
  vecScale,
  raycastAgainstGrid,
  rayIntersectsAABB,
  stepGrenade,
  applyWeaponRarityDamage,
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
  /** First solid cell struck by a non-piercing miss, if any. */
  hitTile?: { col: number; row: number };
}

/** One thrown axe connecting with a player this tick. */
export interface AxeHit {
  axeId: string;
  throwerId: PlayerId;
  victimId: PlayerId;
  /** Post-Iron-Hide damage actually applied. */
  damage: number;
  killed: boolean;
}

/** Match-owned relationship policy used to make teammates non-targetable. */
export type CanDamagePlayer = (attackerId: PlayerId, victimId: PlayerId) => boolean;

let nextGrenadeId = 0;

function generateGrenadeId(): string {
  return `grenade_${Date.now()}_${nextGrenadeId++}`;
}

let nextAxeId = 0;

function generateAxeId(): string {
  return `axe_${Date.now()}_${nextAxeId++}`;
}

let nextRocketId = 0;

function generateRocketId(): string {
  return `rocket_${Date.now()}_${nextRocketId++}`;
}

/**
 * Check line-of-sight between two points using the collision grid.
 * Returns true if there is a clear line of sight (no walls blocking).
 */
function hasLineOfSight(from: Vec2, to: Vec2, grid: CollisionGrid): boolean {
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
  private axes: AxeState[] = [];
  private rockets: RocketState[] = [];
  /**
   * Axes spawned since the last updateAxes pass. A newly thrown axe sits
   * out its spawn tick unmoved: input processing (which spawns it) and
   * updateAxes run in the SAME match tick, before the broadcast — without
   * this, an axe thrown point-blank at a wall would spawn AND retire
   * inside one tick, never reach a single snapshot, and give the thrower
   * zero visual feedback. One armed tick costs 50ms of flight and
   * guarantees every throw renders at least once (plus its landing).
   */
  private justSpawnedAxes = new Set<string>();
  private justSpawnedRockets = new Set<string>();

  getGrenades(): GrenadeState[] {
    return this.grenades;
  }

  /** Find this player's in-flight grenade, if any. */
  getActiveGrenadeFor(playerId: PlayerId): GrenadeState | undefined {
    return this.grenades.find((g) => g.throwerId === playerId);
  }

  /**
   * Remove every in-flight grenade without detonating it. Used when the
   * match enters sudden-death overtime — a leftover regulation grenade
   * deciding the first-kill-wins duel would be nonsense.
   */
  clearGrenades(): void {
    this.grenades = [];
  }

  getAxes(): AxeState[] {
    return this.axes;
  }

  getRockets(): RocketState[] {
    return this.rockets;
  }

  clearRockets(): void {
    this.rockets = [];
    this.justSpawnedRockets.clear();
  }

  spawnRocket(
    shooterId: PlayerId,
    position: Vec2,
    aimAngle: number,
    weaponInstance: WeaponInstance,
  ): RocketState {
    const projectile = WEAPONS.launcher.projectile;
    const rocket: RocketState = {
      id: generateRocketId(),
      position: { ...position },
      velocity: vecScale(vecFromAngle(aimAngle), projectile.speed),
      shooterId,
      angle: aimAngle,
      distanceTraveled: 0,
      weaponInstance,
    };
    this.rockets.push(rocket);
    this.justSpawnedRockets.add(rocket.id);
    return rocket;
  }

  /** Advance launcher rounds and return every authoritative impact blast. */
  updateRockets(
    dt: number,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    hitboxScale: number = 1,
    canDamage: CanDamagePlayer = () => true,
  ): { explosions: ExplosionResult[] } {
    const explosions: ExplosionResult[] = [];
    const surviving: RocketState[] = [];
    const projectile = WEAPONS.launcher.projectile;

    for (const rocket of this.rockets) {
      if (this.justSpawnedRockets.delete(rocket.id)) {
        surviving.push(rocket);
        continue;
      }

      const remaining = projectile.maxRange - rocket.distanceTraveled;
      const stepLength = Math.min(Math.hypot(rocket.velocity.x, rocket.velocity.y) * dt, remaining);
      const direction = vecFromAngle(rocket.angle);
      const wallHit = raycastAgainstGrid(
        grid,
        rocket.position.x,
        rocket.position.y,
        rocket.angle,
        stepLength,
      );
      const travelCap = wallHit.hitTile ? wallHit.distance : stepLength;
      let closest: { player: PlayerState; distance: number } | null = null;
      for (const [playerId, player] of players) {
        if (playerId === rocket.shooterId || player.isDead || player.invulnerableTimer > 0)
          continue;
        if (!canDamage(rocket.shooterId, playerId)) continue;
        const hitbox = characterHitbox(player.characterId);
        const hitDistance = rayIntersectsAABB(
          rocket.position.x,
          rocket.position.y,
          direction.x,
          direction.y,
          player.position.x,
          player.position.y,
          (hitbox.width / 2) * hitboxScale,
          (hitbox.height / 2) * hitboxScale,
        );
        if (hitDistance === null || hitDistance <= 0 || hitDistance > travelCap) continue;
        if (!closest || hitDistance < closest.distance) closest = { player, distance: hitDistance };
      }

      // Keep a wall impact infinitesimally on the approach side so blast LOS
      // cannot begin inside the solid cell and leak damage through it.
      const impactDistance =
        closest?.distance ?? (wallHit.hitTile ? Math.max(0, wallHit.distance - 0.001) : stepLength);
      rocket.position = vecAdd(rocket.position, vecScale(direction, impactDistance));
      rocket.distanceTraveled += impactDistance;
      if (closest || wallHit.hitTile || rocket.distanceTraveled >= projectile.maxRange) {
        explosions.push(this.applyLauncherExplosion(rocket, players, grid, canDamage));
      } else {
        surviving.push(rocket);
      }
    }

    this.rockets = surviving;
    return { explosions };
  }

  /** Same overtime contract as clearGrenades — no regulation leftovers. */
  clearAxes(): void {
    this.axes = [];
    this.justSpawnedAxes.clear();
  }

  /**
   * Spawn Jack's thrown axe at the thrower's position, flying along the
   * aim angle. Straight-line flight at ABILITY.JACK_AXE_THROW.SPEED;
   * resolution happens in updateAxes.
   */
  spawnAxe(throwerId: PlayerId, position: Vec2, aimAngle: number): AxeState {
    const axe: AxeState = {
      id: generateAxeId(),
      position: { x: position.x, y: position.y },
      velocity: vecScale(vecFromAngle(aimAngle), ABILITY.JACK_AXE_THROW.SPEED),
      throwerId,
      angle: aimAngle,
      distanceTraveled: 0,
    };
    this.axes.push(axe);
    this.justSpawnedAxes.add(axe.id);
    return axe;
  }

  /**
   * Advance every in-flight axe one tick and resolve hits. Per axe, in
   * order along the flight path: the nearest living, non-invulnerable,
   * non-thrower player whose hit-validation AABB (per-character dims ×
   * the big_heads scale) the step segment crosses takes the flat axe
   * damage and the axe retires; otherwise the axe retires against the
   * first wall the segment crosses, or after RANGE_TILES of total flight.
   * Damage goes through applyDamage, so Iron Hide is honored; the caller
   * (Match) owns kill bookkeeping via the returned hits.
   */
  updateAxes(
    dt: number,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    hitboxScale: number = 1,
    canDamage: CanDamagePlayer = () => true,
  ): { hits: AxeHit[] } {
    const hits: AxeHit[] = [];
    if (this.axes.length === 0) return { hits };

    const maxRange = ABILITY.JACK_AXE_THROW.RANGE_TILES * MAP.TILE_SIZE;
    const surviving: AxeState[] = [];

    for (const axe of this.axes) {
      // Armed tick: an axe thrown this very tick holds position so it
      // reaches at least one broadcast before it can resolve.
      if (this.justSpawnedAxes.delete(axe.id)) {
        surviving.push(axe);
        continue;
      }

      const remaining = maxRange - axe.distanceTraveled;
      const stepLen = Math.min(Math.hypot(axe.velocity.x, axe.velocity.y) * dt, remaining);
      const dir = vecFromAngle(axe.angle);

      // Walls first: the axe can't reach anything standing behind one.
      const wallHit = raycastAgainstGrid(grid, axe.position.x, axe.position.y, axe.angle, stepLen);
      const travelCap = wallHit.hitTile ? wallHit.distance : stepLen;

      // Nearest victim whose AABB the step segment crosses within the cap.
      let closest: { player: PlayerState; distance: number } | null = null;
      for (const [playerId, player] of players) {
        if (playerId === axe.throwerId) continue;
        if (!canDamage(axe.throwerId, playerId)) continue;
        if (player.isDead) continue;
        if (player.invulnerableTimer > 0) continue;

        const hitbox = characterHitbox(player.characterId);
        const hitDist = rayIntersectsAABB(
          axe.position.x,
          axe.position.y,
          dir.x,
          dir.y,
          player.position.x,
          player.position.y,
          (hitbox.width / 2) * hitboxScale,
          (hitbox.height / 2) * hitboxScale,
        );
        if (hitDist === null || hitDist <= 0 || hitDist > travelCap) continue;
        if (!closest || hitDist < closest.distance) {
          closest = { player, distance: hitDist };
        }
      }

      if (closest) {
        const result = this.applyDamage(
          closest.player,
          ABILITY.JACK_AXE_THROW.DAMAGE,
          axe.throwerId,
          canDamage,
        );
        hits.push({
          axeId: axe.id,
          throwerId: axe.throwerId,
          victimId: closest.player.id,
          damage: result.damageApplied,
          killed: result.killed,
        });
        continue; // axe retires in the victim
      }

      if (wallHit.hitTile) continue; // axe retires against the wall

      axe.position = vecAdd(axe.position, vecScale(dir, stepLen));
      axe.distanceTraveled += stepLen;
      if (axe.distanceTraveled < maxRange) {
        surviving.push(axe); // still flying
      }
      // else: max range reached — the axe lands and retires
    }

    this.axes = surviving;
    return { hits };
  }

  processShot(
    shooterId: PlayerId,
    aimAngle: number,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    rewindStates?: Map<PlayerId, PlayerState>,
    piercing: boolean = false,
    weaponId: WeaponId = 'rifle',
    hitboxScale: number = 1,
    canDamage: CanDamagePlayer = () => true,
  ): ShotResult {
    // Widen to the interface type: the frozen WEAPONS literals only carry
    // maxRange on the weapons that declare it (punch).
    const weapon: WeaponDef = WEAPONS[weaponId];
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
          weaponId,
          hitPlayerId: null,
          damageApplied: 0,
        },
      };
    }

    const startPos = { x: shooter.position.x, y: shooter.position.y };
    const dir = vecFromAngle(aimAngle);

    // Raycast against grid to find max distance (wall hit). When piercing
    // is true (shot fired during Mighty Man's x-ray), walls are ignored so
    // the bullet can hit a target through tiles.
    // maxRange (melee reach) hard-caps the ray when the weapon declares
    // it; otherwise extend past falloff so long-range hits still land.
    const maxRayDistance = weapon.maxRange ?? weapon.falloffRangeMax * 2;
    const wallHit = raycastAgainstGrid(
      grid,
      startPos.x,
      startPos.y,
      aimAngle,
      maxRayDistance,
      piercing,
    );
    const wallDistance = wallHit.hitTile ? wallHit.distance : maxRayDistance;

    // Check all living, non-invulnerable, non-shooter players
    let closestHit: { playerId: PlayerId; distance: number } | null = null;
    const targetPlayers = rewindStates ?? players;

    for (const [playerId, playerState] of targetPlayers) {
      if (playerId === shooterId) continue;
      if (!canDamage(shooterId, playerId)) continue;

      // Use current state for isDead/invulnerableTimer checks
      const currentState = players.get(playerId);
      if (!currentState || currentState.isDead) continue;
      if (currentState.invulnerableTimer > 0) continue;

      // Per-character hit-validation dims × the big_heads scale. Applies
      // identically to live and rewound targets: the lag-comp hybrid map
      // spreads the victim's current state, and characterId is immutable
      // once the match starts, so deriving from it here IS the rewound
      // hitbox. Movement collision and pickup radii are untouched by
      // design (they stay on PLAYER.HITBOX_* for the whole roster).
      const hitbox = characterHitbox(playerState.characterId);
      const halfW = (hitbox.width / 2) * hitboxScale;
      const halfH = (hitbox.height / 2) * hitboxScale;

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
      const damage = calculateDamage(closestHit.distance, weapon);
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
          weaponId,
          hitPlayerId: null,
          damageApplied: 0,
        },
      };
    }

    // No player hit — trail ends at wall or max distance
    const endPos = wallHit.hitTile
      ? { x: wallHit.hitX, y: wallHit.hitY }
      : vecAdd(startPos, vecScale(dir, maxRayDistance));

    return {
      hit: false,
      hitTile:
        wallHit.hitTileX !== null && wallHit.hitTileY !== null
          ? { col: wallHit.hitTileX, row: wallHit.hitTileY }
          : undefined,
      trail: {
        startPos,
        endPos,
        shooterId,
        timestamp: Date.now(),
        weaponId,
        hitPlayerId: null,
        damageApplied: 0,
      },
    };
  }

  spawnGrenade(
    throwerId: PlayerId,
    position: Vec2,
    aimAngle: number,
    piercing: boolean = false,
    speedMultiplier: number = 1,
  ): GrenadeState {
    const velocity = vecScale(vecFromAngle(aimAngle), GRENADE.THROW_SPEED * speedMultiplier);
    const grenade: GrenadeState = {
      id: generateGrenadeId(),
      position: { x: position.x, y: position.y },
      velocity,
      safetyFuseTimer: GRENADE.SAFETY_FUSE,
      throwerId,
      piercing,
    };
    this.grenades.push(grenade);
    return grenade;
  }

  /** Spawn a stationary, short-fuse grenade credited to the dead fighter. */
  spawnDeathBomb(throwerId: PlayerId, position: Vec2): GrenadeState {
    const grenade: GrenadeState = {
      id: generateGrenadeId(),
      position: { ...position },
      velocity: { x: 0, y: 0 },
      safetyFuseTimer: MUTATORS.LAST_LAUGH_FUSE_SECONDS,
      throwerId,
      piercing: false,
      isDeathBomb: true,
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
    canDamage: CanDamagePlayer = () => true,
  ): ExplosionResult | null {
    const idx = this.grenades.findIndex((g) => g.id === grenadeId);
    if (idx === -1) return null;
    const grenade = this.grenades[idx];
    this.grenades.splice(idx, 1);
    return this.applyExplosion(grenade, players, grid, canDamage);
  }

  updateGrenades(
    dt: number,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    canDamage: CanDamagePlayer = () => true,
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
      explosions.push(this.applyExplosion(grenade, players, grid, canDamage));
    }

    return { explosions };
  }

  /** Resolve an environmental blast with grenade tuning and normal LOS. */
  explodeAt(
    position: Vec2,
    instigatorId: PlayerId,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    canDamage: CanDamagePlayer = () => true,
  ): ExplosionResult {
    return this.applyExplosion(
      {
        id: `barrel_${Date.now()}_${nextGrenadeId++}`,
        position: { ...position },
        velocity: { x: 0, y: 0 },
        safetyFuseTimer: 0,
        throwerId: instigatorId,
        piercing: false,
      },
      players,
      grid,
      canDamage,
    );
  }

  applyDamage(
    victim: PlayerState,
    damage: number,
    attackerId: PlayerId,
    canDamage: CanDamagePlayer = () => true,
  ): { killed: boolean; entry?: KillFeedEntry; damageApplied: number } {
    if (!canDamage(attackerId, victim.id)) return { killed: false, damageApplied: 0 };
    // Bubba's Iron Hide: all incoming damage is halved while his ability
    // window runs. Applied HERE — the single choke point every damage
    // source flows through (rifle, pellets, grenades, fire breath, axes) —
    // so no source can forget it. Callers must use the returned
    // damageApplied for stats and vampire healing, not their raw number.
    damage = this.damageAfterReduction(victim, damage);
    // Scrap Armor absorbs the post-reduction hit before HP. Keep
    // damageApplied as the whole landed hit (including shield absorption),
    // preserving damage stats, Vampire healing, and hit feedback semantics.
    const absorbed = Math.min(victim.armor, damage);
    victim.armor -= absorbed;
    victim.health = Math.max(0, victim.health - (damage - absorbed));

    if (victim.health <= 0) {
      victim.isDead = true;
      victim.respawnTimer = RESPAWN.DELAY;
      // NOTE: victim.deaths is NOT incremented here — Match.onKill (or the
      // suicide fallback in recordExplosion) owns the death counter. Doing
      // it in both places double-counted every death on the broadcast
      // PlayerState (caught by the shotgun multi-pellet tests).

      const entry: KillFeedEntry = {
        killerId: attackerId,
        victimId: victim.id,
        weapon: 'gun', // caller should override for grenade kills
        timestamp: Date.now(),
      };

      return { killed: true, entry, damageApplied: damage };
    }

    return { killed: false, damageApplied: damage };
  }

  /**
   * Apply arena pressure that may strip armor and HP but can never earn a
   * kill. Telegraphed hazards deliberately create no attacker, damage stat,
   * Vampire heal, or kill-feed entry.
   */
  applyNonlethalEnvironmentalDamage(victim: PlayerState, damage: number): number {
    if (victim.isDead || victim.invulnerableTimer > 0 || damage <= 0) return 0;

    const reducedDamage = this.damageAfterReduction(victim, damage);
    const armorBefore = victim.armor;
    const healthBefore = victim.health;
    const absorbed = Math.min(victim.armor, reducedDamage);
    victim.armor -= absorbed;
    victim.health = Math.max(1, victim.health - (reducedDamage - absorbed));

    return armorBefore - victim.armor + (healthBefore - victim.health);
  }

  /** Shared Iron Hide policy for attributed and environmental damage. */
  private damageAfterReduction(victim: PlayerState, damage: number): number {
    return victim.characterId === 'bubba' && victim.abilityActiveSeconds > 0
      ? damage * (1 - ABILITY.BUBBA_IRON_HIDE.DAMAGE_REDUCTION)
      : damage;
  }

  /** Internal: apply explosion damage to all players in range with LOS. */
  private applyExplosion(
    grenade: GrenadeState,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    canDamage: CanDamagePlayer,
  ): ExplosionResult {
    const damages: ExplosionResult['damages'] = [];

    for (const [playerId, playerState] of players) {
      if (playerState.isDead) continue;
      if (!canDamage(grenade.throwerId, playerId)) continue;
      if (!isInBlastRadius(grenade.position, playerState.position)) continue;
      // Piercing grenades (thrown during Mighty Man's x-ray) damage through
      // walls — skip the LOS check.
      if (!grenade.piercing && !hasLineOfSight(grenade.position, playerState.position, grid))
        continue;

      const dist = vecDistance(grenade.position, playerState.position);
      const damage = calculateGrenadeDamage(dist);

      if (damage > 0) {
        const result = this.applyDamage(playerState, damage, grenade.throwerId, canDamage);
        damages.push({
          playerId,
          // Post-Iron-Hide value, so stats/vampire credit what actually landed.
          damage: result.damageApplied,
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

  private applyLauncherExplosion(
    rocket: RocketState,
    players: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    canDamage: CanDamagePlayer,
  ): ExplosionResult {
    const damages: ExplosionResult['damages'] = [];
    const projectile = WEAPONS.launcher.projectile;
    for (const [playerId, player] of players) {
      if (player.isDead || !canDamage(rocket.shooterId, playerId)) continue;
      const distance = vecDistance(rocket.position, player.position);
      if (distance > projectile.blastRadius) continue;
      if (!hasLineOfSight(rocket.position, player.position, grid)) continue;
      const ordinaryDamage = calculateDamage(distance, WEAPONS.launcher);
      const rarityDamage = applyWeaponRarityDamage(ordinaryDamage, rocket.weaponInstance.rarity);
      const result = this.applyDamage(player, rarityDamage, rocket.shooterId, canDamage);
      damages.push({
        playerId,
        damage: result.damageApplied,
        killed: result.killed,
      });
    }
    return {
      position: { ...rocket.position },
      damages,
      grenadeId: rocket.id,
      throwerId: rocket.shooterId,
    };
  }
}
