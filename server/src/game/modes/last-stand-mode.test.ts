import { describe, expect, it } from 'vitest';
import {
  GRENADE,
  LAST_STAND,
  MATCH,
  OVERTIME,
  GameModeType,
  TileType,
} from '@shared/game';
import type { MapData, PlayerId, PlayerState } from '@shared/game';
import { StatsTracker } from '../stats-tracker.js';
import type { MatchContext } from './game-mode.js';
import { LastStandMode } from './last-stand-mode.js';

function makePlayer(id: PlayerId, lives = 0): PlayerState {
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
    grenades: GRENADE.STARTING_COUNT,
    grenadeRegenSeconds: 0,
    isSprinting: false,
    stamina: 3,
    isDead: false,
    respawnTimer: 0,
    invulnerableTimer: 0,
    lastProcessedInput: 0,
    score: lives,
    deaths: 0,
    abilityActiveSeconds: 0,
    abilityCooldownSeconds: 0,
    abilityLockedAim: 0,
    frozenTimer: 0,
    secondWindTimer: 0,
  };
}

function makeMapData(): MapData {
  const width = 10;
  const height = 8;
  return {
    name: 'Test Arena',
    width,
    height,
    tileSize: 48,
    tiles: Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, col) =>
        row === 0 || row === height - 1 || col === 0 || col === width - 1
          ? TileType.WALL
          : TileType.FLOOR,
      ),
    ),
    spawnPoints: [
      { x: 1, y: 1 },
      { x: 8, y: 6 },
      { x: 8, y: 1 },
    ],
    pickupSpawns: [],
  };
}

function makeContext(
  players: PlayerState[],
  opts: { matchTimer?: number; isOvertime?: boolean } = {},
): MatchContext {
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const stats = new StatsTracker();
  for (const player of players) stats.initPlayer(player.id);
  const ctx: MatchContext = {
    matchId: 'last-stand-test',
    matchTimer: opts.matchTimer ?? MATCH.TIME_LIMIT,
    players: playerMap,
    stats,
    isOvertime: opts.isOvertime ?? false,
    getKillTarget: () => MATCH.KILL_TARGET,
    getTimeLimit: () => MATCH.TIME_LIMIT,
    getMapData: () => makeMapData(),
    getElapsedSeconds: () =>
      ctx.isOvertime
        ? MATCH.TIME_LIMIT + (OVERTIME.DURATION - ctx.matchTimer)
        : MATCH.TIME_LIMIT - ctx.matchTimer,
    clearWeaponTransients: () => {},
  };
  return ctx;
}

describe('LastStandMode', () => {
  it('starts every fighter with the configured stock', () => {
    const mode = new LastStandMode();
    const ctx = makeContext([makePlayer('p1'), makePlayer('p2'), makePlayer('p3')]);
    mode.onStart(ctx);
    expect([...ctx.players.values()].map((player) => player.score)).toEqual([
      LAST_STAND.STARTING_LIVES,
      LAST_STAND.STARTING_LIVES,
      LAST_STAND.STARTING_LIVES,
    ]);
  });

  it('removes one victim life per death and clamps at zero', () => {
    const mode = new LastStandMode();
    const victim = makePlayer('p2', 1);
    const ctx = makeContext([makePlayer('p1', 5), victim]);
    mode.onKill(ctx, 'p1', 'p2', 'gun');
    mode.onKill(ctx, 'p1', 'p2', 'gun');
    expect(victim.score).toBe(0);
    expect(mode.canRespawn(ctx, victim)).toBe(false);
  });

  it('suicides cost a life but overtime kills do not mutate stocks', () => {
    const mode = new LastStandMode();
    const player = makePlayer('p1', 3);
    const regulation = makeContext([player, makePlayer('p2', 3)]);
    mode.onKill(regulation, 'p1', 'p1', 'grenade');
    expect(player.score).toBe(2);

    const overtime = makeContext([player, makePlayer('p2', 2)], { isOvertime: true });
    mode.onKill(overtime, 'p2', 'p1', 'gun');
    expect(player.score).toBe(2);
  });

  it('continues an N-player round until at most one contender remains', () => {
    const mode = new LastStandMode();
    expect(
      mode.isMatchOver(
        makeContext([makePlayer('p1', 2), makePlayer('p2', 0), makePlayer('p3', 1)]),
      ),
    ).toBe(false);
    expect(
      mode.isMatchOver(
        makeContext([makePlayer('p1', 0), makePlayer('p2', 0), makePlayer('p3', 1)]),
      ),
    ).toBe(true);
  });

  it('ends on the clock and reports a tied stock for overtime', () => {
    const mode = new LastStandMode();
    const tied = makeContext([makePlayer('p1', 3), makePlayer('p2', 3)], {
      matchTimer: 0,
    });
    expect(mode.isMatchOver(tied)).toBe(true);
    expect(mode.determineWinner(tied)).toBeNull();
  });

  it('awards the highest remaining stock and ships Last Stand results', () => {
    const mode = new LastStandMode();
    const ctx = makeContext([makePlayer('p1', 4), makePlayer('p2', 2)]);
    const result = mode.getResults(ctx);
    expect(result.winnerId).toBe('p1');
    expect(result.gameMode).toBe(GameModeType.LAST_STAND);
    expect(result.rivalry).toBeNull();
  });
});
