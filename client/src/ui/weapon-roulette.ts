import { WEAPONS, type WeaponId } from '@shared/config/game.js';

/**
 * Return the synchronized cycle callout for an authoritative weapon edge.
 * The first snapshot after activation seeds state silently because the
 * mutator-start banner already owns that beat.
 */
export function weaponRouletteCallout(
  previous: WeaponId | null,
  current: WeaponId,
  active: boolean,
): string | null {
  if (!active || previous === null || previous === current) return null;
  return `${WEAPONS[current].displayName.toUpperCase()}!`;
}
