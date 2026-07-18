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
  /**
   * Optional authoritative straight-line projectile model. Only the dormant
   * Battle Royale launcher uses this; established hitscan/melee definitions
   * omit it and retain their exact behavior.
   */
  readonly projectile?: Readonly<{
    speed: number;
    maxRange: number;
    blastRadius: number;
  }>;
}

export const BATTLE_ROYALE_GUN_IDS = [
  'rifle',
  'pistol',
  'shotgun',
  'smg',
  'sniper_rifle',
  'launcher',
] as const;
export type BattleRoyaleGunId = (typeof BATTLE_ROYALE_GUN_IDS)[number];

export const WEAPON_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythical',
] as const;
export type WeaponRarity = (typeof WEAPON_RARITIES)[number];

/** Server-authored identity carried by one Battle Royale gun. */
export interface WeaponInstance {
  readonly instanceId: string;
  readonly weaponId: BattleRoyaleGunId;
  readonly rarity: WeaponRarity;
}

/** Server-owned one-gun Battle Royale inventory; absent in standard formats. */
export interface BattleRoyaleInventoryState {
  equipped: WeaponInstance | null;
  loadedAmmo: number;
  reserveAmmo: number;
  /** Server-selected nearby drop eligible for the contextual reload action. */
  swapCandidateId?: string;
}

/** One authoritative gun on the ground. Universal reserve never enters a drop. */
export interface DroppedWeaponState {
  readonly id: string;
  readonly position: import('./common.js').Vec2;
  readonly weaponInstance: WeaponInstance;
  readonly loadedAmmo: number;
  /** Groups a gun with its authoritative container or elimination supply. */
  readonly lootSourceId?: string;
}

export type BattleRoyaleSustainType = 'bandage' | 'armor' | 'grenade';

/** Attack-owned container projection. Open state is retained briefly for feedback. */
export interface BattleRoyaleContainerState {
  readonly id: string;
  readonly position: import('./common.js').Vec2;
  readonly tile: Readonly<{ col: number; row: number }>;
  readonly status: 'intact' | 'opened';
}

/** Compact universal-ammo and sustain bundle projected from server loot state. */
export interface BattleRoyaleSupplyBundleState {
  readonly id: string;
  readonly position: import('./common.js').Vec2;
  readonly reserveAmmo: number;
  readonly sustainType: BattleRoyaleSustainType;
  readonly lootSourceId: string;
  readonly source: 'container' | 'elimination';
}
