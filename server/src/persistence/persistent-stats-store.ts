import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KILL_WEAPONS, createEmptyKillsByWeapon } from '@shared/game';
import type { KillWeapon, LeaderboardEntry, RivalryRecord } from '@shared/game';
import { logger } from '../utils/logger.js';

/** Lifetime totals for one player, keyed in the file by lowercased nickname. */
export interface LifetimePlayerStats {
  /** Last-seen display casing of the nickname. */
  nickname: string;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  contractsCompleted: number;
  weaponKills: Record<KillWeapon, number>;
}

interface HeadToHeadRecord {
  winsA: number;
  winsB: number;
  draws: number;
}

export interface PersistentStatsData {
  version: 1;
  players: Record<string, LifetimePlayerStats>;
  /**
   * Keyed by "a|b" where a/b are the two lowercased nicknames sorted
   * alphabetically; winsA belongs to the alphabetically-first player.
   */
  headToHead: Record<string, HeadToHeadRecord>;
}

/** One player's contribution to a finished match. */
export interface MatchStatsEntry {
  nickname: string;
  kills: number;
  deaths: number;
  killsByWeapon: Record<KillWeapon, number>;
  contractCompleted: boolean;
}

const FILE_NAME = 'persistent-stats.json';

function normalizeKey(nickname: string): string {
  return nickname.trim().toLowerCase();
}

function defaultDataDir(): string {
  // This module lives two levels below the server package root in both
  // layouts — src/persistence/ under tsx, dist/persistence/ once built —
  // so ../../data always resolves to server/data/.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
}

function emptyData(): PersistentStatsData {
  return { version: 1, players: {}, headToHead: {} };
}

function emptyLifetime(nickname: string): LifetimePlayerStats {
  return {
    nickname,
    kills: 0,
    deaths: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    matches: 0,
    contractsCompleted: 0,
    weaponKills: createEmptyKillsByWeapon(),
  };
}

/**
 * Lifetime kills/deaths/wins and head-to-head records, persisted to a JSON
 * file so they survive server restarts (and git-pull deploys — the data
 * dir is untracked).
 *
 * Concurrency model: all reads/updates hit the in-memory `data` object
 * synchronously; file writes are queued onto a promise chain so they never
 * block the tick loop and never interleave. The file is written via
 * temp-file + rename so a crash mid-write can't corrupt the previous copy.
 */
export class PersistentStatsStore {
  private readonly dirPath: string;
  private readonly filePath: string;
  private data: PersistentStatsData;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(dataDir: string = process.env.DATA_DIR ?? defaultDataDir()) {
    this.dirPath = dataDir;
    this.filePath = path.join(dataDir, FILE_NAME);
    this.data = this.load();
  }

  /**
   * Fold a finished match into the lifetime records and queue a file
   * write. Synchronous and O(players) — safe to call from the match-end
   * path. Head-to-head is only recorded for 1v1 matches (the pairing key
   * has no meaning otherwise). `winnerNickname` null means a draw.
   */
  recordMatch(entries: MatchStatsEntry[], winnerNickname: string | null): void {
    const winnerKey = winnerNickname === null ? null : normalizeKey(winnerNickname);

    for (const entry of entries) {
      const key = normalizeKey(entry.nickname);
      const lifetime = (this.data.players[key] ??= emptyLifetime(entry.nickname));
      lifetime.nickname = entry.nickname;
      lifetime.kills += entry.kills;
      lifetime.deaths += entry.deaths;
      lifetime.matches += 1;
      if (entry.contractCompleted) lifetime.contractsCompleted += 1;
      for (const weapon of KILL_WEAPONS) {
        lifetime.weaponKills[weapon] =
          (lifetime.weaponKills[weapon] ?? 0) + (entry.killsByWeapon[weapon] ?? 0);
      }
      if (winnerKey === null) {
        lifetime.draws += 1;
      } else if (key === winnerKey) {
        lifetime.wins += 1;
      } else {
        lifetime.losses += 1;
      }
    }

    if (entries.length === 2) {
      const keyOne = normalizeKey(entries[0].nickname);
      const keyTwo = normalizeKey(entries[1].nickname);
      // Two players with the same nickname would produce a meaningless
      // "x|x" record — skip head-to-head for that (silly but possible) case.
      if (keyOne !== keyTwo) {
        const [a, b] = [keyOne, keyTwo].sort();
        const record = (this.data.headToHead[`${a}|${b}`] ??= {
          winsA: 0,
          winsB: 0,
          draws: 0,
        });
        if (winnerKey === null) record.draws += 1;
        else if (winnerKey === a) record.winsA += 1;
        else record.winsB += 1;
      }
    }

    this.scheduleWrite();
  }

