import { GUN_GAME, WEAPONS } from '@shared/config/game.js';
import type { WeaponId } from '@shared/config/game.js';
import type { GunGameRung } from '@shared/utils/gun-game.js';

/**
 * Pure Gun Game HUD helpers, split out of hud.ts so the formatting and
 * visibility rules are unit-testable without touching Phaser.
 */

/**
 * One-line ladder status for the HUD's middle column, e.g.
 * "PISTOL 1/2 - LVL 3/5": current rung weapon, kills into the rung, and
 * overall ladder position. ASCII hyphen on purpose — the HUD pixel fonts
 * don't ship an em-dash glyph. The grenade rung has no WeaponDef, so it
 * gets its own label.
 */
export function gunGameLadderLabel(rung: GunGameRung): string {
  const weaponName =
    rung.weapon === 'grenade'
      ? 'GRENADES'
      : WEAPONS[rung.weapon].displayName.toUpperCase();
  return (
    `${weaponName} ${rung.killsIntoRung}/${rung.killsForRung}` +
    ` - LVL ${rung.rungIndex + 1}/${GUN_GAME.LADDER.length}`
  );
}

/**
 * Whether the rifle ammo row ("30 / 30" + RELOADING) should be visible.
 * Hidden while fists are equipped (no ammo exists) and on the Gun Game
 * grenade rung — there weaponId stays 'rifle' but gun fire is gated, so a
 * live-looking ammo count would mislead; the ladder line + grenade counter
 * are the truth. Pass null for `rung` outside Gun Game.
 */
export function rifleAmmoRowVisible(
  weaponId: WeaponId,
  rung: GunGameRung | null,
): boolean {
  if (weaponId === 'punch') return false;
  if (rung?.weapon === 'grenade') return false;
  return true;
}
