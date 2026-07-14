import { describe, expect, it } from 'vitest';
import { CORE_RUN, GRENADE, MATCH, GameModeType, PickupType, TileType } from '@shared/game';
import type { MapData, PlayerId, PlayerState, TeamId } from '@shared/game';
import { StatsTracker } from '../stats-tracker.js';
import type { MatchContext } from './game-mode.js';
import { CoreRunMode } from './core-run-mode.js';

function player(id: PlayerId, x: number, y: number): PlayerState {
  return {
    id,
    nickname: id,
    characterId: 'mighty_man',
    position: { x, y },
    velocity: { x: 0, y: 0 },
    aimAngle: 0,
    health: 100,
    maxHealth: 100,
    armor: 0,
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
    score: 0,
    deaths: 0,
    abilityActiveSeconds: 0,
    abilityCooldownSeconds: 0,
    abilityLockedAim: 0,
    frozenTimer: 0,
    secondWindTimer: 0,
  };
}

function mapData(): MapData {
  return {
    name: 'Core Test Arena',
    width: 4,
    height: 4,
    tileSize: 48,
    tiles: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => TileType.FLOOR)),
    spawnPoints: [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
    ],
    pickupSpawns: [],
  };
}

interface TestContext extends MatchContext {
  isOvertime: boolean;
  matchTimer: number;
}

function context(
  players: PlayerState[],
  isOvertime = false,
  teamAssignments: Record<string, TeamId> = {},
): TestContext {
  const stats = new StatsTracker();
  for (const p of players) stats.initPlayer(p.id);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const teams = new Map(Object.entries(teamAssignments) as Array<[PlayerId, TeamId]>);
  return {
    matchId: 'core-test',
    matchTimer: MATCH.TIME_LIMIT,
    players: playerMap,
    stats,
    isOvertime,
    getKillTarget: () => MATCH.KILL_TARGET,
    getTimeLimit: () => MATCH.TIME_LIMIT,
    getMapData: mapData,
    getElapsedSeconds: () => 10,
    clearWeaponTransients: () => {},
    getTeamId: (playerId) => teams.get(playerId) ?? null,
    getTeamIds: () => [...new Set(teams.values())],
    getTeamScore: (teamId) =>
      [...playerMap.values()]
        .filter((candidate) => teams.get(candidate.id) === teamId)
        .reduce((total, candidate) => total + candidate.score, 0),
  };
}

