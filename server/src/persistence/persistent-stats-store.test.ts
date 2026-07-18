import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DAILY_GAUNTLET_LEADERBOARD,
  createEmptyArenaWins,
  createEmptyCharacterWins,
  createEmptyKillsByWeapon,
} from '@shared/game';
import type { CharacterId, KillWeapon } from '@shared/game';
import { PersistentStatsStore } from './persistent-stats-store.js';
import type { MatchStatsEntry } from './persistent-stats-store.js';

function entry(
  nickname: string,
  kills = 0,
  deaths = 0,
  weaponKills: Partial<Record<KillWeapon, number>> = {},
  contractCompleted = false,
  characterId: CharacterId | null = null,
): MatchStatsEntry {
  return {
    nickname,
    kills,
    deaths,
    killsByWeapon: { ...createEmptyKillsByWeapon(), ...weaponKills },
    contractCompleted,
    characterId,
  };
}

describe('PersistentStatsStore', () => {
  let dataDir: string;
  let stores: PersistentStatsStore[];

  /** Track stores so cleanup can drain queued writes before rmSync. */
  function makeStore(dir: string = dataDir): PersistentStatsStore {
    const store = new PersistentStatsStore(dir);
    stores.push(store);
    return store;
  }

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'mmr-stats-'));
    stores = [];
  });

  afterEach(async () => {
    // Let background writes land before deleting the dir, otherwise the
    // write queue races rmSync and spams error logs.
    await Promise.all(stores.map((s) => s.flush()));
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('starts fresh when the file does not exist', () => {
    const store = makeStore();
    expect(store.getLifetime('Ryan')).toBeNull();
    expect(store.getRivalry('Ryan', 'Dave')).toEqual({
      nicknameA: 'Dave',
      nicknameB: 'Ryan',
      winsA: 0,
      winsB: 0,
      draws: 0,
    });
  });

  it('accumulates lifetime totals across matches', () => {
    const store = makeStore();
    store.recordMatch(
      [entry('Ryan', 10, 4, { gun: 7, shotgun: 3 }), entry('Dave', 4, 10, { gun: 4 })],
      'Ryan',
    );
    store.recordMatch(
      [entry('Ryan', 5, 8, { grenade: 5 }), entry('Dave', 8, 5, { gun: 8 })],
      'Dave',
    );

    const ryan = store.getLifetime('ryan')!;
    expect(ryan.kills).toBe(15);
    expect(ryan.deaths).toBe(12);
    expect(ryan.wins).toBe(1);
    expect(ryan.losses).toBe(1);
    expect(ryan.draws).toBe(0);
    expect(ryan.matches).toBe(2);
    expect(ryan.contractsCompleted).toBe(0);
    expect(ryan.weaponKills).toEqual({
      gun: 7,
      grenade: 5,
      fire: 0,
      shotgun: 3,
      axe: 0,
      pistol: 0,
      punch: 0,
      bat: 0,
      barrel: 0,
    });
    expect(ryan.nickname).toBe('Ryan');
  });

  it('keys players by lowercased nickname and keeps last-seen casing', () => {
    const store = makeStore();
    store.recordMatch([entry('RYAN', 1), entry('dave')], 'RYAN');
    store.recordMatch([entry('Ryan', 2), entry('Dave')], 'Ryan');

    const ryan = store.getLifetime('ryan')!;
    expect(ryan.matches).toBe(2);
    expect(ryan.kills).toBe(3);
    expect(ryan.nickname).toBe('Ryan');
  });

  it('persists one career completion for each finished contract', () => {
    const store = makeStore();
    store.recordMatch([entry('Ryan', 2, 1, {}, true), entry('Dave', 1, 2)], 'Ryan');
    store.recordMatch([entry('Ryan', 1, 2), entry('Dave', 2, 1, {}, true)], 'Dave');
    expect(store.getLifetime('Ryan')!.contractsCompleted).toBe(1);
    expect(store.getLifetime('Dave')!.contractsCompleted).toBe(1);
  });

  it('records head-to-head with alphabetically sorted keys, both directions', () => {
    const store = makeStore();
    // Argument order varies; the stored pairing must not care.
    store.recordMatch([entry('Ryan'), entry('Dave')], 'Ryan');
    store.recordMatch([entry('Dave'), entry('Ryan')], 'Ryan');
    store.recordMatch([entry('Dave'), entry('Ryan')], 'Dave');

    const rivalry = store.getRivalry('Ryan', 'Dave');
    // 'dave' sorts before 'ryan', so Dave is A.
    expect(rivalry).toEqual({
      nicknameA: 'Dave',
      nicknameB: 'Ryan',
      winsA: 1,
      winsB: 2,
      draws: 0,
    });
  });

  it('records draws as draws for players and the pairing', () => {
    const store = makeStore();
    store.recordMatch([entry('Ryan'), entry('Dave')], null);

    expect(store.getLifetime('Ryan')!.draws).toBe(1);
    expect(store.getLifetime('Ryan')!.wins).toBe(0);
    expect(store.getLifetime('Ryan')!.losses).toBe(0);
    expect(store.getRivalry('Ryan', 'Dave').draws).toBe(1);
  });

  it('extends wins, resets losses, and lets draws preserve win streaks', () => {
    const store = makeStore();
    store.recordMatch([entry('Ryan'), entry('Dave')], 'Ryan');
    store.recordMatch([entry('Ryan'), entry('Dave')], 'Ryan');
    store.recordMatch([entry('Ryan'), entry('Dave')], null);

    expect(store.getLifetime('Ryan')).toMatchObject({
      currentWinStreak: 2,
      bestWinStreak: 2,
    });
    expect(store.getLifetime('Dave')).toMatchObject({
      currentWinStreak: 0,
      bestWinStreak: 0,
    });

    store.recordMatch([entry('Ryan'), entry('Dave')], 'Dave');
    expect(store.getLifetime('Ryan')).toMatchObject({
      currentWinStreak: 0,
      bestWinStreak: 2,
    });
    expect(store.getLifetime('Dave')).toMatchObject({
      currentWinStreak: 1,
      bestWinStreak: 1,
    });
  });

  it('banks mastery only for the winning fighter', () => {
    const store = makeStore();
    store.recordMatch(
      [entry('Ryan', 3, 1, {}, false, 'jack'), entry('Dave', 1, 3, {}, false, 'bubba')],
      'Ryan',
    );
    store.recordMatch(
      [entry('Ryan', 2, 2, {}, false, 'mighty_man'), entry('Dave', 2, 2, {}, false, 'bubba')],
      null,
    );
    store.recordMatch(
      [entry('Ryan', 1, 3, {}, false, 'frost_wizard'), entry('Dave', 3, 1, {}, false, 'bubba')],
      'Dave',
    );

    expect(store.getLifetime('Ryan')!.characterWins).toEqual({
      ...createEmptyCharacterWins(),
      jack: 1,
    });
    expect(store.getLifetime('Dave')!.characterWins).toEqual({
      ...createEmptyCharacterWins(),
      bubba: 1,
    });
  });

  it('banks arena mastery only for a real winner on a registered battlefield', () => {
    const store = makeStore();
    store.recordMatch([entry('Ryan'), entry('Dave')], 'Ryan', 'Rusted Refinery');
    store.recordMatch([entry('Ryan'), entry('Dave')], null, 'Rusted Refinery');
    store.recordMatch([entry('Ryan'), entry('Dave')], 'Dave', 'Scrapyard');
    store.recordMatch([entry('Ryan'), entry('Dave')], 'Ryan', 'Retired Arena');

    expect(store.getLifetime('Ryan')!.arenaWins).toEqual({
      ...createEmptyArenaWins(),
      'Rusted Refinery': 1,
    });
    expect(store.getLifetime('Dave')!.arenaWins).toEqual({
      ...createEmptyArenaWins(),
      Scrapyard: 1,
    });
  });

  it('skips head-to-head for non-1v1 matches but still counts lifetime totals', () => {
    const store = makeStore();
    store.recordMatch([entry('Ryan', 3), entry('Dave', 2), entry('Pat', 1)], 'Ryan');

    expect(store.getLifetime('Pat')!.losses).toBe(1);
    expect(store.getRivalry('Ryan', 'Dave')).toEqual({
      nicknameA: 'Dave',
      nicknameB: 'Ryan',
      winsA: 0,
      winsB: 0,
      draws: 0,
    });
  });

  it('can count a two-player social match without creating a duel rivalry', () => {
    const store = makeStore();
    store.recordMatch([entry('Ryan', 3), entry('Dave', 2)], 'Ryan', undefined, false);

    expect(store.getLifetime('Ryan')!.wins).toBe(1);
    expect(store.getLifetime('Dave')!.losses).toBe(1);
    expect(store.getRivalry('Ryan', 'Dave')).toMatchObject({ winsA: 0, winsB: 0, draws: 0 });
  });

  it('persists across a restart (new store instance, same DATA_DIR)', async () => {
    const store = makeStore();
    store.recordMatch([entry('Ryan', 10, 4, { gun: 10 }), entry('Dave', 4, 10)], 'Ryan');
    store.recordMatch([entry('Ryan', 2), entry('Dave', 2)], null);
    await store.flush();

    const reloaded = makeStore();
    expect(reloaded.getLifetime('Ryan')!.wins).toBe(1);
    expect(reloaded.getLifetime('Ryan')!.draws).toBe(1);
    expect(reloaded.getLifetime('Ryan')!.currentWinStreak).toBe(1);
    expect(reloaded.getLifetime('Ryan')!.bestWinStreak).toBe(1);
    expect(reloaded.getLifetime('Ryan')!.weaponKills.gun).toBe(10);
    expect(reloaded.getRivalry('Ryan', 'Dave')).toEqual({
      nicknameA: 'Dave',
      nicknameB: 'Ryan',
      winsA: 0,
      winsB: 1,
      draws: 1,
    });
  });

  it('persists Battle Royale totals separately and improves best placement', async () => {
    const store = makeStore();
    store.recordBattleRoyaleMatch([
      { nickname: 'Ryan', placement: 5, won: false, eliminations: 2, damage: 311.9 },
      { nickname: 'Dave', placement: 1, won: true, eliminations: 4, damage: 720 },
    ]);
    store.recordBattleRoyaleMatch([
      { nickname: 'RYAN', placement: 2, won: false, eliminations: 3, damage: 450.7 },
      { nickname: 'Dave', placement: 1, won: false, eliminations: 1, damage: 90 },
    ]);

    expect(store.getBattleRoyaleRecord('ryan')).toEqual({
      matches: 2,
      wins: 0,
      topThreeFinishes: 1,
      eliminations: 5,
      damage: 763,
      bestPlacement: 2,
    });
    expect(store.getBattleRoyaleRecord('DAVE')).toEqual({
      matches: 2,
      wins: 1,
      topThreeFinishes: 2,
      eliminations: 5,
      damage: 810,
      bestPlacement: 1,
    });
    expect(store.getLifetime('Ryan')).toBeNull();
    expect(store.getTopPlayers(5)).toEqual([]);

    await store.flush();
    const reloaded = makeStore();
    expect(reloaded.getBattleRoyaleRecord('Ryan')).toEqual(store.getBattleRoyaleRecord('Ryan'));
    expect(reloaded.getLifetime('Ryan')).toBeNull();
  });

  it('loads old files without Battle Royale and normalizes only malformed additive rows', () => {
    const oldShape: Record<string, unknown> = {
      version: 1,
      players: {
        ryan: {
          ...entry('Ryan'),
          wins: 2,
          losses: 0,
          draws: 0,
          matches: 2,
          contractsCompleted: 0,
          currentWinStreak: 2,
          bestWinStreak: 2,
          characterWins: createEmptyCharacterWins(),
          arenaWins: createEmptyArenaWins(),
          weaponKills: createEmptyKillsByWeapon(),
        },
      },
      headToHead: {},
      dailyGauntlet: {},
    };
    writeFileSync(path.join(dataDir, 'persistent-stats.json'), JSON.stringify(oldShape), 'utf8');
    expect(makeStore().getBattleRoyaleRecord('Ryan')).toBeNull();

    oldShape.battleRoyale = {
      ryan: {
        nickname: 'Ryan',
        matches: 3,
        wins: 99,
        topThreeFinishes: 2,
        eliminations: -4,
        damage: 123.9,
        bestPlacement: 2,
      },
      broken: { nickname: 7, matches: 4 },
    };
    writeFileSync(path.join(dataDir, 'persistent-stats.json'), JSON.stringify(oldShape), 'utf8');
    const normalized = makeStore();
    expect(normalized.getBattleRoyaleRecord('Ryan')).toEqual({
      matches: 3,
      wins: 3,
      topThreeFinishes: 2,
      eliminations: 0,
      damage: 124,
      bestPlacement: 2,
    });
    expect(normalized.getBattleRoyaleRecord('broken')).toBeNull();
    expect(normalized.getLifetime('Ryan')?.wins).toBe(2);
  });

  it('writes valid, versioned JSON with sorted pair keys', async () => {
    const store = makeStore();
    store.recordMatch([entry('Zed'), entry('Amy')], 'Zed');
    await store.flush();

    const file = JSON.parse(readFileSync(path.join(dataDir, 'persistent-stats.json'), 'utf8')) as {
      version: number;
      headToHead: Record<string, unknown>;
    };
    expect(file.version).toBe(1);
    expect(Object.keys(file.headToHead)).toEqual(['amy|zed']);
  });

  it('defaults weaponKills keys missing from an older file to 0', () => {
    // Hand-built file in the shape written before later weapons joined
    // KILL_WEAPONS — their keys are absent from weaponKills entirely.
    const oldShape = {
      version: 1,
      players: {
        ryan: {
          nickname: 'Ryan',
          kills: 12,
          deaths: 9,
          wins: 2,
          losses: 1,
          draws: 0,
          matches: 3,
          weaponKills: { gun: 7, grenade: 2, fire: 1, shotgun: 2, axe: 0 },
        },
      },
      headToHead: {},
    };
    writeFileSync(path.join(dataDir, 'persistent-stats.json'), JSON.stringify(oldShape), 'utf8');

    const store = makeStore();
    const ryan = store.getLifetime('Ryan')!;
    // Old keys preserved, new keys defaulted — the full KillWeapon record.
    expect(ryan.weaponKills).toEqual({
      gun: 7,
      grenade: 2,
      fire: 1,
      shotgun: 2,
      axe: 0,
      pistol: 0,
      punch: 0,
      bat: 0,
      barrel: 0,
    });
    expect(ryan.contractsCompleted).toBe(0);
    expect(ryan.currentWinStreak).toBe(0);
    expect(ryan.bestWinStreak).toBe(0);
    expect(ryan.characterWins).toEqual(createEmptyCharacterWins());
    expect(ryan.characterWins.rook).toBe(0);
    expect(ryan.arenaWins).toEqual(createEmptyArenaWins());
    expect(store.getDailyGauntletLeaderboard('2026-07-13', 5)).toEqual([]);

    // Accumulating a new-era match on top of the migrated record works.
    store.recordMatch(
      [entry('Ryan', 3, 0, { pistol: 2, punch: 1, bat: 1 }), entry('Dave', 0, 3)],
      'Ryan',
    );
    expect(store.getLifetime('Ryan')!.weaponKills.pistol).toBe(2);
    expect(store.getLifetime('Ryan')!.weaponKills.punch).toBe(1);
    expect(store.getLifetime('Ryan')!.weaponKills.bat).toBe(1);
    expect(store.getLifetime('Ryan')!.weaponKills.gun).toBe(7);
  });

  describe('getTopPlayers', () => {
    it('ranks by wins desc, then kills desc, then nickname asc (case-insensitive)', () => {
      const store = makeStore();
      // Amy: 2 wins, 5 kills. Zed: 2 wins, 9 kills. bob: 1 win. Cal: 0 wins.
      store.recordMatch([entry('Amy', 3), entry('Cal', 1)], 'Amy');
      store.recordMatch([entry('Amy', 2), entry('bob', 2)], 'Amy');
      store.recordMatch([entry('Zed', 5), entry('Cal', 0)], 'Zed');
      store.recordMatch([entry('Zed', 4), entry('bob', 3)], 'Zed');
      store.recordMatch([entry('bob', 6), entry('Cal', 2)], 'bob');

      const top = store.getTopPlayers(10);
      // Zed beats Amy on the kills tie-break (both 2 wins); display casing
      // is preserved even though ordering keys are lowercased.
      expect(top.map((e) => e.nickname)).toEqual(['Zed', 'Amy', 'bob', 'Cal']);
      expect(top[0]).toEqual({
        nickname: 'Zed',
        wins: 2,
        losses: 0,
        draws: 0,
        kills: 9,
        matches: 2,
        contractsCompleted: 0,
      });
    });

    it('breaks a full wins+kills tie by nickname ascending, case-insensitively', () => {
      const store = makeStore();
      // Both end 1 win / 0 kills; 'amy' < 'zed' regardless of casing.
      store.recordMatch([entry('zed'), entry('Cal')], 'zed');
      store.recordMatch([entry('Amy'), entry('Cal')], 'Amy');

      const top = store.getTopPlayers(2);
      expect(top.map((e) => e.nickname)).toEqual(['Amy', 'zed']);
    });

    it('limits the result to n entries', () => {
      const store = makeStore();
      store.recordMatch([entry('Amy', 1), entry('Bob', 0), entry('Cal', 0)], 'Amy');

      expect(store.getTopPlayers(2)).toHaveLength(2);
      expect(store.getTopPlayers(2)[0].nickname).toBe('Amy');
    });

    it('returns an empty array on an empty store', () => {
      const store = makeStore();
      expect(store.getTopPlayers(5)).toEqual([]);
    });
  });

  describe('Daily Gauntlet leaderboard', () => {
    it('ranks best clears by score, first-achieved time, then callsign', () => {
      const store = makeStore();
      expect(store.recordDailyGauntletClear('2026-07-13', 'Ryan', 5000, 200)).toEqual({
        rank: 1,
        bestScore: 5000,
        improved: true,
      });
      store.recordDailyGauntletClear('2026-07-13', 'Dave', 6000, 300);
      store.recordDailyGauntletClear('2026-07-13', 'Amy', 6000, 100);

      expect(store.getDailyGauntletLeaderboard('2026-07-13', 5)).toEqual([
        { nickname: 'Amy', score: 6000 },
        { nickname: 'Dave', score: 6000 },
        { nickname: 'Ryan', score: 5000 },
      ]);
    });

    it('keeps only a callsign best and preserves when that score was first achieved', () => {
      const store = makeStore();
      store.recordDailyGauntletClear('2026-07-13', 'Ryan', 5000, 100);
      const lower = store.recordDailyGauntletClear('2026-07-13', 'RYAN', 4500, 50);
      expect(lower).toEqual({ rank: 1, bestScore: 5000, improved: false });
      store.recordDailyGauntletClear('2026-07-13', 'Amy', 5000, 75);
      expect(store.getDailyGauntletLeaderboard('2026-07-13', 5)).toEqual([
        { nickname: 'Amy', score: 5000 },
        { nickname: 'RYAN', score: 5000 },
      ]);

      const improved = store.recordDailyGauntletClear('2026-07-13', 'Ryan', 7000, 300);
      expect(improved).toEqual({ rank: 1, bestScore: 7000, improved: true });
      expect(store.getDailyGauntletLeaderboard('2026-07-13', 1)).toEqual([
        { nickname: 'Ryan', score: 7000 },
      ]);
    });

    it('authors the next attainable chase target from the complete ranked board', () => {
      const store = makeStore();
      const key = '2026-07-13';
      expect(store.getDailyGauntletChaseTarget(key, 'Ryan', 5)).toEqual({
        kind: 'set_pace',
      });

      store.recordDailyGauntletClear(key, 'Amy', 8000, 100);
      store.recordDailyGauntletClear(key, 'Beth', 7000, 200);
      expect(store.getDailyGauntletChaseTarget(key, 'Ryan', 5)).toEqual({
        kind: 'claim_slot',
        projectedRank: 3,
      });

      store.recordDailyGauntletClear(key, 'Cara', 6000, 300);
      store.recordDailyGauntletClear(key, 'Dani', 5000, 400);
      store.recordDailyGauntletClear(key, 'Erin', 4000, 500);
      expect(store.getDailyGauntletChaseTarget(key, 'Ryan', 5)).toEqual({
        kind: 'break_in',
        targetNickname: 'Erin',
        targetScore: 4001,
      });

      store.recordDailyGauntletClear(key, 'RYAN', 7000, 600);
      expect(store.getDailyGauntletChaseTarget(key, 'ryan', 5)).toEqual({
        kind: 'catch_rival',
        targetNickname: 'Beth',
        targetScore: 7001,
      });
      expect(store.getDailyGauntletChaseTarget(key, 'Amy', 5)).toEqual({
        kind: 'defend_lead',
        targetScore: 8001,
      });
    });

    it('survives restart without adding Daily clears to lifetime PvP stats', async () => {
      const store = makeStore();
      store.recordDailyGauntletClear('2026-07-13', 'Ryan', 6800, 1234);
      await store.flush();

      const reloaded = makeStore();
      expect(reloaded.getDailyGauntletLeaderboard('2026-07-13', 5)).toEqual([
        { nickname: 'Ryan', score: 6800 },
      ]);
      expect(reloaded.getLifetime('Ryan')).toBeNull();
    });

    it('retains only the newest configured number of challenge boards', async () => {
      const store = makeStore();
      const total = DAILY_GAUNTLET_LEADERBOARD.HISTORY_DAYS + 2;
      for (let day = 0; day < total; day += 1) {
        const key = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
        store.recordDailyGauntletClear(key, 'Ryan', 5000 + day, day);
      }
      await store.flush();

      const file = JSON.parse(
        readFileSync(path.join(dataDir, 'persistent-stats.json'), 'utf8'),
      ) as { dailyGauntlet: Record<string, unknown> };
      const keys = Object.keys(file.dailyGauntlet).sort();
      expect(keys).toHaveLength(DAILY_GAUNTLET_LEADERBOARD.HISTORY_DAYS);
      expect(keys[0]).toBe('2026-01-03');
      expect(keys.at(-1)).toBe('2026-01-16');
    });
  });

  it('starts fresh on a corrupt file without throwing', () => {
    writeFileSync(path.join(dataDir, 'persistent-stats.json'), '{not json!!', 'utf8');

    const store = makeStore();
    expect(store.getLifetime('Ryan')).toBeNull();
  });

  it('starts fresh on valid JSON with the wrong shape', () => {
    writeFileSync(
      path.join(dataDir, 'persistent-stats.json'),
      JSON.stringify({ version: 99, something: 'else' }),
      'utf8',
    );

    const store = makeStore();
    expect(store.getLifetime('Ryan')).toBeNull();
  });

  it('creates the data directory on first write if missing', async () => {
    const nested = path.join(dataDir, 'nested', 'dir');
    const store = makeStore(nested);
    store.recordMatch([entry('Ryan'), entry('Dave')], 'Ryan');
    await store.flush();

    expect(existsSync(path.join(nested, 'persistent-stats.json'))).toBe(true);
  });

  it('recordMatch returns synchronously; writes land in the background', async () => {
    // Guard for the tick-budget rule: the match-end path must not block on
    // I/O. recordMatch only mutates memory and queues the write.
    mkdirSync(dataDir, { recursive: true });
    const store = makeStore();
    store.recordMatch([entry('Ryan'), entry('Dave')], 'Ryan');

    // In-memory state is immediately queryable...
    expect(store.getLifetime('Ryan')!.wins).toBe(1);
    // ...and the file appears once the queued write drains.
    await store.flush();
    expect(existsSync(path.join(dataDir, 'persistent-stats.json'))).toBe(true);
  });
});
