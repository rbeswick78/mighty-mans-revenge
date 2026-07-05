import { AWARDS, AWARD_IDS, MAP } from '@shared/game';
import type { AwardId, MatchAward, PlayerId, PlayerStats } from '@shared/game';

/** A player eligible for one award, with the value the award ranks by. */
interface Candidate {
  playerId: PlayerId;
  value: number;
  detail: string;
}

/**
 * Compute end-of-match awards from final stats. Walks AWARD_IDS in
 * priority order and returns the first AWARDS.DISPLAY_COUNT awards that
 * have an outright winner. Pure and deterministic: same stats in, same
 * awards out. An award requires a strict maximum — if two players tie for
 * best, nobody earns that award.
 */
export function computeAwards(
  stats: Map<PlayerId, PlayerStats>,
  nicknameFor: (playerId: PlayerId) => string,
): MatchAward[] {
  const awards: MatchAward[] = [];

  for (const id of AWARD_IDS) {
    if (awards.length >= AWARDS.DISPLAY_COUNT) break;

    const candidates: Candidate[] = [];
    for (const [playerId, playerStats] of stats) {
      const candidate = evaluate(id, playerId, playerStats);
      if (candidate) candidates.push(candidate);
    }

    const winner = strictMax(candidates);
    if (winner) {
      awards.push({
        id,
        playerId: winner.playerId,
        nickname: nicknameFor(winner.playerId),
        detail: winner.detail,
      });
    }
  }

  return awards;
}

/** The candidate with the strictly highest value, or null on a tie/empty. */
function strictMax(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  let tiedForBest = false;
  for (const candidate of candidates) {
    if (best === null || candidate.value > best.value) {
      best = candidate;
      tiedForBest = false;
    } else if (candidate.value === best.value) {
      tiedForBest = true;
    }
  }
  return tiedForBest ? null : best;
}

function accuracy(s: PlayerStats): number {
  return s.shotsFired > 0 ? s.shotsHit / s.shotsFired : 0;
}

function countDetail(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 'S'}`;
}

/**
 * Evaluate one player against one award's eligibility gate. Returns null
 * when ineligible, otherwise the ranking value plus the pre-formatted
 * detail line the results screen shows.
 */
function evaluate(id: AwardId, playerId: PlayerId, s: PlayerStats): Candidate | null {
  switch (id) {
    case 'sharpshooter': {
      // Zero hits can't make you a sharpshooter no matter how few misses.
      if (s.shotsFired < AWARDS.SHARPSHOOTER_MIN_SHOTS || s.shotsHit === 0) return null;
      const acc = accuracy(s);
      return { playerId, value: acc, detail: `${Math.round(acc * 100)}% ACCURACY` };
    }
    case 'spray_and_pray': {
      if (s.shotsFired < AWARDS.SPRAY_AND_PRAY_MIN_SHOTS) return null;
      const acc = accuracy(s);
      if (acc >= AWARDS.SPRAY_AND_PRAY_MAX_ACCURACY) return null;
      return {
        playerId,
        value: s.shotsFired,
        detail: `${s.shotsFired} SHOTS, ${Math.round(acc * 100)}% ACCURACY`,
      };
    }
    case 'demolition_man': {
      const grenadeKills = s.killsByWeapon.grenade;
      if (grenadeKills < 1) return null;
      return { playerId, value: grenadeKills, detail: countDetail(grenadeKills, 'GRENADE KILL') };
    }
    case 'buckshot_barber': {
      const shotgunKills = s.killsByWeapon.shotgun;
      if (shotgunKills < 1) return null;
      return { playerId, value: shotgunKills, detail: countDetail(shotgunKills, 'SHOTGUN KILL') };
    }
    case 'bare_knuckles': {
      const punchKills = s.killsByWeapon.punch;
      if (punchKills < 1) return null;
      return { playerId, value: punchKills, detail: countDetail(punchKills, 'PUNCH KILL') };
    }
    case 'untouchable': {
      if (s.longestKillStreak < AWARDS.UNTOUCHABLE_MIN_STREAK) return null;
      return { playerId, value: s.longestKillStreak, detail: `${s.longestKillStreak} KILL STREAK` };
    }
    case 'pincushion': {
      if (s.damageTaken <= 0) return null;
      return {
        playerId,
        value: s.damageTaken,
        detail: `${Math.round(s.damageTaken)} DAMAGE TAKEN`,
      };
    }
    case 'pin_puller_no_payoff': {
      if (s.grenadesThrown < AWARDS.PIN_PULLER_MIN_THROWN) return null;
      if (s.killsByWeapon.grenade > 0) return null;
      return { playerId, value: s.grenadesThrown, detail: `${s.grenadesThrown} THROWN, 0 KILLS` };
    }
    case 'tourist': {
      if (s.distanceTraveled <= 0) return null;
      const tiles = Math.round(s.distanceTraveled / MAP.TILE_SIZE);
      return { playerId, value: s.distanceTraveled, detail: countDetail(tiles, 'TILE') + ' WANDERED' };
    }
  }
}