describe('CoreRunMode', () => {
  it('starts loose at the exact arena center and resets scores', () => {
    const mode = new CoreRunMode();
    const a = player('a', 20, 20);
    a.score = 9;
    const ctx = context([a, player('b', 170, 170)]);

    mode.onStart(ctx);

    expect(a.score).toBe(0);
    expect(mode.getCoreRunState()).toEqual({
      position: { x: 96, y: 96 },
      carrierId: null,
      returnInSeconds: null,
      carryFraction: 0,
    });
  });

  it('uses nearest distance then player id to resolve simultaneous pickups', () => {
    const mode = new CoreRunMode();
    const ctx = context([player('b', 96, 96), player('a', 96, 96)]);
    mode.onStart(ctx);

    mode.onTick(ctx, 0.05);

    expect(mode.getCoreRunState().carrierId).toBe('a');
  });

  it('banks one point per full carried second and preserves the fraction', () => {
    const mode = new CoreRunMode();
    const carrier = player('carrier', 96, 96);
    const ctx = context([carrier, player('other', 170, 170)]);
    mode.onStart(ctx);
    mode.onTick(ctx, 0.05); // collect

    mode.onTick(ctx, 0.4);
    mode.onTick(ctx, 0.7);

    expect(carrier.score).toBe(1);
    expect(mode.getCoreRunState().carryFraction).toBeCloseTo(0.1, 5);
    expect(mode.getCoreRunState().position).toEqual(carrier.position);
  });

  it('drops with a killed carrier and lets another fighter steal it', () => {
    const mode = new CoreRunMode();
    const carrier = player('carrier', 96, 96);
    const rival = player('rival', 170, 170);
    const ctx = context([carrier, rival]);
    mode.onStart(ctx);
    mode.onTick(ctx, 0.05);
    carrier.position = { x: 140, y: 120 };

    mode.onKill(ctx, rival.id, carrier.id, 'gun');
    expect(mode.getCoreRunState()).toMatchObject({
      position: { x: 140, y: 120 },
      carrierId: null,
      returnInSeconds: CORE_RUN.RETURN_SECONDS,
    });

    carrier.isDead = true;
    rival.position = { x: 140, y: 120 };
    mode.onTick(ctx, 0.05);
    expect(mode.getCoreRunState().carrierId).toBe(rival.id);
  });

  it('returns an abandoned drop home after the recovery timer', () => {
    const mode = new CoreRunMode();
    const carrier = player('carrier', 96, 96);
    const rival = player('rival', 170, 170);
    const ctx = context([carrier, rival]);
    mode.onStart(ctx);
    mode.onTick(ctx, 0.05);
    carrier.position = { x: 130, y: 130 };
    mode.onKill(ctx, rival.id, carrier.id, 'grenade');
    carrier.isDead = true;

    mode.onTick(ctx, CORE_RUN.RETURN_SECONDS + 0.01);

    expect(mode.getCoreRunState()).toEqual({
      position: { x: 96, y: 96 },
      carrierId: null,
      returnInSeconds: null,
      carryFraction: 0,
    });
  });

  it('retires scoring during sudden-death overtime', () => {
    const mode = new CoreRunMode();
    const carrier = player('carrier', 96, 96);
    const ctx = context([carrier, player('rival', 170, 170)]);
    mode.onStart(ctx);
    mode.onTick(ctx, 0.05);
    ctx.isOvertime = true;

    mode.onTick(ctx, 2);

    expect(carrier.score).toBe(0);
    expect(mode.getCoreRunState().carrierId).toBeNull();
  });

  it('ends at the target or clock and resolves only a unique leader', () => {
    const mode = new CoreRunMode();
    const a = player('a', 0, 0);
    const b = player('b', 0, 0);
    const ctx = context([a, b]);
    mode.onStart(ctx);

    a.score = CORE_RUN.SCORE_TARGET;
    expect(mode.isMatchOver(ctx)).toBe(true);
    expect(mode.determineWinner(ctx)).toBe(a.id);

    b.score = CORE_RUN.SCORE_TARGET;
    expect(mode.determineWinner(ctx)).toBeNull();
    ctx.matchTimer = 0;
    expect(mode.isMatchOver(ctx)).toBe(true);
    expect(mode.getResults(ctx).gameMode).toBe(GameModeType.CORE_RUN);
  });

  it('ends and resolves by combined team carry time', () => {
    const mode = new CoreRunMode();
    const a = player('a', 0, 0);
    const b = player('b', 0, 0);
    const rivalA = player('rival-a', 0, 0);
    const rivalB = player('rival-b', 0, 0);
    const ctx = context([a, b, rivalA, rivalB], false, {
      a: 'blue',
      b: 'blue',
      'rival-a': 'red',
      'rival-b': 'red',
    });
    a.score = 23;
    b.score = 22;
    rivalA.score = 20;
    rivalB.score = 20;

    expect(mode.isMatchOver(ctx)).toBe(true);
    expect(mode.determineWinner(ctx)).toBe('a');
    rivalA.score = 23;
    rivalB.score = 22;
    expect(mode.determineWinner(ctx)).toBeNull();
  });

  it('removes special-weapon pickups but keeps sustain and ordnance', () => {
    const mode = new CoreRunMode();
    expect(mode.isPickupTypeEnabled(PickupType.WEAPON_SHOTGUN)).toBe(false);
    expect(mode.isPickupTypeEnabled(PickupType.WEAPON_PISTOL)).toBe(false);
    expect(mode.isPickupTypeEnabled(PickupType.WEAPON_BAT)).toBe(false);
    expect(mode.isPickupTypeEnabled(PickupType.GUN_AMMO)).toBe(true);
    expect(mode.isPickupTypeEnabled(PickupType.BANDAGE)).toBe(true);
    expect(mode.isPickupTypeEnabled(PickupType.ARMOR)).toBe(true);
    expect(mode.isPickupTypeEnabled(PickupType.OVERCHARGE)).toBe(true);
    expect(mode.isPickupTypeEnabled(PickupType.GRENADE)).toBe(true);
  });
});
