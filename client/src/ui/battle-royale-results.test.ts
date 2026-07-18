import { describe, expect, it } from 'vitest';
import { GameModeType } from '@shared/types/game.js';
import type { MatchResult } from '@shared/types/game.js';
import type { PlayerStats } from '@shared/types/player.js';
import {
  battleRoyaleOutcomeTitle,
  battleRoyaleResultsPresentation,
} from './battle-royale-results.js';

const emptyStats = (): PlayerStats => ({
  kills: 0,
  deaths: 0,
  assists: 0,
  damageDealt: 0,
  damageTaken: 0,
  shotsFired: 0,
  shotsHit: 0,
  grenadesThrown: 0,
  killsByWeapon: {
    gun: 0,
    grenade: 0,
    fire: 0,
    shotgun: 0,
    axe: 0,
    pistol: 0,
    punch: 0,
    bat: 0,
    barrel: 0,
  },
  longestKillStreak: 0,
  distanceTraveled: 0,
  hillSeconds: 0,
});

const baseResult = (): MatchResult => ({
  matchId: 'br-result',
  winnerId: 'alpha',
  playerStats: new Map([
    ['alpha', emptyStats()],
    ['bravo', emptyStats()],
  ]),
  duration: 12,
  gameMode: GameModeType.DEATHMATCH,
  matchKind: 'battle_royale',
  awards: [],
  rivalry: null,
  rivalrySet: null,
  isPractice: false,
  nextMapName: null,
  nextGameMode: null,
  wentToOvertime: false,
});

describe('battleRoyaleResultsPresentation', () => {
  it('projects authoritative placements and keeps spectating unavailable', () => {
    const result = baseResult();
    result.playerNicknames = { alpha: 'Alpha', bravo: 'Bravo' };
    result.battleRoyale = {
      placements: [
        { playerId: 'bravo', placement: 2, status: 'eliminated' },
        { playerId: 'alpha', placement: 1, status: 'winner' },
      ],
      terminalReason: 'last_survivor',
      actions: { canLeave: true, canSpectate: false },
    };

    expect(battleRoyaleResultsPresentation(result)).toMatchObject({
      hasAuthoritativePlacements: true,
      canLeave: true,
      canSpectate: false,
      standings: [
        { playerId: 'alpha', placement: 1, nickname: 'Alpha' },
        { playerId: 'bravo', placement: 2, nickname: 'Bravo' },
      ],
    });
    expect(battleRoyaleOutcomeTitle(result, 'alpha')).toBe('VICTORY ROYALE');
    expect(battleRoyaleOutcomeTitle(result, 'bravo')).toBe('PLACED #2');
  });

  it('fails open for an old server without inventing placements', () => {
    const result = baseResult();
    delete result.battleRoyale;

    expect(battleRoyaleResultsPresentation(result)).toEqual({
      standings: [],
      hasAuthoritativePlacements: false,
      canLeave: true,
      canSpectate: false,
    });
    expect(battleRoyaleOutcomeTitle(result, 'alpha')).toBe('BATTLE ROYALE RESULTS');
  });

  it('projects an authoritative early spectator exit without inventing a winner', () => {
    const result = baseResult();
    result.winnerId = null;
    result.battleRoyale = {
      placements: [
        { playerId: 'alpha', placement: 1, status: 'alive' },
        { playerId: 'bravo', placement: 2, status: 'eliminated' },
      ],
      terminalReason: 'left_early',
      actions: { canLeave: true, canSpectate: false },
    };
    expect(battleRoyaleResultsPresentation(result)?.standings).toMatchObject([
      { playerId: 'alpha', status: 'alive' },
      { playerId: 'bravo', status: 'eliminated' },
    ]);
    expect(battleRoyaleOutcomeTitle(result, 'bravo')).toBe('PLACED #2');
  });

  it('leaves every standard result behaviorally absent', () => {
    const result = baseResult();
    result.matchKind = 'duel';
    expect(battleRoyaleResultsPresentation(result)).toBeNull();
    expect(battleRoyaleOutcomeTitle(result, 'alpha')).toBeNull();
  });
});
