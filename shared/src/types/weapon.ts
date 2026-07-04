/**
 * Per-weapon tuning. Weapons live in the frozen `WEAPONS` record in
 * shared/config/game.ts, keyed by `WeaponId`. Every player always carries
 * the rifle; special weapons (shotgun) occupy a single pickup slot —
 * walking over a weapon pickup auto-equips it, and when its ammo is spent
 * it vanishes and the player reverts to the rifle. There is no
 * weapon-switch key.
 */
export interface WeaponDef {
  readonly id: string;
  readonly displayName: string;
  /** Damage per bullet/pellet at or beyond falloffRangeMax. */
  readonly damageMin: number;
  /** Damage per bullet/pellet at or inside falloffRangeMin. */
  readonly damageMax: number;
  /** Distance (px) inside which a bullet/pellet does damageMax. */
  readonly falloffRangeMin: number;
  /** Distance (px) beyond which a bullet/pellet does damageMin. */
  readonly falloffRangeMax: number;
  /** Rounds fired per trigger pull, spaced burstInterval apart. */
  readonly burstSize: number;
  /** Seconds between rounds within a burst. */
  readonly burstInterval: number;
  readonly magazineSize: number;
  /** Seconds a reload takes. */
  readonly reloadTime: number;
  /** Pellets per round. 1 for single-projectile weapons. */
  readonly pelletCount: number;
  /**
   * Full width (radians) of the pellet spread fan, centred on the aim
   * angle. 0 for perfectly straight single-projectile weapons.
   */
  readonly spreadAngle: number;
  /**
   * Seconds between trigger pulls (the shotgun's pump-racking delay).
   * 0 = fire rate limited only by burst pacing.
   */
  readonly fireCooldown: number;
  /**
   * Total ammo granted when this weapon is collected as a map pickup
   * (magazine + reserve). 0 = never spawns as a weapon pickup.
   */
  readonly pickupAmmo: number;
  /**
   * Hard cap (px) on how far this weapon's rays travel. Rays stop dead
   * here — no hits and no damage beyond it. Melee needs this: without it
   * hit validation extends rays to falloffRangeMax * 2 so falloff can
   * play out, which would let a "56px punch" connect at 112px.
   * Omit for ranged weapons.
   */
  readonly maxRange?: number;
}
