import { describe, it, expect, beforeEach } from 'vitest';
import { GunGameMode } from './gun-game-mode.js';
import {
  GRENADE,
  GUN_GAME,
  GameModeType,
  MATCH,
  OVERTIME,
  PickupType,
  TileType,
  WEAPONS,
  gunGameTotalKills,
} from '@shared/game';
import type { MapData, PlayerId, PlayerState } from '@shared/game';
import { StatsTracker } from '../stats-tracker.js';
import type { MatchContext } from './game-mode.js';

/** Minimal valid-shaped map for MatchContext.getMapData in mode tests. */
function makeTestMapData(): MapData {
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
  /** Player ids clearWeaponTransients was called with, in order. */
  transientsCleared: PlayerId[];
}

function makeContext(
  players: PlayerState[],
  opts: { matchTimer?: number; isOvertime?: boolean } = {},
): TestContext {
  const playerMap = new Map<PlayerId, PlayerState>();
  const stats = new StatsTracker();
  for (const p of players) {
    playerMap.set(p.id, p);
    stats.initPlayer(p.id);
  }

  const ctx: TestContext = {
    matchId: 'test-match',
    matchTimer: opts.matchTimer ?? MATCH.TIME_LIMIT,
    players: playerMap,
    stats,
    isOvertime: opts.isOvertime ?? false,
    getKillTarget: () => MATCH.KILL_TARGET,
    getTimeLimit: () => MATCH.TIME_LIMIT,
    getMapData: () => makeTestMapData(),
    getElapsedSeconds: () =>
      ctx.isOvertime
        ? MATCH.TIME_LIMIT + (OVERTIME.DURATION - ctx.matchTimer)
        : MATCH.TIME_LIMIT - ctx.matchTimer,
    transientsCleared: [],
    clearWeaponTransients: (playerId: PlayerId) => {
      ctx.transientsCleared.push(playerId);
    },
  };
  return ctx;
}

// Ladder recap for these tests (RUNG_KILLS [2,2,2,2,1]): score 0-1 rifle,
// 2-3 shotgun, 4-5 pistol, 6-7 grenade, 8 punch; 9 total kills to win.

