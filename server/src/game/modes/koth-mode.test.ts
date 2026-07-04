import { describe, it, expect, beforeEach } from 'vitest';
import { KothMode } from './koth-mode.js';
import { MATCH, KOTH, MAP, OVERTIME, TileType, GameModeType } from '@shared/game';
import type { MapData, PlayerId, PlayerState } from '@shared/game';
import { StatsTracker } from '../stats-tracker.js';
import type { MatchContext } from './game-mode.js';

const TILE = MAP.TILE_SIZE;

/** Three hills, far enough apart that a player is only ever inside one. */
const HILLS = [
  { x: 2, y: 2 },
  { x: 10, y: 2 },
  { x: 6, y: 6 },
];

function makeTestMapData(kothHills?: { x: number; y: number }[]): MapData {
  const width = 16;
  const height = 10;
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
    tileSize: TILE,
    tiles,
    spawnPoints: [
      { x: 1, y: 1 },
      { x: 14, y: 8 },
    ],
    pickupSpawns: [],
    ...(kothHills ? { kothHills } : {}),
  };
}

function makePlayer(id: PlayerId, score = 0): PlayerState {
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
    deaths: 0,
    abilityActiveSeconds: 0,
    abilityCooldownSeconds: 0,
    abilityLockedAim: 0,
    frozenTimer: 0,
    secondWindTimer: 0,
  };
}

interface TestContext extends MatchContext {
  isOvertime: boolean;
  matchTimer: number;
}

function makeContext(
  players: PlayerState[],
  opts: { matchTimer?: number; hills?: { x: number; y: number }[] | undefined } = {},
): TestContext {
  const playerMap = new Map<PlayerId, PlayerState>();
  const stats = new StatsTracker();
  for (const p of players) {
    playerMap.set(p.id, p);
    stats.initPlayer(p.id);
  }
  const mapData = makeTestMapData(opts.hills);

  const ctx: TestContext = {
    matchId: 'test-match',
    matchTimer: opts.matchTimer ?? MATCH.TIME_LIMIT,
    players: playerMap,
    stats,
    isOvertime: false,
    getKillTarget: () => MATCH.KILL_TARGET,
    getTimeLimit: () => MATCH.TIME_LIMIT,
    getMapData: () => mapData,
    getElapsedSeconds: () => MATCH.TIME_LIMIT - ctx.matchTimer,
  };
  return ctx;
}

/** Place a player's center inside the given hill zone. */
function placeInHill(player: PlayerState, hill: { x: number; y: number }): void {
  player.position = {
    x: hill.x * TILE + TILE, // zone center (2 tiles wide)
    y: hill.y * TILE + TILE,
  };
}

function placeOutside(player: PlayerState): void {
  player.position = { x: 1.5 * TILE, y: 8.5 * TILE };
}

/** One server tick. */
const DT = 0.05;

function tickSeconds(mode: KothMode, ctx: MatchContext, seconds: number): void {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    mode.onTick(ctx, DT);
  }
}

