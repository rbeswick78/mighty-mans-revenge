import { describe, expect, it } from 'vitest';
import { GRENADE, KILL_CONFIRMED, MATCH, GameModeType, TileType } from '@shared/game';
import type { MapData, PlayerId, PlayerState, TeamId } from '@shared/game';
import { StatsTracker } from '../stats-tracker.js';
import type { MatchContext } from './game-mode.js';
import { KillConfirmedMode } from './kill-confirmed-mode.js';

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
    name: 'Test Arena',
    width: 4,
    height: 4,
    tileSize: 48,
    tiles: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => TileType.FLOOR)),
    spawnPoints: [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
    pickupSpawns: [],
  };
}

function context(
  players: PlayerState[],
  isOvertime = false,
  teamAssignments: Record<string, TeamId> = {},
): MatchContext {
  const stats = new StatsTracker();
  for (const p of players) stats.initPlayer(p.id);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const teams = new Map(Object.entries(teamAssignments) as Array<[PlayerId, TeamId]>);
  return {
    matchId: 'kc-test',
    matchTimer: MATCH.TIME_LIMIT,
    players: playerMap,
    stats,
    isOvertime,
    getKillTarget: () => MATCH.KILL_TARGET,
    getTimeLimit: () => MATCH.TIME_LIMIT,
    getMapData: mapData,
    getElapsedSeconds: () => 1,
    clearWeaponTransients: () => {},
    getTeamId: (playerId) => teams.get(playerId) ?? null,
    getTeamIds: () => [...new Set(teams.values())],
    getTeamScore: (teamId) =>
      [...playerMap.values()]
        .filter((candidate) => teams.get(candidate.id) === teamId)
        .reduce((total, candidate) => total + candidate.score, 0),
  };
}

