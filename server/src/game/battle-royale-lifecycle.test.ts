import { afterEach, describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  GameModeType,
  MATCH,
  MatchPhase,
  RESPAWN,
  WEAPONS,
  type PlayerInput,
  type PlayerState,
  type WeaponInstance,
  type MapData,
} from '@shared/game';
import { Match } from './match.js';

function makeMapData(): MapData {
  return {
    name: 'battle-royale-lifecycle-test',
    width: 10,
    height: 10,
    tileSize: 48,
    tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
    spawnPoints: [
      { x: 1, y: 1 },
      { x: 8, y: 8 },
      { x: 1, y: 8 },
      { x: 8, y: 1 },
    ],
    pickupSpawns: [],
  };
}

function createBattleRoyaleMatch(playerCount = 4): Match {
  return new Match(
    'battle-royale-lifecycle',
    makeMapData(),
    Array.from({ length: playerCount }, (_, index) => ({
      id: `player-${index}`,
      nickname: `Player ${index}`,
    })),
    GameModeType.DEATHMATCH,
    () => 0,
    [],
    undefined,
    undefined,
    undefined,
    undefined,
    new Map(),
    new Map(),
    { format: 'battle_royale' },
  );
}

function activate(match: Match): void {
  match.phase = MatchPhase.ACTIVE;
  match.matchTimer = MATCH.TIME_LIMIT;
}

function advance(match: Match, seconds: number): void {
  const ticks = Math.round(seconds / 0.05);
  for (let tick = 0; tick < ticks; tick += 1) match.update(0.05);
}

function eliminate(match: Match, killerId: string, victimId: string): void {
  match.onKill(killerId, victimId, 'gun');
}

function fireInput(sequenceNumber: number, aimAngle = 0): PlayerInput {
  return {
    sequenceNumber,
    moveX: 0,
    moveY: 0,
    aimAngle,
    aimingGun: false,
    firePressed: true,
    aimingGrenade: false,
    throwPressed: false,
    detonatePressed: false,
    reload: false,
    sprint: false,
    abilityPressed: false,
    tick: sequenceNumber,
  };
}

function equipBattleRoyaleGun(
  player: PlayerState,
  weaponInstance: WeaponInstance,
  loadedAmmo: number,
  reserveAmmo = 0,
): void {
  player.weaponId = weaponInstance.weaponId;
  player.weaponInstance = weaponInstance;
  player.ammo = loadedAmmo;
  player.specialAmmo = loadedAmmo;
  player.specialReserve = reserveAmmo;
  player.battleRoyaleInventory = {
    equipped: weaponInstance,
    loadedAmmo,
    reserveAmmo,
  };
}

afterEach(() => {
  delete process.env.FORCE_EVENT;
  delete process.env.FORCE_MIDMATCH_MUTATOR;
});