describe('GunGameMode', () => {
  let mode: GunGameMode;

  beforeEach(() => {
    mode = new GunGameMode();
  });

  describe('onKill — ladder advance rules', () => {
    it('advances on a kill with the current rung weapon', () => {
      const killer = makePlayer('p1', 0); // rifle rung → KillWeapon 'gun'
      const ctx = makeContext([killer, makePlayer('p2')]);
      mode.onKill(ctx, 'p1', 'p2', 'gun');
      expect(killer.score).toBe(1);
    });

    it('advances every rung with its own weapon, through the full ladder', () => {
      const cases: Array<[number, 'gun' | 'shotgun' | 'pistol' | 'grenade' | 'punch']> = [
        [0, 'gun'],
        [2, 'shotgun'],
        [4, 'pistol'],
        [6, 'grenade'],
        [8, 'punch'],
      ];
      for (const [score, weapon] of cases) {
        const killer = makePlayer('p1', score);
        const ctx = makeContext([killer, makePlayer('p2')]);
        mode.onKill(ctx, 'p1', 'p2', weapon);
        expect(killer.score).toBe(score + 1);
      }
    });

    it('does not advance on a wrong-weapon kill', () => {
      const killer = makePlayer('p1', 2); // shotgun rung
      const ctx = makeContext([killer, makePlayer('p2')]);
      mode.onKill(ctx, 'p1', 'p2', 'gun'); // rifle kill while on shotgun rung
      expect(killer.score).toBe(2);
    });

    it('does not advance on ability kills (axe / fire)', () => {
      const killer = makePlayer('p1', 0);
      const ctx = makeContext([killer, makePlayer('p2')]);
      mode.onKill(ctx, 'p1', 'p2', 'axe');
      mode.onKill(ctx, 'p1', 'p2', 'fire');
      expect(killer.score).toBe(0);
    });

    it('does not advance on a self-kill even with the rung weapon', () => {
      const killer = makePlayer('p1', 6); // grenade rung
      const ctx = makeContext([killer, makePlayer('p2')]);
      mode.onKill(ctx, 'p1', 'p1', 'grenade');
      expect(killer.score).toBe(6);
    });

    it('does not advance during overtime', () => {
      const killer = makePlayer('p1', 0);
      const ctx = makeContext([killer, makePlayer('p2')], { isOvertime: true });
      mode.onKill(ctx, 'p1', 'p2', 'gun');
      expect(killer.score).toBe(0);
    });
  });

  describe('onTick — loadout authority', () => {
    it('equips the rung weapon with a full mag, the reserve floor, and a clean slate', () => {
      const player = makePlayer('p1', 2); // shotgun rung, but holding the rifle
      player.isReloading = true;
      player.reloadTimer = 1.5;
      const ctx = makeContext([player]);

      mode.onTick(ctx, 0.05);

      expect(player.weaponId).toBe('shotgun');
      expect(player.specialAmmo).toBe(WEAPONS.shotgun.magazineSize);
      expect(player.specialReserve).toBe(GUN_GAME.SHOTGUN_RESERVE_FLOOR);
      expect(player.isReloading).toBe(false);
      expect(player.reloadTimer).toBe(0);
      expect(ctx.transientsCleared).toContain('p1');
    });

    it('equips the pistol with its own floor on the pistol rung', () => {
      const player = makePlayer('p1', 4);
      const ctx = makeContext([player]);

      mode.onTick(ctx, 0.05);

      expect(player.weaponId).toBe('pistol');
      expect(player.specialAmmo).toBe(WEAPONS.pistol.magazineSize);
      expect(player.specialReserve).toBe(GUN_GAME.PISTOL_RESERVE_FLOOR);
    });

    it('re-equips after the generic respawn rifle reset (self-healing)', () => {
      const player = makePlayer('p1', 4);
      const ctx = makeContext([player]);
      mode.onTick(ctx, 0.05);
      expect(player.weaponId).toBe('pistol');

      // Simulate Match's respawn reset: back on the rifle, special zeroed.
      player.weaponId = 'rifle';
      player.specialAmmo = 0;
      player.specialReserve = 0;

      mode.onTick(ctx, 0.05);
      expect(player.weaponId).toBe('pistol');
      expect(player.specialAmmo).toBe(WEAPONS.pistol.magazineSize);
    });

    it('re-equips rung weapons after an overtime reset (enforcement runs in overtime)', () => {
      const player = makePlayer('p1', 8); // punch rung
      const ctx = makeContext([player], { isOvertime: true });
      mode.onTick(ctx, 0.05);
      expect(player.weaponId).toBe('punch');
      expect(player.specialAmmo).toBe(0);
      expect(player.specialReserve).toBe(0);
    });

    it('skips dead players — the respawn reset stands until they live again', () => {
      const player = makePlayer('p1', 2);
      player.isDead = true;
      const ctx = makeContext([player]);
      mode.onTick(ctx, 0.05);
      expect(player.weaponId).toBe('rifle');
    });

    it('tops specialReserve back up to the floor every tick', () => {
      const player = makePlayer('p1', 2);
      const ctx = makeContext([player]);
      mode.onTick(ctx, 0.05);

      player.specialReserve = 1; // burned down by reloads
      mode.onTick(ctx, 0.05);
      expect(player.specialReserve).toBe(GUN_GAME.SHOTGUN_RESERVE_FLOOR);

      // Above the floor is left alone (no clamp-down).
      player.specialReserve = GUN_GAME.SHOTGUN_RESERVE_FLOOR + 3;
      mode.onTick(ctx, 0.05);
      expect(player.specialReserve).toBe(GUN_GAME.SHOTGUN_RESERVE_FLOOR + 3);
    });

    describe('grenade rung', () => {
      it('keeps the rifle in hand and reports guns disabled', () => {
        const player = makePlayer('p1', 6);
        const ctx = makeContext([player]);
        mode.onTick(ctx, 0.05);
        expect(player.weaponId).toBe('rifle');
        expect(mode.areGunsDisabled(ctx, player)).toBe(true);
      });

      it('reports guns enabled on every other rung', () => {
        const ctx = makeContext([]);
        for (const score of [0, 2, 4, 8]) {
          expect(mode.areGunsDisabled(ctx, makePlayer('p1', score))).toBe(false);
        }
      });

      it('fills grenades to MAX on rung entry', () => {
        const player = makePlayer('p1', 5); // pistol rung
        player.grenades = 0;
        const ctx = makeContext([player]);
        mode.onTick(ctx, 0.05);
        expect(player.grenades).toBe(0); // not the grenade rung yet

        player.score = 6; // advanced onto the grenade rung
        mode.onTick(ctx, 0.05);
        expect(player.grenades).toBe(GRENADE.MAX_COUNT);
        expect(player.grenadeRegenSeconds).toBe(0);
      });

      it('refills one grenade per GRENADE_REFILL_SECONDS up to MAX', () => {
        const player = makePlayer('p1', 6);
        const ctx = makeContext([player]);
        mode.onTick(ctx, 0.05); // rung entry: pouch filled
        player.grenades = GRENADE.MAX_COUNT - 2; // two thrown

        // One extra tick per segment absorbs float accumulation (60 sums
        // of 0.05 land a hair under 3.0).
        const dt = 0.05;
        const ticksPerRefill = Math.round(GUN_GAME.GRENADE_REFILL_SECONDS / dt) + 1;
        for (let i = 0; i < ticksPerRefill; i++) mode.onTick(ctx, dt);
        expect(player.grenades).toBe(GRENADE.MAX_COUNT - 1);

        for (let i = 0; i < ticksPerRefill; i++) mode.onTick(ctx, dt);
        expect(player.grenades).toBe(GRENADE.MAX_COUNT);

        // At MAX the accumulator stays parked at zero.
        for (let i = 0; i < ticksPerRefill; i++) mode.onTick(ctx, dt);
        expect(player.grenades).toBe(GRENADE.MAX_COUNT);
        expect(player.grenadeRegenSeconds).toBe(0);
      });
    });
  });

  describe('match end + winner', () => {
    it('ends when a player banks the full ladder of kills', () => {
      const ctx = makeContext([
        makePlayer('p1', gunGameTotalKills()),
        makePlayer('p2', 3),
      ]);
      expect(mode.isMatchOver(ctx)).toBe(true);
      expect(mode.determineWinner(ctx)).toBe('p1');
    });

    it('keeps running below the total with time on the clock', () => {
      const ctx = makeContext([
        makePlayer('p1', gunGameTotalKills() - 1),
        makePlayer('p2', 0),
      ]);
      expect(mode.isMatchOver(ctx)).toBe(false);
    });

    it('ends at time-out with the ladder leader as winner', () => {
      const ctx = makeContext([makePlayer('p1', 5), makePlayer('p2', 3)], {
        matchTimer: 0,
      });
      expect(mode.isMatchOver(ctx)).toBe(true);
      expect(mode.determineWinner(ctx)).toBe('p1');
    });

    it('reports a genuine tie as null (triggers the generic overtime)', () => {
      const ctx = makeContext([makePlayer('p1', 4), makePlayer('p2', 4)], {
        matchTimer: 0,
      });
      expect(mode.determineWinner(ctx)).toBeNull();
    });

    it('getResults mirrors the deathmatch shape with the gun_game mode tag', () => {
      const ctx = makeContext([makePlayer('p1', 9), makePlayer('p2', 2)]);
      const result = mode.getResults(ctx);
      expect(result.gameMode).toBe(GameModeType.GUN_GAME);
      expect(result.winnerId).toBe('p1');
      expect(result.playerStats.size).toBe(2);
      expect(result.rivalry).toBeNull();
      expect(result.nextMapName).toBeNull();
      expect(result.nextGameMode).toBeNull();
      expect(result.wentToOvertime).toBe(false);
    });
  });

  describe('mode hooks', () => {
    it('excludes loadout-breaking mutators from random rolls', () => {
      expect(mode.excludedMutators).toEqual([
        'grenades_only',
        'infinite_ammo',
        'fists_only',
        'weapon_roulette',
        'last_laugh',
        'scavenger_rush',
      ]);
    });

    it('enables only bandage pickups', () => {
      expect(mode.isPickupTypeEnabled(PickupType.BANDAGE)).toBe(true);
      expect(mode.isPickupTypeEnabled(PickupType.WEAPON_SHOTGUN)).toBe(false);
      expect(mode.isPickupTypeEnabled(PickupType.WEAPON_PISTOL)).toBe(false);
      expect(mode.isPickupTypeEnabled(PickupType.WEAPON_BAT)).toBe(false);
      expect(mode.isPickupTypeEnabled(PickupType.GUN_AMMO)).toBe(false);
      expect(mode.isPickupTypeEnabled(PickupType.GRENADE)).toBe(false);
      expect(mode.isPickupTypeEnabled(PickupType.ARMOR)).toBe(false);
      expect(mode.isPickupTypeEnabled(PickupType.OVERCHARGE)).toBe(false);
    });
  });
});