describe('KillConfirmedMode', () => {
  it('spawns a tag at the victim without awarding the raw kill', () => {
    const mode = new KillConfirmedMode();
    const killer = player('killer', 20, 20);
    const victim = player('victim', 100, 120);
    const ctx = context([killer, victim]);
    mode.onStart(ctx);
    mode.onKill(ctx, killer.id, victim.id, 'gun');

    expect(killer.score).toBe(0);
    expect(mode.getKillConfirmedTags()).toMatchObject([
      { ownerId: victim.id, position: { x: 100, y: 120 } },
    ]);
  });

  it('awards an enemy collector and removes the confirmed tag', () => {
    const mode = new KillConfirmedMode();
    const killer = player('killer', 20, 20);
    const victim = player('victim', 100, 120);
    const ctx = context([killer, victim]);
    mode.onStart(ctx);
    mode.onKill(ctx, killer.id, victim.id, 'gun');
    victim.isDead = true;
    killer.position = { x: 100, y: 120 };
    mode.onTick(ctx, 0.05);

    expect(killer.score).toBe(1);
    expect(mode.getKillConfirmedTags()).toEqual([]);
    expect(mode.getKillConfirmedCollections()).toMatchObject([
      { collectorId: killer.id, ownerId: victim.id, confirmed: true },
    ]);
  });

  it('lets the owner deny a tag without scoring', () => {
    const mode = new KillConfirmedMode();
    const killer = player('killer', 20, 20);
    const victim = player('victim', 100, 120);
    const ctx = context([killer, victim]);
    mode.onStart(ctx);
    mode.onKill(ctx, killer.id, victim.id, 'gun');
    victim.position = { x: 100, y: 120 };
    mode.onTick(ctx, 0.05);

    expect(victim.score).toBe(0);
    expect(mode.getKillConfirmedTags()).toEqual([]);
    expect(mode.getKillConfirmedCollections()).toMatchObject([
      { collectorId: victim.id, ownerId: victim.id, confirmed: false },
    ]);
  });

  it('lets either teammate deny an allied tag without scoring', () => {
    const mode = new KillConfirmedMode();
    const owner = player('owner', 100, 120);
    const ally = player('ally', 20, 20);
    const rival = player('rival', 180, 180);
    const ctx = context([owner, ally, rival], false, {
      owner: 'blue',
      ally: 'blue',
      rival: 'red',
    });
    mode.onStart(ctx);
    mode.onKill(ctx, rival.id, owner.id, 'gun');
    owner.isDead = true;
    ally.position = { x: 100, y: 120 };
    mode.onTick(ctx, 0.05);

    expect(ally.score).toBe(0);
    expect(mode.getKillConfirmedTags()).toEqual([]);
    expect(mode.getKillConfirmedCollections()).toMatchObject([
      { collectorId: ally.id, ownerId: owner.id, confirmed: false },
    ]);
  });

  it('expires abandoned tags', () => {
    const mode = new KillConfirmedMode();
    const a = player('a', 0, 0);
    const b = player('b', 200, 200);
    const owner = player('owner', 100, 100);
    const ctx = context([a, b, owner]);
    mode.onStart(ctx);
    mode.onKill(ctx, a.id, owner.id, 'gun');
    mode.onTick(ctx, KILL_CONFIRMED.TAG_LIFETIME_SECONDS + 0.01);
    expect(mode.getKillConfirmedTags()).toEqual([]);
  });

  it('lets a third player confirm a tag and breaks equal-distance ties by id', () => {
    const mode = new KillConfirmedMode();
    const a = player('a', 90, 100);
    const b = player('b', 110, 100);
    const owner = player('owner', 100, 100);
    owner.isDead = true;
    const ctx = context([b, a, owner]);
    mode.onStart(ctx);
    mode.onKill(ctx, b.id, owner.id, 'gun');
    mode.onTick(ctx, 0.05);

    expect(a.score).toBe(1);
    expect(b.score).toBe(0);
    expect(mode.getKillConfirmedCollections()).toMatchObject([
      { collectorId: a.id, ownerId: owner.id, confirmed: true },
    ]);
  });

  it('ends at the confirmation target and resolves timed ties through overtime', () => {
    const mode = new KillConfirmedMode();
    const a = player('a', 0, 0);
    const b = player('b', 100, 100);
    const ctx = context([a, b]);
    a.score = KILL_CONFIRMED.SCORE_TARGET;
    expect(mode.isMatchOver(ctx)).toBe(true);
    expect(mode.determineWinner(ctx)).toBe(a.id);
    b.score = a.score;
    expect(mode.determineWinner(ctx)).toBeNull();
  });

  it('ends and resolves by combined team confirmations', () => {
    const mode = new KillConfirmedMode();
    const a = player('a', 0, 0);
    const b = player('b', 0, 0);
    const rivalA = player('rival-a', 100, 100);
    const rivalB = player('rival-b', 100, 100);
    const ctx = context([a, b, rivalA, rivalB], false, {
      a: 'blue',
      b: 'blue',
      'rival-a': 'red',
      'rival-b': 'red',
    });
    a.score = 4;
    b.score = 4;
    rivalA.score = 4;
    rivalB.score = 3;

    expect(mode.isMatchOver(ctx)).toBe(true);
    expect(mode.determineWinner(ctx)).toBe('a');
    rivalB.score = 4;
    expect(mode.determineWinner(ctx)).toBeNull();
  });

  it('does not create or retain tags during sudden death', () => {
    const mode = new KillConfirmedMode();
    const a = player('a', 0, 0);
    const b = player('b', 100, 100);
    const ctx = context([a, b]);
    mode.onStart(ctx);
    mode.onKill(ctx, a.id, b.id, 'gun');
    ctx.isOvertime = true;
    mode.onTick(ctx, 0.05);
    mode.onKill(ctx, a.id, b.id, 'gun');
    expect(mode.getKillConfirmedTags()).toEqual([]);
    expect(mode.getResults(ctx).gameMode).toBe(GameModeType.KILL_CONFIRMED);
  });
});
