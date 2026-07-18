import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, createEmptyCharacterWins } from '@shared/config/game.js';
import { listMapNames } from '@shared/maps/registry.js';
import { GameModeType, type MatchResult } from '@shared/types/game.js';
import type { LeaderboardEntry } from '@shared/types/network.js';
import {
  REFORGED_RECORD_SECTION_IDS,
  buildReforgedRecordSections,
  type ReforgedRecordsLocalValues,
  type ReforgedRecordsServerSnapshots,
} from './records-model.js';

function result(): MatchResult {
  return {
    matchId: 'records-result',
    winnerId: 'local',
    playerStats: new Map(),
    duration: 120,
    gameMode: GameModeType.DEATHMATCH,
    awards: [],
    rivalry: {
      nicknameA: 'Batch8',
      nicknameB: 'Rival',
      winsA: 7,
      winsB: 5,
      draws: 2,
    },
    rivalrySet: {
      winsToClinch: 3,
      roundsPlayed: 2,
      players: [
        { playerId: 'local', nickname: 'Batch8', wins: 2 },
        { playerId: 'rival', nickname: 'Rival', wins: 0 },
      ],
      championId: null,
    },
    isPractice: false,
    nextMapName: null,
    nextGameMode: null,
    wentToOvertime: false,
    contract: {
      id: 'hot_shot',
      title: 'Survivor',
      objective: 'Stay alive',
      target: 1,
      players: [],
      careerCompletions: { local: 9 },
    },
    winStreaks: {
      local: { current: 3, best: 6, previous: 2, previousBest: 6 },
    },
  };
}

function leaderboard(): LeaderboardEntry[] {
  return [
    {
      nickname: 'Other',
      wins: 20,
      losses: 4,
      draws: 1,
      kills: 200,
      matches: 25,
      contractsCompleted: 18,
    },
    {
      nickname: 'batch8',
      wins: 12,
      losses: 8,
      draws: 2,
      kills: 144,
      matches: 22,
      contractsCompleted: 9,
    },
  ];
}

function snapshots(): ReforgedRecordsServerSnapshots {
  const characterWins = createEmptyCharacterWins();
  CHARACTER_IDS.forEach((id, index) => {
    characterWins[id] = index * 3;
  });
  return {
    nickname: 'Batch8',
    localPlayerId: 'local',
    leaderboard: leaderboard(),
    dailyLeaderboard: {
      type: 'server:dailyGauntletLeaderboard',
      challengeKey: '2026-07-15',
      entries: [
        { nickname: 'DailyAce', score: 8000 },
        { nickname: 'Batch8', score: 6500 },
      ],
    },
    characterWins,
    arenaWins: Object.fromEntries(listMapNames().map((name, index) => [name, index * 3])),
    lastMatchResult: result(),
    battleRoyaleRecord: {
      matches: 14,
      wins: 3,
      topThreeFinishes: 8,
      eliminations: 29,
      damage: 8125,
      bestPlacement: 1,
    },
  };
}

function localValues(): ReforgedRecordsLocalValues {
  return {
    scrapPit: JSON.stringify({
      rounds: 8,
      wins: 5,
      currentStreak: 2,
      bestStreak: 4,
      lastMatchId: 'pit-8',
    }),
    gauntletBest: '7200',
    daily: JSON.stringify({
      challengeKey: '2026-07-15',
      bestScore: 6500,
      lastClearKey: '2026-07-15',
      streak: 3,
    }),
    codex: JSON.stringify({
      discovered: ['scrap_plating+kill_salvage'],
      bestScores: { 'scrap_plating+kill_salvage': 7200 },
    }),
    crewTour: JSON.stringify({
      toursCompleted: 1,
      securedModes: ['deathmatch', 'koth'],
      wins: 8,
      currentWinStreak: 2,
      bestWinStreak: 5,
      lastMatchId: 'crew-8',
    }),
  };
}

