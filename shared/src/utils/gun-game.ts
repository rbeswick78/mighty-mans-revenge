/**
 * Gun Game ladder math. `PlayerState.score` carries a player's total
 * ladder kills; everything else — current rung, progress within it, the
 * rung's weapon — is derived here. Pure and shared so the server's rung
 * enforcement and the client's HUD ladder can never disagree.
 */
import { GUN_GAME, type GunGameRungWeapon } from '../config/game.js';
import type { KillWeapon } from '../types/game.js';

export interface GunGameRung {
  /** 0-based index into GUN_GAME.LADDER. */
  rungIndex: number;
  /** Kills already banked toward clearing this rung. */
  killsIntoRung: number;
  /** Kills this rung requires (GUN_GAME.RUNG_KILLS[rungIndex]). */
  killsForRung: number;
  /** The weapon this rung is fought with. */
  weapon: GunGameRungWeapon;
}

/** Total ladder kills needed to win (sum of RUNG_KILLS). */
export function gunGameTotalKills(): number {
  return GUN_GAME.RUNG_KILLS.reduce((sum, kills) => sum + kills, 0);
}

/**
 * Derive the rung a player with `score` ladder kills is fighting on.
 * Scores at or past the total clamp to the final rung with it shown as
 * complete — the match is over at that point, but HUD frames rendered on
 * the winning snapshot still get sane values.
 */
export function gunGameRungForScore(score: number): GunGameRung {
  let remaining = Math.max(0, Math.floor(score));
  for (let i = 0; i < GUN_GAME.LADDER.length; i++) {
    const killsForRung = GUN_GAME.RUNG_KILLS[i];
    if (remaining < killsForRung) {
      return {
        rungIndex: i,
        killsIntoRung: remaining,
        killsForRung,
        weapon: GUN_GAME.LADDER[i],
      };
    }
    remaining -= killsForRung;
  }
  const last = GUN_GAME.LADDER.length - 1;
  return {
    rungIndex: last,
    killsIntoRung: GUN_GAME.RUNG_KILLS[last],
    killsForRung: GUN_GAME.RUNG_KILLS[last],
    weapon: GUN_GAME.LADDER[last],
  };
}

/**
 * The KillWeapon a rung's kills must be attributed to for the ladder to
 * advance ('gun' is the rifle's legacy wire name).
 */
export function rungWeaponToKillWeapon(weapon: GunGameRungWeapon): KillWeapon {
  return weapon === 'rifle' ? 'gun' : weapon;
}
