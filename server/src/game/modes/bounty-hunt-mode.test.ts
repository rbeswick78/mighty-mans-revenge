import { describe, expect, it } from 'vitest';
import {
  BOUNTY_HUNT,
  GRENADE,
  MATCH,
  GameModeType,
  TileType,
} from '@shared/game';
import type { MapData, PlayerId, PlayerState } from '@shared/game';
import { StatsTracker } from '../stats-tracker.js';
import type { MatchContext } from './game-mode.js';
import { BountyHuntMode } from './bounty-hunt-mode.js';

function player(id: PlayerId): PlayerState {
  return {
    id,
    nickname: id.toUpperCase(),
    characterId: 'mighty_man',
    position: { x: 100, y: 100 },
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
    name: 'Bounty Test Arena',
    width: 4,
    height: 4,
    tileSize: 48,
    tiles: Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => TileType.FLOOR),
    ),
    spawnPoints: [{ x: 0, y: 0 }, { x: 3, y: 3 }],
    pickupSpawns: [],
  };
}

interface TestContext extends MatchContext {
  isOvertime: boolean;
  matchTimer: number;
}

function context(players: PlayerState[], matchId = 'bounty-test'): TestContext {
  const stats = new StatsTracker();
  for (const p of players) stats.initPlayer(p.id);
  return {
    matchId,
    matchTimer: MATCH.TIME_LIMIT,
    players: new Map(players.map((p) => [p.id, p])),
    stats,
    isOvertime: false,
    getKillTarget: () => MATCH.KILL_TARGET,
    getTimeLimit: () => MATCH.TIME_LIMIT,
    getMapData: mapData,
    getElapsedSeconds: () => 10,
    clearWeaponTransients: () => {},
  };
}

describe('BountyHuntMode', () => {
  it('chooses a stable match-derived opening target and resets scores', () => {
    const players = [player('c'), player('a'), player('b')];
    players[0].score = 9;
    const first = new BountyHuntMode();
    const again = new BountyHuntMode();
    const firstCtx = context(players, 'same-match-id');
    const secondCtx = context([player('b'), player('c'), player('a')], 'same-match-id');

    first.onStart(firstCtx);
    again.onStart(secondCtx);

    expect(players.every((p) => p.score === 0)).toBe(true);
    expect(first.getBountyHuntState().targetId).toBe(
      again.getBountyHuntState().targetId,
    );
  });

  it('scores ordinary, target retaliation, and bounty-transfer kills 1/2/3', () => {
    const mode = new BountyHuntMode();
    const ctx = context([player('a'), player('b'), player('c')]);
    mode.onStart(ctx);
    const targetId = mode.getBountyHuntState().targetId!;
    const hunters = [...ctx.players.keys()].filter((id) => id !== targetId);

    mode.onKill(ctx, hunters[0], hunters[1], 'gun');
    expect(ctx.players.get(hunters[0])!.score).toBe(
      BOUNTY_HUNT.ORDINARY_KILL_POINTS,
    );

    mode.onKill(ctx, targetId, hunters[0], 'gun');
    expect(ctx.players.get(targetId)!.score).toBe(
      BOUNTY_HUNT.TARGET_RETALIATION_POINTS,
    );

    mode.onKill(ctx, hunters[1], targetId, 'grenade');
    expect(ctx.players.get(hunters[1])!.score).toBe(
      BOUNTY_HUNT.BOUNTY_KILL_POINTS,
    );
    expect(mode.getBountyHuntState().targetId).toBe(hunters[1]);
  });

  it('rotates away from a dead or self-killed target in stable player order', () => {
    const mode = new BountyHuntMode();
    const ctx = context([player('a'), player('b'), player('c')]);
    mode.onStart(ctx);
    const targetId = mode.getBountyHuntState().targetId!;
    ctx.players.get(targetId)!.isDead = true;

    mode.onTick(ctx, 0.05);

    const next = mode.getBountyHuntState().targetId;
    const ids = [...ctx.players.keys()].sort();
    const expected = ids[(ids.indexOf(targetId) + 1) % ids.length];
    expect(next).toBe(expected);
  });

  it('pays a posthumous bounty kill but rotates the mark to someone living', () => {
    const mode = new BountyHuntMode();
    const ctx = context([player('a'), player('b'), player('c')]);
    mode.onStart(ctx);
    const targetId = mode.getBountyHuntState().targetId!;
    const posthumousKiller = [...ctx.players.values()].find(
      (candidate) => candidate.id !== targetId,
    )!;
    posthumousKiller.isDead = true;

    mode.onKill(ctx, posthumousKiller.id, targetId, 'grenade');
    ctx.players.get(targetId)!.isDead = true;
    mode.onTick(ctx, 0.05);

    expect(posthumousKiller.score).toBe(BOUNTY_HUNT.BOUNTY_KILL_POINTS);
    expect(mode.getBountyHuntState().targetId).not.toBe(posthumousKiller.id);
    expect(mode.getBountyHuntState().targetId).not.toBe(targetId);
  });

  it('retires the mark and freezes score during sudden-death overtime', () => {
    const mode = new BountyHuntMode();
    const ctx = context([player('a'), player('b')]);
    mode.onStart(ctx);
    ctx.isOvertime = true;

    mode.onTick(ctx, 0.05);
    mode.onKill(ctx, 'a', 'b', 'gun');

    expect(mode.getBountyHuntState().targetId).toBeNull();
    expect(ctx.players.get('a')!.score).toBe(0);
  });

  it('ends at 25 or the clock and resolves score/death ties honestly', () => {
    const mode = new BountyHuntMode();
    const a = player('a');
    const b = player('b');
    const ctx = context([a, b]);
    mode.onStart(ctx);
    a.score = BOUNTY_HUNT.SCORE_TARGET;

    expect(mode.isMatchOver(ctx)).toBe(true);
    expect(mode.determineWinner(ctx)).toBe(a.id);

    b.score = a.score;
    expect(mode.determineWinner(ctx)).toBeNull();
    a.deaths = 1;
    expect(mode.determineWinner(ctx)).toBe(b.id);
    ctx.matchTimer = 0;
    expect(mode.isMatchOver(ctx)).toBe(true);
    expect(mode.getResults(ctx).gameMode).toBe(GameModeType.BOUNTY_HUNT);
  });
});
