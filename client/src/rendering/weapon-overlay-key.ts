import type { WeaponId } from '@shared/config/game.js';
import type { Direction4 } from '@shared/types/character.js';

/** Held-overlay animation states. Only the shotgun has racking sheets. */
export type GunOverlayState = 'hold' | 'shoot' | 'racking';

/**
 * Whether a weapon renders a sheet-based gun overlay. Fists are body-level;
 * the bat has its own universal held sprite in PlayerRenderer.
 */
export function weaponRendersOverlay(weaponId: WeaponId): boolean {
  return weaponId !== 'punch' && weaponId !== 'bat';
}

/**
 * Texture/animation key for the held-weapon overlay. The rifle uses the
 * legacy 'gun_*' keys (the pack's medium gun); the shotgun and pistol ship
 * their own sheets. Only the shotgun has racking art — a stray 'racking'
 * on any other weapon (weapon swapped mid-chain) falls back to hold.
 * Punch has no overlay art; callers should gate on weaponRendersOverlay
 * first, but a stray call safely resolves to the rifle keys (the overlay
 * sprite is hidden while fists are equipped anyway).
 */
export function weaponOverlayKey(
  weaponId: WeaponId,
  direction: Direction4,
  state: GunOverlayState,
): string {
  if (weaponId === 'shotgun') {
    return `shotgun_${direction}_${state}`;
  }
  const safeState = state === 'racking' ? 'hold' : state;
  const prefix = weaponId === 'pistol' ? 'pistol' : 'gun';
  return `${prefix}_${direction}_${safeState}`;
}
