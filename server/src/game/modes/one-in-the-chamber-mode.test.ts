import { describe, expect, it, vi } from 'vitest';
import {
  GRENADE,
  MATCH,
  ONE_IN_THE_CHAMBER,
  OVERTIME,
  GameModeType,
  PickupType,
  TileType,
} from '@shared/game';
import type { MapData, PlayerId, PlayerState } from '@shared/game';
import { StatsTracker } from '../stats-tracker.js';
import type { MatchContext } from './game-mode.js';
import { OneInTheChamberMode } from './one-in-the-chamber-mode.js';

function makePlayer(id: PlayerId): PlayerState {
  return {
    id,
    nickname: `Player ${id}`,
    characterId: 'mighty_man',
    position: { x: 0, y: 0 },
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

function makeMapData(): MapData {
  const width = 6;
  const height = 6;
  return {
    name: 'Chamber Test',
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
    spawnPoints: [{ x: 1, y: 1 }, { x: 4, y: 4 }],
    pickupSpawns: [],
  };
}

function makeContext(
  players: PlayerState[],
  opts: { matchTimer?: number; isOvertime?: boolean } = {},
): MatchContext & { clearWeaponTransients: ReturnType<typeof vi.fn> } {
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const stats = new StatsTracker();
  for (const player of players) stats.initPlayer(player.id);
  const ctx: MatchContext & {
    clearWeaponTransients: ReturnType<typeof vi.fn>;
  } = {
    matchId: 'chamber-test',
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
    clearWeaponTransients: vi.fn(),
  };
  return ctx;
}

describe('OneInTheChamberMode', () => {
  it('starts every fighter with exactly one pistol round and no grenades', () => {
    const mode = new OneInTheChamberMode();
    const players = [makePlayer('p1'), makePlayer('p2'), makePlayer('p3')];
    const ctx = makeContext(players);
    mode.onStart(ctx);

    for (const player of players) {
      expect(player.weaponId).toBe('pistol');
      expect(player.specialAmmo).toBe(ONE_IN_THE_CHAMBER.CHAMBERED_ROUNDS);
      expect(player.specialReserve).toBe(0);
      expect(player.grenades).toBe(0);
    }
    expect(ctx.clearWeaponTransients).toHaveBeenCalledTimes(3);
  });

  it('swaps a spent chamber to fists and never permits reload reserves', () => {
    const mode = new OneInTheChamberMode();
    const player = makePlayer('p1');
    const ctx = makeContext([player]);
    mode.onStart(ctx);
    player.specialAmmo = 0;
    player.specialReserve = 12;
    player.isReloading = true;
    mode.onTick(ctx, 0.05);

    expect(player.weaponId).toBe('punch');
    expect(player.specialAmmo).toBe(0);
    expect(player.specialReserve).toBe(0);
    expect(player.isReloading).toBe(false);
  });

  it('scores pistol and punch opponent kills and immediately earns a round', () => {
    const mode = new OneInTheChamberMode();
    const killer = makePlayer('p1');
    const victim = makePlayer('p2');
    const ctx = makeContext([killer, victim]);
    mode.onStart(ctx);
    killer.weaponId = 'punch';
    killer.specialAmmo = 0;

    mode.onKill(ctx, killer.id, victim.id, 'punch');
    expect(killer.score).toBe(1);
    expect(killer.weaponId).toBe('pistol');
    expect(killer.specialAmmo).toBe(1);

    mode.onKill(ctx, killer.id, victim.id, 'pistol');
    expect(killer.score).toBe(2);
    expect(killer.specialAmmo).toBe(1);
  });

  it('scores pistol-triggered barrel kills but not suicides or off-rules sources', () => {
    const mode = new OneInTheChamberMode();
    const player = makePlayer('p1');
    const ctx = makeContext([player, makePlayer('p2')]);
    mode.onKill(ctx, player.id, player.id, 'punch');
    mode.onKill(ctx, player.id, 'p2', 'axe');
    expect(player.score).toBe(0);
    mode.onKill(ctx, player.id, 'p2', 'barrel');
    expect(player.score).toBe(1);
    expect(player.specialAmmo).toBe(1);
  });

  it('grants one fresh round after a victim respawns and at overtime start', () => {
    const mode = new OneInTheChamberMode();
    const a = makePlayer('p1');
    const b = makePlayer('p2');
    const ctx = makeContext([a, b]);
    mode.onStart(ctx);
    mode.onKill(ctx, a.id, b.id, 'pistol');
    b.isDead = true;
    b.weaponId = 'rifle';
    mode.onTick(ctx, 0.05);
    expect(b.weaponId).toBe('rifle');

    b.isDead = false;
    mode.onTick(ctx, 0.05);
    expect(b.weaponId).toBe('pistol');
    expect(b.specialAmmo).toBe(1);

    ctx.isOvertime = true;
    a.weaponId = 'rifle';
    b.weaponId = 'rifle';
    mode.onTick(ctx, 0.05);
    expect(a.weaponId).toBe('pistol');
    expect(b.weaponId).toBe('pistol');
  });

  it('makes validated pistol and punch hits lethal while preserving other damage', () => {
    const mode = new OneInTheChamberMode();
    const attacker = makePlayer('p1');
    const victim = makePlayer('p2');
    victim.health = 87;
    const ctx = makeContext([attacker, victim]);
    expect(mode.damageForWeaponHit(ctx, attacker, victim, 'pistol', 10)).toBe(87);
    expect(mode.damageForWeaponHit(ctx, attacker, victim, 'punch', 35)).toBe(87);
    expect(mode.damageForWeaponHit(ctx, attacker, victim, 'rifle', 10)).toBe(10);
    victim.health = 12;
    expect(mode.damageForWeaponHit(ctx, attacker, victim, 'punch', 35)).toBe(12);
  });

  it('owns the combat economy and leaves only bandages enabled', () => {
    const mode = new OneInTheChamberMode();
    const player = makePlayer('p1');
    const ctx = makeContext([player]);
    expect(mode.areAbilitiesDisabled(ctx, player)).toBe(true);
    expect(mode.areGrenadesDisabled(ctx, player)).toBe(true);
    expect(mode.isPickupTypeEnabled(PickupType.BANDAGE)).toBe(true);
    expect(mode.isPickupTypeEnabled(PickupType.ARMOR)).toBe(false);
    expect(mode.isPickupTypeEnabled(PickupType.OVERCHARGE)).toBe(false);
    expect(mode.isPickupTypeEnabled(PickupType.WEAPON_PISTOL)).toBe(false);
    expect(mode.isPickupTypeEnabled(PickupType.WEAPON_BAT)).toBe(false);
    expect(mode.excludedMutators).toEqual([
      'grenades_only',
      'infinite_ammo',
      'fists_only',
      'weapon_roulette',
      'low_health',
      'vampire',
      'turbo_grenades',
      'ability_overdrive',
      'last_laugh',
      'scavenger_rush',
    ]);
  });

  it('ends at first-to-eight, ties on equal scores, and ships mode results', () => {
    const mode = new OneInTheChamberMode();
    const a = makePlayer('p1');
    const b = makePlayer('p2');
    const ctx = makeContext([a, b]);
    a.score = ONE_IN_THE_CHAMBER.SCORE_TARGET;
    b.score = 7;
    expect(mode.isMatchOver(ctx)).toBe(true);
    expect(mode.determineWinner(ctx)).toBe(a.id);
    expect(mode.getResults(ctx).gameMode).toBe(GameModeType.ONE_IN_THE_CHAMBER);

    b.score = a.score;
    expect(mode.determineWinner(ctx)).toBeNull();
  });
});