describe('buildReforgedRecordSections', () => {
  it('projects every established record source without changing ranking or authority', () => {
    const sections = buildReforgedRecordSections(snapshots(), localValues());

    expect(sections.map((section) => section.id)).toEqual(REFORGED_RECORD_SECTION_IDS);
    expect(sections.find((section) => section.id === 'career')).toMatchObject({
      summary: 'ROAD DOG',
      heading: 'CAREER / BATCH8',
    });
    expect(sections.find((section) => section.id === 'career')?.columns.flat()).toContain(
      'ALL-TIME TOP 5 / #2',
    );
    expect(sections.find((section) => section.id === 'leaderboards')?.columns[0]).toEqual([
      'ALL-TIME TOP 5 / W-L-D / KOs',
      '#1 OTHER / 20W 4L 1D / 200 KOs',
      '#2 BATCH8 / 12W 8L 2D / 144 KOs',
    ]);
    expect(sections.find((section) => section.id === 'rivalry')?.columns.flat()).toContain(
      'BATCH8 7 - 5 RIVAL',
    );
    expect(sections.find((section) => section.id === 'fighters')?.columns.flat()).toContain(
      'ROOK / MASTER / 15 WINS',
    );
    expect(sections.find((section) => section.id === 'arenas')?.columns.flat()).toContain(
      'RUSTED REFINERY / HOME TURF / 15 WINS',
    );
    expect(sections.find((section) => section.id === 'challenges')?.columns.flat()).toEqual(
      expect.arrayContaining([
        '5 WINS / 8 ROUNDS',
        'BEST CLEAR / 7,200',
        'BEST 6,500 / CLEAR STREAK 3',
        '1/6 DISCOVERED',
        '1 TOURS / 2/4 PATCHES',
      ]),
    );
    expect(sections.find((section) => section.id === 'battle_royale')).toMatchObject({
      summary: '14 MATCHES',
      authority: 'SERVER-AUTHORED BATTLE ROYALE TOTALS / ISOLATED FROM PVP',
    });
    expect(sections.find((section) => section.id === 'battle_royale')?.columns.flat()).toEqual(
      expect.arrayContaining([
        'MATCHES / 14',
        'WINS / 3',
        'TOP THREE / 8',
        'ELIMINATIONS / 29',
        'DAMAGE / 8,125',
        'BEST PLACEMENT / #1',
      ]),
    );
  });

  it('keeps explicit zero states when snapshots and local records are absent or malformed', () => {
    const emptySnapshots: ReforgedRecordsServerSnapshots = {
      nickname: '',
      localPlayerId: null,
      leaderboard: [],
      dailyLeaderboard: null,
      characterWins: createEmptyCharacterWins(),
      arenaWins: null,
      lastMatchResult: null,
      battleRoyaleRecord: null,
    };
    const malformed: ReforgedRecordsLocalValues = {
      scrapPit: '{bad',
      gauntletBest: 'not-a-score',
      daily: '{bad',
      codex: '{bad',
      crewTour: '{bad',
    };
    const sections = buildReforgedRecordSections(emptySnapshots, malformed);

    expect(sections.find((section) => section.id === 'career')?.columns.flat()).toContain(
      'PLAY A REAL MATCH TO RECEIVE A CAREER SNAPSHOT',
    );
    expect(sections.find((section) => section.id === 'leaderboards')?.columns.flat()).toEqual(
      expect.arrayContaining([
        'NO ALL-TIME RECORDS YET',
        'NO DAILY CLEARS YET / SET THE FIRST SCORE',
      ]),
    );
    expect(sections.find((section) => section.id === 'arenas')?.columns.flat()).toContain(
      'WASTELAND OUTPOST / SNAPSHOT PENDING',
    );
    expect(sections.find((section) => section.id === 'challenges')?.columns.flat()).toEqual(
      expect.arrayContaining([
        '0 WINS / 0 ROUNDS',
        'BEST CLEAR / NONE YET',
        '0/6 DISCOVERED',
        '0 TOURS / 0/4 PATCHES',
      ]),
    );
  });

  it('shows a server-owned Battle Royale zero state without inferring from results', () => {
    const empty = { ...snapshots(), battleRoyaleRecord: null };
    const section = buildReforgedRecordSections(empty, localValues()).find(
      (candidate) => candidate.id === 'battle_royale',
    );
    expect(section).toMatchObject({
      summary: 'NO RECORD',
      authority: 'SERVER-AUTHORED BATTLE ROYALE TOTALS / ISOLATED FROM PVP',
    });
    expect(section?.columns.flat()).toEqual(
      expect.arrayContaining([
        'MATCHES / 0',
        'WINS / 0',
        'TOP THREE / 0',
        'ELIMINATIONS / 0',
        'DAMAGE / 0',
        'BEST PLACEMENT / --',
        'TERMINAL SERVER RESULTS ONLY / NO CLIENT INFERENCE',
      ]),
    );
  });
});