describe('KothMode', () => {
  let mode: KothMode;

  beforeEach(() => {
    mode = new KothMode();
  });

  describe('hill setup', () => {
    it('starts on the first declared hill with no warning marker', () => {
      const ctx = makeContext([makePlayer('p1')], { hills: HILLS });
      mode.onStart(ctx);

      const state = mode.getKothState();
      expect(state.hill).toEqual(HILLS[0]);
      expect(state.nextHill).toBeNull();
      expect(state.occupantId).toBeNull();
      expect(state.contested).toBe(false);
      expect(state.captureFraction).toBe(0);
    });

    it('falls back to a single centered hill when the map declares none', () => {
      const ctx = makeContext([makePlayer('p1')], { hills: undefined });
      mode.onStart(ctx);

      const state = mode.getKothState();
      // 16x10 map, 2-tile hill: centered top-left = (7, 4).
      expect(state.hill).toEqual({ x: 7, y: 4 });
      // A single hill never shows a relocation warning.
      tickSeconds(mode, ctx, KOTH.HILL_MOVE_INTERVAL - 1);
      expect(mode.getKothState().nextHill).toBeNull();
    });
  });

  describe('scoring', () => {
    it('awards 1 point per full second of sole occupancy', () => {
      const p1 = makePlayer('p1');
      const p2 = makePlayer('p2');
      placeInHill(p1, HILLS[0]);
      placeOutside(p2);
      const ctx = makeContext([p1, p2], { hills: HILLS });
      mode.onStart(ctx);

      // 3.1s not 3.0 — accumulated float dt shouldn't decide the test at
      // the exact point boundary.
      tickSeconds(mode, ctx, 3.1);
      expect(p1.score).toBe(3);
      expect(p2.score).toBe(0);
      expect(mode.getKothState().occupantId).toBe('p1');
    });

    it('accrues fractional progress visible as captureFraction', () => {
      const p1 = makePlayer('p1');
      placeInHill(p1, HILLS[0]);
      const ctx = makeContext([p1], { hills: HILLS });
      mode.onStart(ctx);

      tickSeconds(mode, ctx, 0.5);
      expect(p1.score).toBe(0);
      expect(mode.getKothState().captureFraction).toBeCloseTo(0.5, 5);
    });

    it('does not score while contested, and flags it', () => {
      const p1 = makePlayer('p1');
      const p2 = makePlayer('p2');
      placeInHill(p1, HILLS[0]);
      placeInHill(p2, HILLS[0]);
      const ctx = makeContext([p1, p2], { hills: HILLS });
      mode.onStart(ctx);

      tickSeconds(mode, ctx, 2);
      expect(p1.score).toBe(0);
      expect(p2.score).toBe(0);
      const state = mode.getKothState();
      expect(state.contested).toBe(true);
      expect(state.occupantId).toBeNull();
      expect(state.captureFraction).toBe(0);
    });

    it('ignores dead players for occupancy — a corpse neither scores nor contests', () => {
      const p1 = makePlayer('p1');
      const p2 = makePlayer('p2');
      placeInHill(p1, HILLS[0]);
      placeInHill(p2, HILLS[0]);
      p2.isDead = true;
      const ctx = makeContext([p1, p2], { hills: HILLS });
      mode.onStart(ctx);

      tickSeconds(mode, ctx, 1);
      expect(p1.score).toBe(1);
      expect(mode.getKothState().contested).toBe(false);
    });

    it('resets fractional progress when the occupant leaves the zone', () => {
      const p1 = makePlayer('p1');
      placeInHill(p1, HILLS[0]);
      const ctx = makeContext([p1], { hills: HILLS });
      mode.onStart(ctx);

      tickSeconds(mode, ctx, 0.9);
      placeOutside(p1);
      mode.onTick(ctx, DT);
      placeInHill(p1, HILLS[0]);
      tickSeconds(mode, ctx, 0.5);

      // The 0.9s before stepping out never converts to a point.
      expect(p1.score).toBe(0);
      expect(mode.getKothState().captureFraction).toBeCloseTo(0.5, 5);
    });

    it('resets fractional progress when sole occupancy switches player', () => {
      const p1 = makePlayer('p1');
      const p2 = makePlayer('p2');
      placeInHill(p1, HILLS[0]);
      placeOutside(p2);
      const ctx = makeContext([p1, p2], { hills: HILLS });
      mode.onStart(ctx);

      tickSeconds(mode, ctx, 0.9);
      placeOutside(p1);
      placeInHill(p2, HILLS[0]);
      tickSeconds(mode, ctx, 0.5);

      expect(p1.score).toBe(0);
      expect(p2.score).toBe(0);
      const state = mode.getKothState();
      expect(state.occupantId).toBe('p2');
      expect(state.captureFraction).toBeCloseTo(0.5, 5);
    });

    it('kills never score (onKill is a no-op for the scoreboard)', () => {
      const p1 = makePlayer('p1');
      const p2 = makePlayer('p2');
      const ctx = makeContext([p1, p2], { hills: HILLS });
      mode.onStart(ctx);

      mode.onKill(ctx, 'p1', 'p2');
      expect(p1.score).toBe(0);
    });
  });

  describe('hill relocation', () => {
    it('relocates round-robin every HILL_MOVE_INTERVAL seconds and wraps', () => {
      const ctx = makeContext([makePlayer('p1')], { hills: HILLS });
      mode.onStart(ctx);

      // +0.1s margin per boundary so accumulated float dt can't leave the
      // timer a hair above zero at the exact interval.
      tickSeconds(mode, ctx, KOTH.HILL_MOVE_INTERVAL + 0.1);
      expect(mode.getKothState().hill).toEqual(HILLS[1]);
      tickSeconds(mode, ctx, KOTH.HILL_MOVE_INTERVAL);
      expect(mode.getKothState().hill).toEqual(HILLS[2]);
      tickSeconds(mode, ctx, KOTH.HILL_MOVE_INTERVAL);
      expect(mode.getKothState().hill).toEqual(HILLS[0]);
    });

    it('shows the next hill only inside the warning window', () => {
      const ctx = makeContext([makePlayer('p1')], { hills: HILLS });
      mode.onStart(ctx);

      tickSeconds(mode, ctx, KOTH.HILL_MOVE_INTERVAL - KOTH.HILL_MOVE_WARNING - 1);
      expect(mode.getKothState().nextHill).toBeNull();

      tickSeconds(mode, ctx, 1.5);
      expect(mode.getKothState().nextHill).toEqual(HILLS[1]);
    });

    it('resets capture progress when the hill moves', () => {
      const p1 = makePlayer('p1');
      placeOutside(p1);
      const ctx = makeContext([p1], { hills: HILLS });
      mode.onStart(ctx);

      // Step onto the hill only for its final half-second, so the accrued
      // fraction (~0.5) is nowhere near a point boundary when the move
      // wipes it.
      tickSeconds(mode, ctx, KOTH.HILL_MOVE_INTERVAL - 0.5);
      placeInHill(p1, HILLS[0]);
      tickSeconds(mode, ctx, 1);

      // Player is now outside the (moved) hill; the in-flight fraction died
      // with the old hill.
      expect(p1.score).toBe(0);
      expect(mode.getKothState().hill).toEqual(HILLS[1]);
      expect(mode.getKothState().occupantId).toBeNull();
      expect(mode.getKothState().captureFraction).toBe(0);
    });
  });

  describe('match end conditions', () => {
    it('ends at the score target', () => {
      const p1 = makePlayer('p1', KOTH.SCORE_TARGET - 1);
      const ctx = makeContext([p1, makePlayer('p2')], { hills: HILLS });
      mode.onStart(ctx);
      expect(mode.isMatchOver(ctx)).toBe(false);

      p1.score = KOTH.SCORE_TARGET;
      expect(mode.isMatchOver(ctx)).toBe(true);
    });

    it('ends at time-out', () => {
      const ctx = makeContext([makePlayer('p1'), makePlayer('p2')], {
        hills: HILLS,
        matchTimer: 0,
      });
      mode.onStart(ctx);
      expect(mode.isMatchOver(ctx)).toBe(true);
    });

    it('determineWinner picks the higher score and reports equal scores as a tie', () => {
      const p1 = makePlayer('p1', 30);
      const p2 = makePlayer('p2', 20);
      const ctx = makeContext([p1, p2], { hills: HILLS });
      expect(mode.determineWinner(ctx)).toBe('p1');

      p2.score = 30;
      expect(mode.determineWinner(ctx)).toBeNull();
    });

    it('getResults reports KOTH mode and the scoreboard winner', () => {
      const p1 = makePlayer('p1', 42);
      const p2 = makePlayer('p2', 17);
      const ctx = makeContext([p1, p2], { hills: HILLS, matchTimer: 0 });
      mode.onStart(ctx);

      const result = mode.getResults(ctx);
      expect(result.gameMode).toBe(GameModeType.KOTH);
      expect(result.winnerId).toBe('p1');
      expect(result.wentToOvertime).toBe(false);
      expect(result.duration).toBe(MATCH.TIME_LIMIT);
    });
  });

  describe('overtime', () => {
    it('freezes scoring and relocation during sudden death', () => {
      const p1 = makePlayer('p1');
      placeInHill(p1, HILLS[0]);
      const ctx = makeContext([p1], { hills: HILLS });
      mode.onStart(ctx);
      ctx.isOvertime = true;
      ctx.matchTimer = OVERTIME.DURATION;

      tickSeconds(mode, ctx, KOTH.HILL_MOVE_INTERVAL + 5);
      expect(p1.score).toBe(0);
      expect(mode.getKothState().hill).toEqual(HILLS[0]);
    });
  });
});
