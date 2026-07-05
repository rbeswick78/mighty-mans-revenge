import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEmptyKillsByWeapon } from '@shared/game';
import type { KillWeapon } from '@shared/game';
import { PersistentStatsStore } from './persistent-stats-store.js';
import type { MatchStatsEntry } from './persistent-stats-store.js';

function entry(
  nickname: string,
  kills = 0,
  deaths = 0,
  weaponKills: Partial<Record<KillWeapon, number>> = {},
): MatchStatsEntry {
  return {
    nickname,
    kills,
    deaths,
    killsByWeapon: { ...createEmptyKillsByWeapon(), ...weaponKills },
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
    expect(ryan.weaponKills).toEqual({
      gun: 7,
      grenade: 5,
      fire: 0,
      shotgun: 3,
      axe: 0,
      pistol: 0,
      punch: 0,
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

  it('persists across a restart (new store instance, same DATA_DIR)', async () => {
    const store = makeStore();
    store.recordMatch([entry('Ryan', 10, 4, { gun: 10 }), entry('Dave', 4, 10)], 'Ryan');
    store.recordMatch([entry('Ryan', 2), entry('Dave', 2)], null);
    await store.flush();

    const reloaded = makeStore();
    expect(reloaded.getLifetime('Ryan')!.wins).toBe(1);
    expect(reloaded.getLifetime('Ryan')!.draws).toBe(1);
    expect(reloaded.getLifetime('Ryan')!.weaponKills.gun).toBe(10);
    expect(reloaded.getRivalry('Ryan', 'Dave')).toEqual({
      nicknameA: 'Dave',
      nicknameB: 'Ryan',
      winsA: 0,
      winsB: 1,
      draws: 1,
    });
  });

  it('writes valid, versioned JSON with sorted pair keys', async () => {
    const store = makeStore();
    store.recordMatch([entry('Zed'), entry('Amy')], 'Zed');
    await store.flush();

    const file = JSON.parse(
      readFileSync(path.join(dataDir, 'persistent-stats.json'), 'utf8'),
    ) as { version: number; headToHead: Record<string, unknown> };
    expect(file.version).toBe(1);
    expect(Object.keys(file.headToHead)).toEqual(['amy|zed']);
  });

  it('defaults weaponKills keys missing from an older file to 0 (pistol/punch back-compat)', () => {
    // Hand-built file in the shape written BEFORE 'pistol'/'punch' joined
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
    writeFileSync(
      path.join(dataDir, 'persistent-stats.json'),
      JSON.stringify(oldShape),
      'utf8',
    );

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
    });

    // Accumulating a new-era match on top of the migrated record works.
    store.recordMatch(
      [entry('Ryan', 3, 0, { pistol: 2, punch: 1 }), entry('Dave', 0, 3)],
      'Ryan',
    );
    expect(store.getLifetime('Ryan')!.weaponKills.pistol).toBe(2);
    expect(store.getLifetime('Ryan')!.weaponKills.punch).toBe(1);
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
