import { describe, expect, it } from 'vitest';
import { GameModeType } from '@shared/types/game.js';
import type { MatchResult } from '@shared/types/game.js';
import type { DraftPlayer } from '@shared/types/network.js';
import { arenaMasteryDraftSubtitle, arenaMasteryResultPresentation } from './arena-mastery.js';

const players: DraftPlayer[] = [
  {
    id: 'a',
    nickname: 'Alpha',
    arenaWins: { Scrapyard: 3, 'Rusted Refinery': 15 },
  },
  {
    id: 'b',
    nickname: 'Bravo',
    arenaWins: { Scrapyard: 8, 'Rusted Refinery': 0 },
  },
];

function resultWithMastery(previousWins: number, wins: number): MatchResult {
  return {
    matchId: 'match',
    winnerId: 'a',
    playerStats: new Map(),
    duration: 120,
    gameMode: GameModeType.DEATHMATCH,
    awards: [],
    rivalry: null,
    rivalrySet: null,
    isPractice: false,
    nextMapName: null,
    nextGameMode: null,
    wentToOvertime: false,
    arenaMastery: {
      a: { mapName: 'Scrapyard', previousWins, wins },
    },
  } as MatchResult;
}

describe('arenaMasteryDraftSubtitle', () => {
  it('compares local and rival tiers on every map card', () => {
    expect(arenaMasteryDraftSubtitle(players, 'a', 'Scrapyard')).toBe(
      'YOU CLAIMED 3/7 · RIVAL STRONGHOLD 8/15',
    );
    expect(arenaMasteryDraftSubtitle(players, 'a', 'Rusted Refinery')).toBe(
      'YOU HOME TURF 15W · RIVAL UNCHARTED 0/1',
    );
  });

  it('preserves compatibility when old snapshots omit records', () => {
    expect(
      arenaMasteryDraftSubtitle([players[0], { id: 'b', nickname: 'Bravo' }], 'a', 'Scrapyard'),
    ).toBeNull();
    expect(arenaMasteryDraftSubtitle(players, null, 'Scrapyard')).toBeNull();
  });

  it('summarizes the strongest opponent without assuming exactly two players', () => {
    const field = [...players, { id: 'c', nickname: 'Charlie', arenaWins: { Scrapyard: 11 } }];
    expect(arenaMasteryDraftSubtitle(field, 'a', 'Scrapyard')).toBe(
      'YOU CLAIMED 3/7 · FIELD BEST 11W',
    );
  });
});

describe('arenaMasteryResultPresentation', () => {
  it('celebrates a tier crossed by the authoritative result', () => {
    expect(arenaMasteryResultPresentation(resultWithMastery(2, 3), 'a')).toEqual({
      text: 'NEW CLAIMED · SCRAPYARD · 3 WINS',
      tierUp: true,
    });
  });

  it('shows progress without inventing a promotion', () => {
    expect(arenaMasteryResultPresentation(resultWithMastery(3, 4), 'a')).toEqual({
      text: 'SCRAPYARD · CLAIMED 4/7',
      tierUp: false,
    });
  });

  it('renders nothing for Practice, old payloads, and missing local ids', () => {
    expect(arenaMasteryResultPresentation(null, 'a')).toBeNull();
    expect(arenaMasteryResultPresentation(resultWithMastery(0, 1), null)).toBeNull();
    expect(
      arenaMasteryResultPresentation({ ...resultWithMastery(0, 1), arenaMastery: undefined }, 'a'),
    ).toBeNull();
  });
});
