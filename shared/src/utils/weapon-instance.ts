import { BATTLE_ROYALE_INVENTORY, WEAPONS, WEAPON_RARITY } from '../config/game.js';
import {
  BATTLE_ROYALE_GUN_IDS,
  WEAPON_RARITIES,
  type BattleRoyaleGunId,
  type BattleRoyaleContainerState,
  type BattleRoyaleInventoryState,
  type BattleRoyaleSupplyBundleState,
  type BattleRoyaleSustainType,
  type DroppedWeaponState,
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

/** Deterministic half-open equal roll across the locked six-gun roster. */
export function rollBattleRoyaleGun(roll: number): BattleRoyaleGunId | null {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return null;
  return BATTLE_ROYALE_GUN_IDS[Math.floor(roll * BATTLE_ROYALE_GUN_IDS.length)];
}

/** Rarity changes damage only; callers apply ordinary falloff first. */
export function applyWeaponRarityDamage(baseDamage: number, rarity: WeaponRarity): number {
  if (!Number.isFinite(baseDamage) || baseDamage <= 0) return 0;
  return baseDamage * WEAPON_RARITY[rarity].damageMultiplier;
}

function normalizeAmmo(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Fail-closed normalization for optional one-slot inventory snapshots. */
export function normalizeBattleRoyaleInventory(value: unknown): BattleRoyaleInventoryState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const equipped = candidate.equipped === null ? null : normalizeWeaponInstance(candidate.equipped);
  const loadedAmmo = normalizeAmmo(candidate.loadedAmmo);
  const reserveAmmo = normalizeAmmo(candidate.reserveAmmo);
  if (equipped === null && candidate.equipped !== null) return null;
  if (loadedAmmo === null || reserveAmmo === null) return null;
  if (equipped === null && loadedAmmo !== 0) return null;
  if (equipped && loadedAmmo > WEAPONS[equipped.weaponId].magazineSize) return null;
  if (reserveAmmo > BATTLE_ROYALE_INVENTORY.MAX_RESERVE_AMMO) return null;
  if (
    candidate.swapCandidateId !== undefined &&
    (typeof candidate.swapCandidateId !== 'string' || !INSTANCE_ID.test(candidate.swapCandidateId))
  ) {
    return null;
  }
  return Object.freeze({
    equipped,
    loadedAmmo,
    reserveAmmo,
    ...(candidate.swapCandidateId === undefined
      ? {}
      : { swapCandidateId: candidate.swapCandidateId }),
  });
}

/** Fail-closed normalization for an authoritative ground-gun projection. */
export function normalizeDroppedWeapon(value: unknown): DroppedWeaponState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const position = candidate.position;
  const weaponInstance = normalizeWeaponInstance(candidate.weaponInstance);
  const loadedAmmo = normalizeAmmo(candidate.loadedAmmo);
  if (typeof candidate.id !== 'string' || !INSTANCE_ID.test(candidate.id)) return null;
  if (typeof position !== 'object' || position === null || Array.isArray(position)) return null;
  const coordinates = position as Record<string, unknown>;
  if (
    typeof coordinates.x !== 'number' ||
    !Number.isFinite(coordinates.x) ||
    typeof coordinates.y !== 'number' ||
    !Number.isFinite(coordinates.y) ||
    weaponInstance === null ||
    loadedAmmo === null ||
    loadedAmmo > WEAPONS[weaponInstance.weaponId].magazineSize
  ) {
    return null;
  }
  if (
    candidate.lootSourceId !== undefined &&
    (typeof candidate.lootSourceId !== 'string' || !INSTANCE_ID.test(candidate.lootSourceId))
  ) {
    return null;
  }
  return Object.freeze({
    id: candidate.id,
    position: Object.freeze({ x: coordinates.x, y: coordinates.y }),
    weaponInstance,
    loadedAmmo,
    ...(candidate.lootSourceId === undefined ? {} : { lootSourceId: candidate.lootSourceId }),
  });
}

const SUSTAIN_TYPES: readonly BattleRoyaleSustainType[] = ['bandage', 'armor', 'grenade'];

/** Fail-closed normalization for additive container snapshots. */
export function normalizeBattleRoyaleContainer(value: unknown): BattleRoyaleContainerState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const position = candidate.position;
  const tile = candidate.tile;
  if (typeof candidate.id !== 'string' || !INSTANCE_ID.test(candidate.id)) return null;
  if (
    typeof position !== 'object' ||
    position === null ||
    Array.isArray(position) ||
    typeof tile !== 'object' ||
    tile === null ||
    Array.isArray(tile) ||
    (candidate.status !== 'intact' && candidate.status !== 'opened')
  ) {
    return null;
  }
  const coordinates = position as Record<string, unknown>;
  const tileCoordinates = tile as Record<string, unknown>;
  if (
    typeof coordinates.x !== 'number' ||
    !Number.isFinite(coordinates.x) ||
    typeof coordinates.y !== 'number' ||
    !Number.isFinite(coordinates.y) ||
    typeof tileCoordinates.col !== 'number' ||
    !Number.isInteger(tileCoordinates.col) ||
    tileCoordinates.col < 0 ||
    typeof tileCoordinates.row !== 'number' ||
    !Number.isInteger(tileCoordinates.row) ||
    tileCoordinates.row < 0
  ) {
    return null;
  }
  return Object.freeze({
    id: candidate.id,
    position: Object.freeze({ x: coordinates.x, y: coordinates.y }),
    tile: Object.freeze({ col: tileCoordinates.col, row: tileCoordinates.row }),
    status: candidate.status,
  });
}

/** Fail-closed normalization for additive supply and elimination-pile snapshots. */
export function normalizeBattleRoyaleSupplyBundle(
  value: unknown,
): BattleRoyaleSupplyBundleState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const position = candidate.position;
  const reserveAmmo = normalizeAmmo(candidate.reserveAmmo);
  if (
    typeof candidate.id !== 'string' ||
    !INSTANCE_ID.test(candidate.id) ||
    typeof candidate.lootSourceId !== 'string' ||
    !INSTANCE_ID.test(candidate.lootSourceId) ||
    typeof position !== 'object' ||
    position === null ||
    Array.isArray(position) ||
    reserveAmmo === null ||
    reserveAmmo > BATTLE_ROYALE_INVENTORY.MAX_RESERVE_AMMO ||
    !SUSTAIN_TYPES.includes(candidate.sustainType as BattleRoyaleSustainType) ||
    (candidate.source !== 'container' && candidate.source !== 'elimination')
  ) {
    return null;
  }
  const coordinates = position as Record<string, unknown>;
  if (
    typeof coordinates.x !== 'number' ||
    !Number.isFinite(coordinates.x) ||
    typeof coordinates.y !== 'number' ||
    !Number.isFinite(coordinates.y)
  ) {
    return null;
  }
  return Object.freeze({
    id: candidate.id,
    position: Object.freeze({ x: coordinates.x, y: coordinates.y }),
    reserveAmmo,
    sustainType: candidate.sustainType as BattleRoyaleSustainType,
    lootSourceId: candidate.lootSourceId,
    source: candidate.source,
  });
}