  /**
   * The all-time record between two players, zeroed if they have never
   * met. A/B follow the storage convention (alphabetical by lowercased
   * nickname), independent of argument order.
   */
  getRivalry(nickOne: string, nickTwo: string): RivalryRecord {
    const keyOne = normalizeKey(nickOne);
    const keyTwo = normalizeKey(nickTwo);
    const [a, b] = [keyOne, keyTwo].sort();
    const record = this.data.headToHead[`${a}|${b}`] ?? { winsA: 0, winsB: 0, draws: 0 };
    const displayFor = (key: string): string =>
      this.data.players[key]?.nickname ?? (key === keyOne ? nickOne : nickTwo);
    return {
      nicknameA: displayFor(a),
      nicknameB: displayFor(b),
      winsA: record.winsA,
      winsB: record.winsB,
      draws: record.draws,
    };
  }

  /** Lifetime totals for a nickname, or null if never seen. */
  getLifetime(nickname: string): LifetimePlayerStats | null {
    return this.data.players[normalizeKey(nickname)] ?? null;
  }

  /**
   * The top `n` persisted players ranked by lifetime wins desc, then kills
   * desc, then nickname asc (by the lowercased storage key, so the order is
   * case-insensitive; entries ship the display-cased nickname). Feeds the
   * server:leaderboard message. Empty store → empty array.
   */
  getTopPlayers(n: number): LeaderboardEntry[] {
    return Object.entries(this.data.players)
      .sort(([keyA, a], [keyB, b]) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.kills !== a.kills) return b.kills - a.kills;
        return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
      })
      .slice(0, n)
      .map(([, p]) => ({
        nickname: p.nickname,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        kills: p.kills,
        matches: p.matches,
        contractsCompleted: p.contractsCompleted,
      }));
  }

  /** Wait for every queued file write to land (shutdown / tests). */
  async flush(): Promise<void> {
    let current: Promise<void>;
    do {
      current = this.pendingWrite;
      await current;
    } while (current !== this.pendingWrite);
  }

  // ──────────────────────────── Private ────────────────────────────

  private load(): PersistentStatsData {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
    } catch {
      // First boot (or wiped data dir) — nothing to load.
      logger.info({ file: this.filePath }, 'No persistent stats file, starting fresh');
      return emptyData();
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        (parsed as { version?: unknown }).version !== 1 ||
        typeof (parsed as { players?: unknown }).players !== 'object' ||
        typeof (parsed as { headToHead?: unknown }).headToHead !== 'object'
      ) {
        throw new Error('unrecognized shape');
      }
      const data = parsed as PersistentStatsData;
      // Files written before newer KillWeapons existed ('pistol'/'punch'/'barrel',
      // and 'axe' before them) lack those weaponKills keys. Default them
      // to 0 so the Record<KillWeapon, number> contract holds for every
      // consumer without per-read null checks.
      for (const lifetime of Object.values(data.players)) {
        lifetime.contractsCompleted ??= 0;
        lifetime.weaponKills = {
          ...createEmptyKillsByWeapon(),
          ...lifetime.weaponKills,
        };
      }
      return data;
    } catch (err) {
      logger.warn(
        { err, file: this.filePath },
        'Persistent stats file is corrupt — starting fresh (old file will be overwritten)',
      );
      return emptyData();
    }
  }

  private scheduleWrite(): void {
    // Chain onto the previous write so writes serialize. writeNow never
    // rejects (it logs failures), so the chain cannot break.
    this.pendingWrite = this.pendingWrite.then(() => this.writeNow());
  }

  private async writeNow(): Promise<void> {
    try {
      await mkdir(this.dirPath, { recursive: true });
      const tmpPath = `${this.filePath}.tmp`;
      await writeFile(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
      await rename(tmpPath, this.filePath);
    } catch (err) {
      logger.error({ err, file: this.filePath }, 'Failed to persist lifetime stats');
    }
  }
}
