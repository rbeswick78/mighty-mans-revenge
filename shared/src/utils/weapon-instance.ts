import { WEAPON_RARITY } from '../config/game.js';
import {
  BATTLE_ROYALE_GUN_IDS,
  WEAPON_RARITIES,
  type BattleRoyaleGunId,
  type WeaponInstance,
  type WeaponRarity,
} from '../types/weapon.js';

const INSTANCE_ID = /^[A-Za-z0-9:_-]{1,96}$/;

export function isBattleRoyaleGunId(value: unknown): value is BattleRoyaleGunId {
  return typeof value === 'string' && BATTLE_ROYALE_GUN_IDS.includes(value as BattleRoyaleGunId);
}

export function isWeaponRarity(value: unknown): value is WeaponRarity {
  return typeof value === 'string' && WEAPON_RARITIES.includes(value as WeaponRarity);
}

/** Fail-closed normalization for additive old/new-server snapshot fields. */
export function normalizeWeaponInstance(value: unknown): WeaponInstance | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.instanceId !== 'string' ||
    !INSTANCE_ID.test(candidate.instanceId) ||
    !isBattleRoyaleGunId(candidate.weaponId) ||
    !isWeaponRarity(candidate.rarity)
  ) {
    return null;
  }
  return Object.freeze({
    instanceId: candidate.instanceId,
    weaponId: candidate.weaponId,
    rarity: candidate.rarity,
  });
}

/** Deterministic half-open cumulative roll over the locked six-tier table. */
export function rollWeaponRarity(roll: number): WeaponRarity | null {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return null;
  let cumulative = 0;
  for (const rarity of WEAPON_RARITIES) {
    cumulative += WEAPON_RARITY[rarity].weight;
    if (roll < cumulative) return rarity;
  }
  return null;
}

export function createWeaponInstance(
  instanceId: string,
  weaponId: BattleRoyaleGunId,
  roll: number,
): WeaponInstance | null {
  const rarity = rollWeaponRarity(roll);
  return rarity === null ? null : normalizeWeaponInstance({ instanceId, weaponId, rarity });
}

/** Rarity changes damage only; callers apply ordinary falloff first. */
export function applyWeaponRarityDamage(baseDamage: number, rarity: WeaponRarity): number {
  if (!Number.isFinite(baseDamage) || baseDamage <= 0) return 0;
  return baseDamage * WEAPON_RARITY[rarity].damageMultiplier;
}
