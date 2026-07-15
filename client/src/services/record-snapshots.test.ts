import { describe, expect, it } from 'vitest';
import { GameModeType, type MatchResult } from '@shared/types/game.js';
import { localArenaWinsFromDraft, mergeArenaWinsFromResult } from './record-snapshots.js';

function result(): MatchResult {
  return {
    matchId: 'arena-result',
    winnerId: 'local',
    playerStats: new Map(),
    duration: 60,
    gameMode: GameModeType.DEATHMATCH,
    awards: [],
    rivalry: null,
    rivalrySet: null,
    isPractice: false,
    nextMapName: null,
    nextGameMode: null,
    wentToOvertime: false,
    arenaMastery: {
      local: { mapName: 'Scrapyard', previousWins: 2, wins: 3 },
    },
  };
}

describe('Records arena snapshot retention', () => {
  it('copies only the local server-authored draft record', () => {
    const players = [
      { id: 'local', nickname: 'Local', arenaWins: { Scrapyard: 2 } },
      { id: 'rival', nickname: 'Rival', arenaWins: { Scrapyard: 9 } },
    ];
    const snapshot = localArenaWinsFromDraft(players, 'local');
    expect(snapshot).toEqual({ Scrapyard: 2 });
    players[0].arenaWins.Scrapyard = 99;
    expect(snapshot).toEqual({ Scrapyard: 2 });
    expect(localArenaWinsFromDraft(players, null)).toBeNull();
  });

  it('merges only the authoritative local result total and leaves missing results unchanged', () => {
    expect(mergeArenaWinsFromResult({ Scrapyard: 2, Refinery: 4 }, result(), 'local')).toEqual({
      Scrapyard: 3,
      Refinery: 4,
    });
    expect(mergeArenaWinsFromResult({ Scrapyard: 2 }, result(), 'other')).toEqual({
      Scrapyard: 2,
    });
  });
});
