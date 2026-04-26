import { describe, it, expect, beforeEach } from 'vitest';
import { DeathmatchMode } from './deathmatch-mode.js';
import { MATCH, GameModeType } from '@shared/game';
import type { PlayerId, PlayerState } from '@shared/game';
import { StatsTracker } from '../stats-tracker.js';
import type { MatchContext } from './game-mode.js';

function makePlayer(id: PlayerId, score = 0, deaths = 0): PlayerState {
  return {
    id,
    nickname: `Player ${id}`,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: 100,
    maxHealth: 100,
    ammo: 30,
    isReloading: false,
    reloadTimer: 0,
    isSprinting: false,
    stamina: 3,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score,
    deaths,
  };
}

function makeContext(
  players: PlayerState[],
  matchTimer: number = MATCH.TIME_LIMIT,
): MatchContext {
  const playerMap = new Map<PlayerId, PlayerState>();
  const stats = new StatsTracker();

  for (const p of players) {
    playerMap.set(p.id, p);
    stats.initPlayer(p.id);
  }

  return {
    matchId: 'test-match',
    matchTimer,
    players: playerMap,
    stats,
    getKillTarget: () => MATCH.KILL_TARGET,
    getTimeLimit: () => MATCH.TIME_LIMIT,
  };
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

    it('should handle equal score and equal deaths', () => {
      const ctx = makeContext([
        makePlayer('p1', 5, 3),
        makePlayer('p2', 5, 3),
      ]);

      // With identical stats, the first player in the sort wins (deterministic)
      const result = mode.getResults(ctx);
      expect(result.winnerId).toBeDefined();
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
  });
});
