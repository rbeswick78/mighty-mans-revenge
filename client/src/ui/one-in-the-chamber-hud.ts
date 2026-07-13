import type { WeaponId } from '@shared/config/game.js';

/** Pure middle-strip status for One in the Chamber's two loadout states. */
export function oneInTheChamberStatus(
  weaponId: WeaponId,
  chamberedRounds: number,
  isDead = false,
  roundStarted = true,
): string {
  if (!roundStarted) return 'ROUND LOADS ON FIGHT';
  if (isDead) return 'ROUND LOADS ON RESPAWN';
  return weaponId === 'pistol' && chamberedRounds > 0
    ? 'CHAMBER LOADED'
    : 'FISTS - EARN A ROUND';
}
