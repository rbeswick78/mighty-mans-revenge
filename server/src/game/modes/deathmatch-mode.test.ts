import { describe, it, expect, beforeEach } from 'vitest';
import { DeathmatchMode } from './deathmatch-mode.js';
import { MATCH, OVERTIME, TileType } from '@shared/game';
import { GameModeType } from '@shared/game';
import type { MapData, PlayerId, PlayerState } from '@shared/game';
import { StatsTracker } from '../stats-tracker.js';
import type { MatchContext } from './game-mode.js';

/** Minimal valid-shaped map for MatchContext.getMapData in mode tests. */
function makeTestMapData(kothHills?: { x: number; y: number }[]): MapData {
  const width = 10;
  const height = 8;
  const tiles: TileType[][] = Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, col) =>
      row === 0 || row === height - 1 || col === 0 || col === width - 1
        ? TileType.WALL
        : TileType.FLOOR,
    ),
  );
  return {
    name: 'Test Arena',
    width,
    height,
    tileSize: 48,
    tiles,
    spawnPoints: [
      { x: 1, y: 1 },
      { x: 8, y: 6 },
    ],
    pickupSpawns: [],
    ...(kothHills ? { kothHills } : {}),
  };
}

function makePlayer(id: PlayerId, score = 0, deaths = 0): PlayerState {
  return {
    id,
    nickname: `Player ${id}`,
    characterId: 'mighty_man',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: 100,
    maxHealth: 100,
    ammo: 30,
    isReloading: false,
    reloadTimer: 0,
    weaponId: 'rifle',
    specialAmmo: 0,
    specialReserve: 0,
    grenades: 3,
    grenadeRegenSeconds: 0,
    isSprinting: false,
    stamina: 3,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score,
    deaths,
    abilityActiveSeconds: 0,
    abilityCooldownSeconds: 0,
    abilityLockedAim: 0,
    frozenTimer: 0,
    secondWindTimer: 0,
  };
}

function makeContext(
  players: PlayerState[],
  matchTimer: number = MATCH.TIME_LIMIT,
  isOvertime = false,
): MatchContext {
  const playerMap = new Map<PlayerId, PlayerState>();
  const stats = new StatsTracker();

  for (const p of players) {
    playerMap.set(p.id, p);
    stats.initPlayer(p.id);
  }

  const ctx: MatchContext = {
    matchId: 'test-match',
    matchTimer,
    players: playerMap,
    stats,
    isOvertime,
    getKillTarget: () => MATCH.KILL_TARGET,
    getTimeLimit: () => MATCH.TIME_LIMIT,
    getMapData: () => makeTestMapData(),
    getElapsedSeconds: () =>
      isOvertime
        ? MATCH.TIME_LIMIT + (OVERTIME.DURATION - matchTimer)
        : MATCH.TIME_LIMIT - matchTimer,
  };
  return ctx;
}

describe('DeathmatchMode', () => {
  let mode: DeathmatchMode;

  beforeEach(() => {
    mode = new DeathmatchMode();
  });

  describe('isMatchOver', () => {
    it('should return false when no player has reached kill target', () => {
      const ctx = makeContext([
        makePlayer('p1', 3),
        makePlayer('p2', 5),
      ]);

      expect(mode.isMatchOver(ctx)).toBe(false);
    });

    it('should return true when a player reaches kill target', () => {
      const ctx = makeContext([
        makePlayer('p1', MATCH.KILL_TARGET),
        makePlayer('p2', 5),
      ]);

      expect(mode.isMatchOver(ctx)).toBe(true);
    });

    it('should return true when time runs out', () => {
      const ctx = makeContext([
        makePlayer('p1', 3),
        makePlayer('p2', 5),
      ], 0);

      expect(mode.isMatchOver(ctx)).toBe(true);
    });

    it('should return false when time is still remaining and no kill target met', () => {
      const ctx = makeContext([
        makePlayer('p1', 3),
        makePlayer('p2', 5),
      ], 100);

      expect(mode.isMatchOver(ctx)).toBe(false);
    });
  });

  describe('onKill', () => {
    it('should increment killer score', () => {
      const ctx = makeContext([
        makePlayer('p1', 0),
        makePlayer('p2', 0),
      ]);

      mode.onKill(ctx, 'p1', 'p2');
      expect(ctx.players.get('p1')!.score).toBe(1);
    });
  });

  describe('getResults', () => {
    it('should return player with highest score as winner', () => {
      const ctx = makeContext([
        makePlayer('p1', 7),
        makePlayer('p2', 5),
      ]);

      const result = mode.getResults(ctx);
      expect(result.winnerId).toBe('p1');
      expect(result.gameMode).toBe(GameModeType.DEATHMATCH);
    });

    it('should tie-break by fewer deaths', () => {
      const ctx = makeContext([
        makePlayer('p1', 5, 3),
        makePlayer('p2', 5, 1),
      ]);

      const result = mode.getResults(ctx);
      expect(result.winnerId).toBe('p2');
    });

    it('reports a genuine tie (equal score and deaths) as winnerId null', () => {
      const ctx = makeContext([
        makePlayer('p1', 5, 3),
        makePlayer('p2', 5, 3),
      ]);

      // A real tie flows into overtime (Match handles that); the mode must
      // NOT invent an arbitrary winner.
      const result = mode.getResults(ctx);
      expect(result.winnerId).toBeNull();
      expect(mode.determineWinner(ctx)).toBeNull();
    });

    it('flags wentToOvertime and extends duration when the match is in overtime', () => {
      const ctx = makeContext(
        [makePlayer('p1', 5, 3), makePlayer('p2', 5, 3)],
        OVERTIME.DURATION - 10,
        true,
      );

      const result = mode.getResults(ctx);
      expect(result.wentToOvertime).toBe(true);
      expect(result.duration).toBe(MATCH.TIME_LIMIT + 10);
    });

    it('should calculate correct duration', () => {
      const ctx = makeContext([
        makePlayer('p1', 10),
        makePlayer('p2', 5),
      ], 200);

      const result = mode.getResults(ctx);
      // duration = TIME_LIMIT - matchTimer = 300 - 200 = 100
      expect(result.duration).toBe(MATCH.TIME_LIMIT - 200);
    });

    it('should include all player stats', () => {
      const ctx = makeContext([
        makePlayer('p1', 3),
        makePlayer('p2', 5),
        makePlayer('p3', 2),
      ]);

      const result = mode.getResults(ctx);
      expect(result.playerStats.size).toBe(3);
    });

    it('computes awards from match stats with nicknames attached', () => {
      const ctx = makeContext([makePlayer('p1'), makePlayer('p2')]);
      ctx.stats.recordDamageTaken('p1', 120);

      const result = mode.getResults(ctx);
      expect(result.awards).toEqual([
        {
          id: 'pincushion',
          playerId: 'p1',
          nickname: 'Player p1',
          detail: '120 DAMAGE TAKEN',
        },
      ]);
    });

    it('ships empty awards and null rivalry on a no-action match', () => {
      const ctx = makeContext([makePlayer('p1'), makePlayer('p2')]);

      const result = mode.getResults(ctx);
      expect(result.awards).toEqual([]);
      expect(result.rivalry).toBeNull();
    });
  });
});