describe('Battle Royale lifecycle', () => {
  it('ends with one living survivor and coherent deterministic placements', () => {
    const match = createBattleRoyaleMatch();
    activate(match);
    eliminate(match, 'player-0', 'player-3');
    match.update(0.05);
    eliminate(match, 'player-0', 'player-2');
    match.update(0.05);
    eliminate(match, 'player-0', 'player-1');

    expect(match.checkMatchEnd()).toBe(true);
    const result = match.getResult();
    expect(result.winnerId).toBe('player-0');
    expect(result.matchKind).toBe('battle_royale');
    expect(result.battleRoyale).toEqual({
      placements: [
        { playerId: 'player-0', placement: 1, status: 'winner' },
        { playerId: 'player-1', placement: 2, status: 'eliminated' },
        { playerId: 'player-2', placement: 3, status: 'eliminated' },
        { playerId: 'player-3', placement: 4, status: 'eliminated' },
      ],
      terminalReason: 'last_survivor',
      actions: { canLeave: true, canSpectate: false },
    });
    expect(result.wentToOvertime).toBe(false);
    expect(result.battleRoyale?.placements.find((row) => row.placement === 1)?.playerId).toBe(
      result.winnerId,
    );
  });

  it('projects stable live targets, secured placements, and killer context', () => {
    const match = createBattleRoyaleMatch(4);
    activate(match);
    eliminate(match, 'player-1', 'player-3');
    match.update(0.05);
    match.onPlayerDisconnect('player-2');

    expect(match.getBattleRoyaleSpectatorState()).toEqual({
      livingPlayerIds: ['player-0', 'player-1'],
      aliveCount: 2,
      standings: [
        {
          playerId: 'player-0',
          placement: 2,
          status: 'alive',
          eliminatedBy: null,
          eliminationCause: null,
        },
        {
          playerId: 'player-1',
          placement: 2,
          status: 'alive',
          eliminatedBy: null,
          eliminationCause: null,
        },
        {
          playerId: 'player-2',
          placement: 3,
          status: 'departed',
          eliminatedBy: null,
          eliminationCause: 'departure',
        },
        {
          playerId: 'player-3',
          placement: 4,
          status: 'eliminated',
          eliminatedBy: 'player-1',
          eliminationCause: 'combat',
        },
      ],
    });
    expect(match.getBattleRoyaleSpectatorExitResult()?.battleRoyale).toMatchObject({
      terminalReason: 'left_early',
      placements: expect.arrayContaining([
        { playerId: 'player-2', placement: 3, status: 'departed' },
        { playerId: 'player-3', placement: 4, status: 'eliminated' },
      ]),
    });
  });

  it('records a combat elimination after lethal damage has already marked the victim dead', () => {
    const match = createBattleRoyaleMatch(3);
    activate(match);
    match.players.get('player-2')!.isDead = true;
    eliminate(match, 'player-0', 'player-2');
    match.update(0.05);
    eliminate(match, 'player-0', 'player-1');

    expect(match.checkMatchEnd()).toBe(true);
    expect(match.getResult().battleRoyale?.placements).toEqual([
      { playerId: 'player-0', placement: 1, status: 'winner' },
      { playerId: 'player-1', placement: 2, status: 'eliminated' },
      { playerId: 'player-2', placement: 3, status: 'eliminated' },
    ]);
  });

  it('authors a true draw when the final fighters mutually eliminate in one tick', () => {
    const match = createBattleRoyaleMatch(3);
    activate(match);
    eliminate(match, 'player-0', 'player-2');
    match.update(0.05);
    eliminate(match, 'player-0', 'player-1');
    eliminate(match, 'player-1', 'player-0');

    expect(match.checkMatchEnd()).toBe(true);
    const result = match.getResult();
    expect(result.winnerId).toBeNull();
    expect(result.battleRoyale?.terminalReason).toBe('mutual_elimination');
    expect(result.battleRoyale?.placements).toEqual([
      { playerId: 'player-0', placement: 1, status: 'drawn' },
      { playerId: 'player-1', placement: 1, status: 'drawn' },
      { playerId: 'player-2', placement: 3, status: 'eliminated' },
    ]);
  });

  it('authors a true draw when the closing zone eliminates the final fighters together', () => {
    const match = createBattleRoyaleMatch(2);
    activate(match);
    for (const player of match.players.values()) {
      player.characterId = 'mighty_man';
      player.position = { x: 1, y: 1 };
      player.health = 2;
      player.armor = 0;
      player.invulnerableTimer = 0;
    }
    advance(match, 31);

    expect(match.phase).toBe(MatchPhase.ENDED);
    const result = match.getResult();
    expect(result.winnerId).toBeNull();
    expect(result.battleRoyale?.terminalReason).toBe('mutual_elimination');
    expect(result.battleRoyale?.placements).toEqual([
      { playerId: 'player-0', placement: 1, status: 'drawn' },
      { playerId: 'player-1', placement: 1, status: 'drawn' },
    ]);
    expect([...match.players.values()].every((player) => player.respawnTimer === 0)).toBe(true);
  });

  it('keeps a zone elimination ahead of a later departure in placement order', () => {
    const match = createBattleRoyaleMatch(3);
    activate(match);
    const exposed = match.players.get('player-2')!;
    exposed.characterId = 'mighty_man';
    exposed.position = { x: 1, y: 1 };
    exposed.health = 2;
    exposed.invulnerableTimer = 0;
    for (const id of ['player-0', 'player-1']) {
      const player = match.players.get(id)!;
      player.position = match.getBattleRoyaleSafeZoneState()!.center;
    }
    advance(match, 31);
    expect(exposed.isDead).toBe(true);
    match.onPlayerDisconnect('player-1');
    expect(match.checkMatchEnd()).toBe(true);
    expect(match.getResult().battleRoyale?.placements).toEqual([
      { playerId: 'player-0', placement: 1, status: 'winner' },
      { playerId: 'player-1', placement: 2, status: 'departed' },
      { playerId: 'player-2', placement: 3, status: 'eliminated' },
    ]);
  });

  it('starts exact one-second outside pulses only when preview becomes closing', () => {
    const match = createBattleRoyaleMatch(3);
    activate(match);
    const exposed = match.players.get('player-2')!;
    exposed.position = { x: -10_000, y: -10_000 };
    exposed.health = 100;
    exposed.armor = 0;
    exposed.invulnerableTimer = 0;

    advance(match, 11.95);
    expect(exposed.health).toBe(100);
    match.update(0.05);
    expect(match.getBattleRoyaleSafeZoneState()).toMatchObject({
      phaseIndex: 1,
      phase: 'closing',
      damagePerPulse: 2,
    });
    expect(exposed.health).toBe(98);
    advance(match, 1);
    expect(exposed.health).toBe(96);
  });

  it('advances two independent eight-fighter 20 Hz simulations through every phase', () => {
    const first = createBattleRoyaleMatch(8);
    const second = createBattleRoyaleMatch(8);
    activate(first);
    activate(second);
    for (const match of [first, second]) {
      for (const player of match.players.values()) {
        player.health = 1_000_000;
        player.invulnerableTimer = 0;
      }
    }

    const checkpoints = [6, 22, 38, 52, 67, 80, 92, 106, 116.05];
    const expectedPhases = [
      'preview',
      'closing',
      'hold',
      'closing',
      'hold',
      'closing',
      'hold',
      'final',
      'final',
    ];
    let elapsed = 0;
    for (let index = 0; index < checkpoints.length; index += 1) {
      const delta = checkpoints[index] - elapsed;
      advance(first, delta);
      advance(second, delta);
      elapsed = checkpoints[index];
      expect(first.getBattleRoyaleSafeZoneState()).toEqual(second.getBattleRoyaleSafeZoneState());
      expect(first.getBattleRoyaleSafeZoneState()?.phase).toBe(expectedPhases[index]);
    }
    expect(first.getBattleRoyaleSafeZoneState()).toMatchObject({
      phaseIndex: 7,
      phase: 'final',
      radius: 0,
      phaseSecondsRemaining: 0,
      damagePerPulse: 16,
    });
    expect(first.phase).toBe(MatchPhase.ACTIVE);
    expect([...first.players.values()].filter(({ isDead }) => !isDead)).toHaveLength(8);
  });

  it('keeps disconnect and elimination ordering stable without rewriting prior deaths', () => {
    const match = createBattleRoyaleMatch();
    activate(match);
    eliminate(match, 'player-0', 'player-3');
    match.onPlayerDisconnect('player-3');
    match.update(0.05);
    match.onPlayerDisconnect('player-2');
    match.update(0.05);
    eliminate(match, 'player-0', 'player-1');

    expect(match.checkMatchEnd()).toBe(true);
    expect(match.getResult().battleRoyale?.placements).toEqual([
      { playerId: 'player-0', placement: 1, status: 'winner' },
      { playerId: 'player-1', placement: 2, status: 'eliminated' },
      { playerId: 'player-2', placement: 3, status: 'departed' },
      { playerId: 'player-3', placement: 4, status: 'eliminated' },
    ]);
  });

  it('ends coherently with no winner when every entrant departs', () => {
    const match = createBattleRoyaleMatch(3);
    activate(match);
    match.onPlayerDisconnect('player-2');
    match.onPlayerDisconnect('player-0');
    match.onPlayerDisconnect('player-1');

    expect(match.checkMatchEnd()).toBe(true);
    const result = match.getResult();
    expect(result.winnerId).toBeNull();
    expect(result.battleRoyale?.terminalReason).toBe('all_departed');
    expect(result.battleRoyale?.placements).toEqual([
      { playerId: 'player-1', placement: 1, status: 'departed' },
      { playerId: 'player-0', placement: 2, status: 'departed' },
      { playerId: 'player-2', placement: 3, status: 'departed' },
    ]);
  });

  it('enforces one life and suppresses forced mutators and overtime', () => {
    process.env.FORCE_EVENT = 'big_heads';
    process.env.FORCE_MIDMATCH_MUTATOR = 'low_health';
    const match = createBattleRoyaleMatch();
    for (const [index, player] of [...match.players.values()].entries()) {
      player.characterId = CHARACTER_IDS[index % CHARACTER_IDS.length]!;
    }
    match.phase = MatchPhase.WAITING;
    match.startCountdown();
    match.update(MATCH.COUNTDOWN_DURATION + 0.01);
    expect(match.phase).toBe(MatchPhase.ACTIVE);

    eliminate(match, 'player-0', 'player-3');
    match.update(RESPAWN.DELAY + 1);
    const eliminated = match.players.get('player-3')!;
    expect(eliminated.isDead).toBe(true);
    expect(eliminated.respawnTimer).toBe(0);

    for (const player of match.players.values()) {
      if (!player.isDead) player.health = 1_000_000;
    }

    match.update(MATCH.TIME_LIMIT + 1);
    expect(match.phase).toBe(MatchPhase.ACTIVE);
    expect(match.isOvertime).toBe(false);
    expect(match.consumeTickOvertimeStart()).toBeNull();
    expect(match.activeMutators).toEqual([]);
    expect(match.consumeTickMutatorWarnings()).toEqual([]);
    expect(match.consumeTickMutatorStarts()).toEqual([]);
  });

  it('uses N-player-safe placement structures for an eight-entrant terminal result', () => {
    const match = createBattleRoyaleMatch(8);
    activate(match);
    for (let victim = 7; victim >= 1; victim -= 1) {
      // CombatManager applies lethal damage before Match receives the kill callback.
      match.players.get(`player-${victim}`)!.isDead = true;
      eliminate(match, 'player-0', `player-${victim}`);
      if (victim > 1) match.update(0.05);
    }
    expect(match.checkMatchEnd()).toBe(true);
    const placements = match.getResult().battleRoyale?.placements ?? [];
    expect(placements).toHaveLength(8);
    expect(new Set(placements.map((row) => row.playerId)).size).toBe(8);
    expect(placements.map((row) => row.placement)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('does not add Battle Royale fields to a standard result', () => {
    const standard = new Match('standard-byte-shape', makeMapData(), [
      { id: 'alpha', nickname: 'Alpha' },
      { id: 'bravo', nickname: 'Bravo' },
    ]);
    activate(standard);
    eliminate(standard, 'alpha', 'bravo');
    const serialized = JSON.parse(JSON.stringify(standard.getResult())) as Record<string, unknown>;
    expect(serialized).not.toHaveProperty('matchKind');
    expect(serialized).not.toHaveProperty('battleRoyale');
    expect(standard.getBattleRoyaleSafeZoneState()).toBeNull();
  });

  it('applies rarity after ordinary rifle falloff only for a coherent instance', () => {
    const match = createBattleRoyaleMatch(3);
    activate(match);
    const shooter = match.players.get('player-0')!;
    const victim = match.players.get('player-1')!;
    shooter.characterId = 'mighty_man';
    victim.characterId = 'mighty_man';
    shooter.position = { x: 100, y: 100 };
    victim.position = { x: 150, y: 100 };
    victim.invulnerableTimer = 0;
    equipBattleRoyaleGun(
      shooter,
      {
        instanceId: 'weapon:rifle:common',
        weaponId: 'rifle',
        rarity: 'common',
      },
      WEAPONS.rifle.magazineSize,
    );
    match.queueInput(shooter.id, fireInput(1));
    match.update(0.05);
    expect(match.getTickBulletTrails()[0].damageApplied).toBe(WEAPONS.rifle.damageMax * 0.8);

    const standard = new Match('standard-rifle-damage', makeMapData(), [
      { id: 'alpha', nickname: 'Alpha' },
      { id: 'bravo', nickname: 'Bravo' },
    ]);
    activate(standard);
    const alpha = standard.players.get('alpha')!;
    const bravo = standard.players.get('bravo')!;
    alpha.characterId = 'mighty_man';
    bravo.characterId = 'mighty_man';
    alpha.position = { x: 100, y: 100 };
    bravo.position = { x: 150, y: 100 };
    bravo.invulnerableTimer = 0;
    standard.queueInput(alpha.id, fireInput(1));
    standard.update(0.05);
    expect(standard.getTickBulletTrails()[0].damageApplied).toBe(WEAPONS.rifle.damageMax);

    alpha.weaponId = 'smg';
    alpha.specialAmmo = WEAPONS.smg.magazineSize;
    alpha.weaponInstance = {
      instanceId: 'weapon:standard:smg',
      weaponId: 'smg',
      rarity: 'mythical',
    };
    standard.queueInput(alpha.id, fireInput(2));
    standard.update(0.05);
    expect(standard.getTickBulletTrails()).toEqual([]);
    expect(alpha.specialAmmo).toBe(WEAPONS.smg.magazineSize);
  });

  it('fires the SMG burst and sniper while rejecting an incoherent new-gun instance', () => {
    const match = createBattleRoyaleMatch(4);
    activate(match);
    const shooter = match.players.get('player-0')!;
    const victim = match.players.get('player-1')!;
    shooter.characterId = 'mighty_man';
    victim.characterId = 'mighty_man';
    shooter.position = { x: 100, y: 100 };
    victim.position = { x: 250, y: 100 };
    victim.health = victim.maxHealth;
    victim.invulnerableTimer = 0;
    equipBattleRoyaleGun(
      shooter,
      { instanceId: 'weapon:inventory:smg', weaponId: 'smg', rarity: 'rare' },
      WEAPONS.smg.magazineSize,
    );
    shooter.weaponInstance = {
      instanceId: 'weapon:wrong',
      weaponId: 'sniper_rifle',
      rarity: 'rare',
    };
    match.queueInput(shooter.id, fireInput(1));
    match.update(0.05);
    expect(match.getTickBulletTrails()).toEqual([]);
    expect(shooter.specialAmmo).toBe(WEAPONS.smg.magazineSize);

    equipBattleRoyaleGun(
      shooter,
      { instanceId: 'weapon:smg', weaponId: 'smg', rarity: 'rare' },
      WEAPONS.smg.magazineSize,
    );
    match.queueInput(shooter.id, fireInput(2));
    match.update(0.05);
    match.update(0.3);
    expect(shooter.specialAmmo).toBe(WEAPONS.smg.magazineSize - WEAPONS.smg.burstSize);
    match.update(0.2);

    equipBattleRoyaleGun(
      shooter,
      { instanceId: 'weapon:sniper', weaponId: 'sniper_rifle', rarity: 'mythical' },
      WEAPONS.sniper_rifle.magazineSize,
    );
    victim.health = victim.maxHealth;
    victim.isDead = false;
    match.queueInput(shooter.id, fireInput(3));
    match.update(0.05);
    expect(victim.isDead).toBe(true);
    expect(match.getTickBulletTrails()[0]).toMatchObject({
      weaponId: 'sniper_rifle',
      hitPlayerId: victim.id,
    });
  });

  it('projects and resolves a launcher instance through server-owned flight', () => {
    const match = createBattleRoyaleMatch(3);
    activate(match);
    const shooter = match.players.get('player-0')!;
    const victim = match.players.get('player-1')!;
    shooter.characterId = 'mighty_man';
    victim.characterId = 'mighty_man';
    shooter.position = { x: 100, y: 100 };
    victim.position = { x: 250, y: 100 };
    victim.health = 10;
    victim.invulnerableTimer = 0;
    equipBattleRoyaleGun(
      shooter,
      { instanceId: 'weapon:launcher', weaponId: 'launcher', rarity: 'legendary' },
      1,
    );
    match.queueInput(shooter.id, fireInput(1));
    match.update(0.05);
    expect(match.getActiveRockets()).toHaveLength(1);
    expect(match.getActiveRockets()[0].weaponInstance).toEqual({
      instanceId: 'weapon:launcher',
      weaponId: 'launcher',
      rarity: 'legendary',
    });
    for (let tick = 0; tick < 10 && match.getActiveRockets().length > 0; tick += 1) {
      match.update(0.05);
    }
    expect(match.getActiveRockets()).toEqual([]);
    expect(victim.isDead).toBe(true);
    expect(match.stats.getStats(shooter.id).killsByWeapon.gun).toBe(1);
  });

  it('derives record eliminations and damage from opponent-only authority', () => {
    const match = createBattleRoyaleMatch(4);
    activate(match);
    const internals = match as unknown as {
      recordAttributedDamage(attackerId: string, victimId: string, damage: number): void;
    };
    internals.recordAttributedDamage('player-0', 'player-1', 99.9);
    internals.recordAttributedDamage('player-0', 'player-0', 40);
    internals.recordAttributedDamage('player-2', 'player-2', 80);
    eliminate(match, 'player-0', 'player-1');
    match.update(0.05);
    eliminate(match, 'player-2', 'player-2');
    match.update(0.05);
    match.onPlayerDisconnect('player-3', true);

    expect(Object.fromEntries(match.getBattleRoyaleRecordStats() ?? [])).toEqual({
      'player-0': { eliminations: 1, damage: 100 },
      'player-1': { eliminations: 0, damage: 0 },
      'player-2': { eliminations: 0, damage: 0 },
      'player-3': { eliminations: 0, damage: 0 },
    });
  });
});
